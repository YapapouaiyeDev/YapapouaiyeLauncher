import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { issueAdminToken } from './functions/_lib/auth.js';

const { outputFiles } = await build({
  stdin: { resolveDir: fileURLToPath(new URL('.', import.meta.url)), contents: `
    import { onRequest as servers } from './functions/api/servers.js';
    import { onRequest as config } from './functions/api/launcher-config.js';
    import { onRequest as verify } from './functions/api/server-verify.js';
    import { onRequest as admin } from './functions/api/admin/servers/index.js';
    import { onRequest as edit } from './functions/api/admin/servers/[id].js';
    import { onRequest as adminConfig } from './functions/api/admin/launcher-config.js';
    export default { fetch(request, env) {
      const path = new URL(request.url).pathname;
      const handlers = { '/api/servers': servers, '/api/launcher-config': config, '/api/server-verify': verify, '/api/admin/servers': admin, '/api/admin/launcher-config': adminConfig };
      return (handlers[path] || edit)({ request, env, params: { id: path.split('/').pop() } });
    } };` },
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
const env = { ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'private-test-password', ADMIN_TOKEN_SECRET: 'private-test-signature' };
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: outputFiles[0].text, compatibilityDate: '2026-08-01', bindings: env, r2Buckets: { LAUNCHER_BUCKET: 'server-test' } }] }));
try {
  const bucket = await mf.getR2Bucket('LAUNCHER_BUCKET');
  // Only local fixtures: reuse the old R2 record format, without production codes.
  const legacy = { id: 'adoserv2', name: 'AdoServ II', host: 'example.test', pingPort: 25565, gamePort: 25565, defaultLoader: 'neoforge', gameVersion: '1.21.1', enabled: true, codesRequired: true, accessCodes: ['one', 'two', 'three'], apiType: 'gizmo', apiServerId: 'adoserv2', untouched: 'preserve me' };
  await bucket.put('servers.json', JSON.stringify([legacy]));
  await bucket.put('launcher-config.json', JSON.stringify({ maintenance: false, message: 'Existing message', untouched: 'preserve me' }));
  const token = await issueAdminToken(env);
  let ip = 0;
  async function request(path, method = 'GET', body, authorized = false) {
    const response = await mf.dispatchFetch(`http://localhost${path}`, { method, headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': `192.0.2.${++ip}`, ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const admin = (path, method = 'GET', body) => request(path, method, body, true);
  for (const [path, method] of [['/api/admin/servers', 'GET'], ['/api/admin/servers', 'POST'], ['/api/admin/servers/adoserv2', 'PUT'], ['/api/admin/servers/adoserv2', 'DELETE'], ['/api/admin/launcher-config', 'PUT']]) {
    assert.equal((await request(path, method, method === 'GET' ? undefined : {})).status, 401);
  }
  let publicList = (await request('/api/servers')).body;
  assert.equal(publicList.servers.length, 1);
  assert.equal(publicList.servers[0].codesCount, 3);
  assert.ok(!JSON.stringify(publicList).includes('accessCodes'));
  assert.ok(!JSON.stringify(publicList).includes('untouched'));
  assert.equal((await request('/api/server-verify', 'POST', { serverId: 'adoserv2', codes: ['one', 'two', 'three'] })).body.valid, true);
  assert.equal((await request('/api/server-verify', 'POST', { serverId: 'adoserv2', codes: ['three', 'two', 'one'] })).body.valid, false);
  assert.equal((await request('/api/server-verify', 'POST', { serverId: 'adoserv2', codes: [null, {}, []] })).body.valid, false);
  const edited = await admin('/api/admin/servers/adoserv2', 'PUT', { name: 'Renamed', gamePort: 30229 });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.server.gamePort, 30229);
  assert.deepEqual(edited.body.server.accessCodes, legacy.accessCodes);
  assert.equal(edited.body.server.untouched, 'preserve me');
  const before = await (await bucket.get('servers.json')).text();
  assert.equal((await admin('/api/admin/servers/adoserv2', 'PUT', { gamePort: 0 })).status, 400);
  assert.equal((await admin('/api/admin/servers/adoserv2', 'PUT', { codesRequired: 'false' })).status, 400);
  assert.equal((await admin('/api/admin/servers/adoserv2', 'PUT', { accessCodes: [] })).status, 400);
  assert.equal(await (await bucket.get('servers.json')).text(), before);
  const created = await admin('/api/admin/servers', 'POST', { name: 'New server', host: 'minecraft.example.test', modsRepoOwner: 'owner', modsRepoRepo: 'mods' });
  assert.equal(created.status, 201);
  assert.equal((await request('/api/servers')).body.servers.length, 2);
  const parallel = await Promise.all([admin('/api/admin/servers/adoserv2', 'PUT', { name: 'Concurrent name' }), admin('/api/admin/servers/adoserv2', 'PUT', { gamePort: 30230 })]);
  assert.ok(parallel.every(response => response.status === 200));
  const preserved = (await admin('/api/admin/servers')).body.servers.find(s => s.id === 'adoserv2');
  assert.equal(preserved.name, 'Concurrent name');
  assert.equal(preserved.gamePort, 30230);
  assert.equal((await admin('/api/admin/servers/adoserv2', 'DELETE')).status, 200);
  assert.ok(!(await admin('/api/admin/servers')).body.servers.some(s => s.id === 'adoserv2'));
  publicList = (await request('/api/servers')).body;
  assert.equal(publicList.servers.find(s => s.id === 'adoserv2').enabled, false, 'Deleted local defaults must stay hidden in the launcher');
  assert.equal((await request('/api/server-verify', 'POST', { serverId: 'adoserv2', codes: legacy.accessCodes })).status, 404);
  const config = await admin('/api/admin/launcher-config', 'PUT', { maintenance: true, message: 'Maintenance test' });
  assert.equal(config.status, 200);
  assert.equal(config.body.untouched, 'preserve me');
  assert.equal((await request('/api/launcher-config')).body.maintenance, true);
  const configRaw = await (await bucket.get('launcher-config.json')).text();
  assert.equal((await admin('/api/admin/launcher-config', 'PUT', { maintenance: 'false', message: '' })).status, 400);
  assert.equal(await (await bucket.get('launcher-config.json')).text(), configRaw);
  await bucket.put('servers.json', '{broken');
  assert.equal((await admin('/api/admin/servers', 'POST', { name: 'Do not overwrite', host: 'example.test' })).status, 503);
  assert.equal(await (await bucket.get('servers.json')).text(), '{broken');
  const html = readFileSync(new URL('./admin-dashboard.html', import.meta.url), 'utf8');
  for (const id of ['tab-servers', 'tab-invitations', 'admin-server-form', 'srv-input-codes', 'maintenance-enabled']) assert.ok(html.includes(`id="${id}"`));
  console.log('Serveurs: édition, configuration historique R2, codes privés, maintenance et concurrence validés.');
} finally { await mf.dispose(); }
