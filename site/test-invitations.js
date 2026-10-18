import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { issueAdminToken } from './functions/_lib/auth.js';

// Exercise the real Pages handlers in workerd with a real D1 binding.
const { outputFiles } = await build({
  stdin: {
    contents: `import { onRequest as verify } from './functions/api/invitation-verify.js';
      import { onRequest as admin } from './functions/api/admin/invitations.js';
      export default { fetch(request, env) { return new URL(request.url).pathname.startsWith('/api/admin/') ? admin({ request, env }) : verify({ request, env }); } };`,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
const env = { ADMIN_USERNAME: 'test-admin', ADMIN_PASSWORD: 'private-test-password', ADMIN_TOKEN_SECRET: 'invitation-test-secret' };
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: outputFiles[0].text, compatibilityDate: '2026-08-01', d1Databases: { INVITATIONS_DB: 'invitations-test' }, bindings: env }] }));
try {
  const db = await mf.getD1Database('INVITATIONS_DB');
  const schema = readFileSync(new URL('./migrations/invitations/0001_create_invitations.sql', import.meta.url), 'utf8');
  await db.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  // The migration can run again without deleting invitations.
  await db.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  const token = await issueAdminToken(env);
  const clientA = crypto.randomUUID();
  const clientB = crypto.randomUUID();
  async function request(path, method = 'GET', body, { authorized = false, ip = '192.0.2.1' } = {}) {
    const response = await mf.dispatchFetch(`http://localhost${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, ...(authorized ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  }
  const admin = (method, body) => request('/api/admin/invitations', method, body, { authorized: true });
  const verify = (code, clientId = clientA, ip = '192.0.2.1') => request('/api/invitation-verify', 'POST', { code, clientId }, { ip });
  assert.equal((await request('/api/admin/invitations')).status, 401);
  assert.equal((await request('/api/admin/invitations', 'POST', { label: 'Intrus', code: 'forbidden-code' })).status, 401);
  assert.equal((await request('/api/admin/invitations', 'DELETE', { id: 'test' })).status, 401);
  assert.equal((await admin('POST', { label: 'Alex', code: 'short' })).status, 400);
  const created = await admin('POST', { label: '<b>Alex</b>', code: 'Assigned-Code-123' });
  assert.equal(created.status, 201);
  assert.equal(created.body.code, 'Assigned-Code-123');
  assert.equal((await admin('POST', { label: 'Autre', code: created.body.code })).status, 409);
  const stored = await db.prepare('SELECT * FROM invitations WHERE id = ?').bind(created.body.id).first();
  assert.equal(stored.code_hash.length, 64);
  assert.ok(!JSON.stringify(stored).includes(created.body.code));
  const list = await admin('GET');
  assert.equal(list.body.invitations.length, 1);
  assert.ok(!('code_hash' in list.body.invitations[0]));
  assert.equal((await verify('')).status, 400);
  assert.equal((await verify('wrong-code')).body.retryAfter, 10);
  const cooldown = await verify(created.body.code);
  assert.equal(cooldown.body.code, 'INVITATION_COOLDOWN');
  assert.ok(cooldown.body.retryAfter > 0 && cooldown.body.retryAfter <= 10);
  // Simulate passage of the 10 seconds without making the test sleep.
  await db.prepare('UPDATE invitation_attempts SET retry_at = 0').run();
  assert.equal((await verify(`  ${created.body.code}  `)).body.success, true);
  assert.equal((await verify(created.body.code)).body.success, true); // lost response recovery
  assert.equal((await verify(created.body.code, clientB, '192.0.2.2')).body.code, 'INVITATION_INVALID');
  const revoked = await admin('POST', { label: 'Révoqué' });
  assert.equal((await admin('DELETE', { id: revoked.body.id })).body.success, true);
  assert.equal((await verify(revoked.body.code, clientB, '192.0.2.3')).body.code, 'INVITATION_INVALID');
  const race = await admin('POST', { label: 'Concurrent' });
  const results = await Promise.all([verify(race.body.code, clientA, '192.0.2.4'), verify(race.body.code, clientB, '192.0.2.5')]);
  assert.equal(results.filter(r => r.body.success).length, 1, 'Single-use redemption must be atomic');
  const sameIp = await Promise.all([verify('wrong-a', clientA, '192.0.2.6'), verify('wrong-b', clientB, '192.0.2.6')]);
  assert.equal(sameIp.filter(r => r.body.code === 'INVITATION_INVALID').length, 1);
  assert.equal(sameIp.filter(r => r.body.code === 'INVITATION_COOLDOWN').length, 1);
  const large = await request('/api/invitation-verify', 'POST', { clientId: clientA, code: 'a'.repeat(3000) });
  assert.equal(large.status, 400);
  assert.equal((await request('/api/invitation-verify')).status, 405);
  const offline = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: outputFiles[0].text, compatibilityDate: '2026-08-01', bindings: env }] }));
  try {
    const response = await offline.dispatchFetch('http://localhost/api/invitation-verify', { method: 'POST', body: '{}' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
  } finally { await offline.dispose(); }
  const defaults = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: outputFiles[0].text, compatibilityDate: '2026-08-01' }] }));
  try {
    const response = await defaults.dispatchFetch('http://localhost/api/admin/invitations');
    assert.equal(response.status, 503, 'Public development credentials must not manage invitations');
  } finally { await defaults.dispose(); }
  console.log('Invitations: administration, D1, délai de 10 s, révocation et concurrence validés.');
} finally { await mf.dispose(); }
