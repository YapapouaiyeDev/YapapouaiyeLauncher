import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const bytes = Buffer.from('fixture jar bytes');
const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const md5 = createHash('md5').update(bytes).digest('hex');
let upstreamCalls = 0;
const { outputFiles } = await build({ stdin: { resolveDir: fileURLToPath(new URL('.', import.meta.url)), contents: `
  import { onRequest } from './functions/api/android-mods.js';
  export default { fetch(request, env) { return onRequest({request, env}); } };
` }, bundle: true, write: false, format: 'esm', platform: 'browser' });
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: outputFiles[0].text,
  compatibilityDate: '2026-08-01', bindings: { GITEA_TOKEN: 'private-fixture', B2_KEY_ID: 'b2-id', B2_APP_KEY: 'b2-secret' },
  r2Buckets: { LAUNCHER_BUCKET: 'android-test' }, outboundService: async request => {
    upstreamCalls++;
    const url = new URL(request.url);
    if (url.hostname === 'gitea.com') {
      assert.equal(request.headers.get('Authorization'), 'token private-fixture');
      if (url.pathname.endsWith('/contents')) return Response.json([{ name: 'sample.jar', type: 'file', size: bytes.length, sha }, { name: 'readme.md', type: 'file' }]);
      assert.ok(url.pathname.endsWith('/raw/sample.jar'));
      return new Response(bytes);
    }
    assert.equal(url.hostname, 's3.eu-central-003.backblazeb2.com');
    assert.match(request.headers.get('Authorization'), /^AWS4-HMAC-SHA256 Credential=b2-id\//);
    if (url.searchParams.has('list-type')) return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>mods/sample.jar</Key><Size>${bytes.length}</Size><ETag>&quot;${md5}&quot;</ETag></Contents></ListBucketResult>`);
    assert.equal(url.pathname, '/adoserv67/mods/sample.jar'); return new Response(bytes);
  } }] }));
try {
  const bucket = await mf.getR2Bucket('LAUNCHER_BUCKET');
  const server = { id: 'fixture', name: 'Test', gameVersion: '1.21.1', defaultLoader: 'fabric', modsRepoOwner: 'owner', modsRepoRepo: 'mods', codesRequired: true, accessCodes: ['secret'] };
  await bucket.put('servers.json', JSON.stringify([server, { ...server, id: 'adoserv67', modsRepoOwner: '', modsRepoRepo: '', codesRequired: false }, { id: 'vanilla', defaultLoader: 'vanilla', gameVersion: '1.21.1' }]));
  await bucket.put('launcher-config.json', JSON.stringify({ maintenance: false }));
  let sequence = 0;
  const request = (body, method = 'POST') => mf.dispatchFetch('http://localhost/api/android-mods', { method,
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': `192.0.2.${++sequence}` }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request({}, 'GET')).status, 405);
  assert.equal((await request({ serverId: 'missing' })).status, 404);
  assert.equal((await request({ serverId: 'fixture', codes: ['wrong'] })).status, 403);
  assert.equal(upstreamCalls, 0, 'Access checked before reaching private storage');
  const manifest = await (await request({ serverId: 'fixture', codes: ['secret'] })).json();
  assert.equal(manifest.files.length, 1); assert.equal(manifest.files[0].hash, sha);
  assert.ok(!JSON.stringify(manifest).includes('private-fixture')); assert.ok(!JSON.stringify(manifest).includes('secret'));
  assert.deepEqual(manifest.files[0], { name: 'sample.jar', size: bytes.length, hash: sha, algorithm: 'git-sha1' });
  assert.equal((await request({ serverId: 'fixture', codes: ['secret'], file: '../sample.jar' })).status, 400);
  assert.equal((await request({ serverId: 'fixture', codes: ['secret'], file: 'unknown.jar' })).status, 404);
  const download = await request({ serverId: 'fixture', codes: ['secret'], file: 'sample.jar' });
  assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  const b2 = await (await request({ serverId: 'adoserv67' })).json();
  assert.equal(b2.files[0].hash, md5); assert.equal(b2.files[0].algorithm, 'md5');
  assert.deepEqual(Buffer.from(await (await request({ serverId: 'adoserv67', file: 'sample.jar' })).arrayBuffer()), bytes);
  assert.deepEqual((await (await request({ serverId: 'vanilla' })).json()).files, []);
  const callsBeforeMaintenance = upstreamCalls;
  await bucket.put('launcher-config.json', JSON.stringify({ maintenance: true, message: 'Maintenance fixture' }));
  const maintenance = await request({ serverId: 'fixture', codes: ['secret'], file: 'sample.jar' });
  assert.equal(maintenance.status, 503); assert.equal((await maintenance.json()).error, 'Maintenance fixture');
  assert.equal(upstreamCalls, callsBeforeMaintenance);
  await bucket.put('launcher-config.json', JSON.stringify({ maintenance: false }));
  await bucket.put('servers.json', JSON.stringify([{ ...server, enabled: false }]));
  assert.equal((await request({ serverId: 'fixture', codes: ['secret'], file: 'sample.jar' })).status, 404);
  console.log('Android API: provider manifests/downloads, integrity, access, maintenance, disabled servers and path validation passed.');
} finally { await mf.dispose(); }
