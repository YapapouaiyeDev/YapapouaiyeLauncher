const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { NetworkClient, Reader, varint, string, serverHash } = require('../src/network-client');
const { NetworkSessions } = require('../src/network-sessions');
const { fixture } = require('./network-fixture.cjs');

const account = index => ({ uuid: index.toString(16).padStart(32, '0'), name: `Account${index}`, access_token: 'never-expose-me' });
const options = (port, version = '1.21.1', index = 1) => ({ host: '127.0.0.1', port, version, account: account(index) });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const packet = (peer, id) => new Promise(resolve => {
  const onPacket = data => { if (data.id === id) { peer.off('packet', onPacket); resolve(data.data); } };
  peer.on('packet', onPacket);
});

for (const version of ['1.21.1', '26.2']) {
  test(`${version}: encrypted/compressed login, keepalive, teleport, batches, cookie, reconfiguration and independent stop`, { timeout: 10000 }, async t => {
    const server = await fixture(version, { encryption: true });
    t.after(() => server.close());
    const clients = [new NetworkClient(options(server.port, version, 1)), new NetworkClient(options(server.port, version, 2))];
    t.after(() => clients.forEach(client => client.close()));
    await Promise.all(clients.map(client => client.start()));
    const [first, second] = [...server.peers];
    const { wire } = server;
    const keepalive = packet(first, wire.outboundKeepalive);
    first.send(wire.keepalive, Buffer.from('0102030405060708', 'hex'));
    assert.equal((await keepalive).toString('hex'), '0102030405060708');
    const pong = packet(first, wire.outboundPong);
    first.send(wire.ping, Buffer.from('fedcba98', 'hex'));
    assert.equal((await pong).toString('hex'), 'fedcba98');
    const teleport = packet(first, 0);
    first.position();
    assert.equal(new Reader(await teleport).varint(), 7);
    const batch = packet(first, wire.outboundBatch);
    first.send(wire.batch, Buffer.alloc(4));
    assert.equal((await batch).readFloatBE(), 1);
    const cookie = packet(first, wire.outboundCookie);
    first.send(wire.cookie, string('test:cookie'));
    assert.deepEqual(await cookie, Buffer.concat([string('test:cookie'), Buffer.from([0])]));
    const pack = packet(first, wire.outboundResource);
    first.send(wire.resource, Buffer.alloc(16), string('https://invalid.example/never-download'), string(''), Buffer.from([0, 0]));
    assert.deepEqual(await pack, Buffer.concat([Buffer.alloc(16), varint(1)]));
    const reconfigured = once(server.events, 'connection');
    first.send(wire.config);
    await reconfigured;
    const otherAlive = packet(second, wire.outboundKeepalive);
    clients[0].close();
    second.send(wire.keepalive, Buffer.alloc(8, 9));
    assert.deepEqual(await otherAlive, Buffer.alloc(8, 9));
    assert.equal(clients[1].closed, false);
    assert.equal(clients[1].account, null);
    assert.deepEqual(server.errors, []);
  });
}

test('shared worker owns many accounts, releases its last client, and restarts after failure', { timeout: 10000 }, async t => {
  const first = await fixture('1.21.1'), second = await fixture('26.2');
  t.after(() => Promise.all([first.close(), second.close()]));
  const closed = [];
  const service = new NetworkSessions((...args) => closed.push(args));
  t.after(() => service.stopAll());
  await Promise.all(Array.from({ length: 10 }, (_, index) => service.start(`s${index}`, options(index % 2 ? first.port : second.port, index % 2 ? '1.21.1' : '26.2', index + 1))));
  const worker = service.worker;
  assert.equal(service.entries.size, 10);
  await service.stop('s0');
  assert.equal(service.entries.size, 9);
  assert.equal(service.worker, worker);
  await worker.terminate();
  await pause(30);
  assert.equal(service.entries.size, 0);
  assert.equal(service.worker, null);
  assert.equal(closed.length, 10);
  assert.ok(!JSON.stringify(closed).includes('never-expose-me'));
  await service.start('new', options(second.port, '26.2', 11));
  assert.notEqual(service.worker, worker);
  await service.stop('new');
  assert.equal(service.worker, null);
  assert.deepEqual([...first.errors, ...second.errors], []);
});

test('rejected login and malformed/oversized compressed input release reservations without a ready signal', { timeout: 10000 }, async t => {
  const server = await fixture('1.21.1', { reject: true });
  t.after(() => server.close());
  const service = new NetworkSessions();
  await assert.rejects(service.start('rejected', options(server.port)), /refusée/);
  assert.equal(service.entries.size, 0);
  assert.equal(service.worker, null);
  const good = await fixture('1.21.1');
  t.after(() => good.close());
  const client = new NetworkClient(options(good.port));
  t.after(() => client.close());
  await client.start();
  const ended = once(client, 'closed');
  // Frame contains an expanded length over the fixed 8 MiB allocation limit.
  const data = varint(8 * 1024 * 1024 + 1);
  [...good.peers][0].socket.write(Buffer.concat([varint(data.length), data]));
  assert.match((await ended)[0], /volumineux/);
  assert.equal(client.buffer.length, 0);
});

test('cancelling an established socket before login completes stops the worker and permits the next launch', { timeout: 10000 }, async t => {
  const sockets = new Set();
  const server = require('node:net').createServer(socket => { sockets.add(socket); socket.on('error', () => {}); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => server.close(resolve)); });
  const service = new NetworkSessions();
  t.after(() => service.stopAll());
  const accepted = once(server, 'connection');
  const pending = service.start('cancelled', options(server.address().port));
  const rejected = assert.rejects(pending, /annulée/);
  await accepted;
  await service.stop('cancelled');
  await rejected;
  assert.equal(service.worker, null);
  assert.equal(service.entries.size, 0);
});

test('signed Minecraft SHA-1 and validation match protocol constraints', () => {
  // Published Minecraft SHA-1 signed formatting test vector.
  const crypto = require('node:crypto');
  const hash = crypto.createHash('sha1').update('Notch').digest('hex');
  assert.equal(hash, '4ed1f46bbe04bc756bcb17c0c7ce3e4632f06a48');
  assert.equal(serverHash('Notch', Buffer.alloc(0), Buffer.alloc(0)), hash);
  assert.equal(serverHash('jeb_', Buffer.alloc(0), Buffer.alloc(0)), '-7c9d5b0044c130109a5d7b5fb5c317c02b4e28c1');
  assert.throws(() => new NetworkClient(options(25565, '26.1')), /1.21.1 et 26.2/);
  assert.throws(() => new NetworkClient({ ...options(25565), host: 'localhost\0FML' }), /Adresse/);
  assert.throws(() => new NetworkClient(options(-1)), /Port/);
  assert.throws(() => new NetworkClient({ ...options(25565), account: { ...account(1), name: 'bad name' } }), /Identité/);
});

test('Electron AES fallback matches native CFB8 across packet and TCP fragment boundaries', () => {
  const crypto = require('node:crypto');
  const { Cfb8 } = require('../src/network-encryption');
  const key = crypto.randomBytes(16), plain = crypto.randomBytes(1024);
  const native = crypto.createCipheriv('aes-128-cfb8', key, key);
  const expected = native.update(plain);
  const fallback = new Cfb8(key);
  const actual = Buffer.concat([fallback.update(plain.subarray(0, 1)), fallback.update(plain.subarray(1, 777)), fallback.update(plain.subarray(777))]);
  assert.deepEqual(actual, expected);
  const decoder = new Cfb8(key, true);
  assert.deepEqual(Buffer.concat([decoder.update(actual.subarray(0, 15)), decoder.update(actual.subarray(15))]), plain);
});

test('fragmented and coalesced frames are processed once without retaining their allocations', { timeout: 10000 }, async t => {
  const server = await fixture('26.2', { compression: false });
  t.after(() => server.close());
  const client = new NetworkClient(options(server.port, '26.2'));
  t.after(() => client.close());
  await client.start();
  const peer = [...server.peers][0], replies = [];
  peer.on('packet', ({ id, data }) => { if (id === server.wire.outboundKeepalive) replies.push(data.toString('hex')); });
  const frame = number => Buffer.concat([varint(9), varint(server.wire.keepalive), Buffer.alloc(8, number)]);
  const first = frame(1);
  peer.socket.write(first.subarray(0, 1));
  await pause(10);
  peer.socket.write(first.subarray(1, 3));
  await pause(10);
  peer.socket.write(Buffer.concat([first.subarray(3), frame(2), frame(3)]));
  await pause(50);
  assert.deepEqual(replies, ['0101010101010101', '0202020202020202', '0303030303030303']);
  assert.equal(client.buffer.length, 0);
  assert.deepEqual(server.errors, []);
});

test('Microsoft join uses the fixed session endpoint, does not redirect, and releases credentials on refusal', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const { publicKey } = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 1024 });
  const { byteArray } = require('../src/network-client');
  const request = () => new Reader(Buffer.concat([string(''), byteArray(publicKey.export({ type: 'spki', format: 'der' })), byteArray(Buffer.from([1, 2, 3, 4])), Buffer.from([1])]));
  const client = new NetworkClient(options(25565));
  let sent;
  global.fetch = async (url, init) => { sent = { url, init }; return { status: 403, body: { cancel: async () => {} } }; };
  await assert.rejects(client.encrypt(request()), /Session Microsoft refusée/);
  assert.equal(sent.url, 'https://sessionserver.mojang.com/session/minecraft/join');
  assert.equal(sent.init.redirect, 'error');
  assert.equal(JSON.parse(sent.init.body).accessToken, 'never-expose-me');
  assert.equal(JSON.parse(sent.init.body).selectedProfile, account(1).uuid);
  client.close();
  assert.equal(client.account, null);
  assert.equal(sent.init.signal.aborted, true);
});

test('mandatory resources, conduct rules and transfers fail explicitly instead of accepting or navigating', async t => {
  for (const kind of ['pack', 'conduct', 'transfer']) {
    const client = new NetworkClient(options(25565, '26.2'));
    client.state = 'configuration';
    let error;
    client.once('closed', reason => { error = reason; });
    const id = kind === 'pack' ? 9 : kind === 'conduct' ? 19 : 11;
    const payload = kind === 'pack' ? Buffer.concat([Buffer.alloc(16), string('https://invalid.example/never-download'), string(''), Buffer.from([1, 0])]) : Buffer.alloc(0);
    await client.handle(id, new Reader(payload));
    assert.equal(client.closed, true);
    assert.match(error, /pack de ressources|règles|transfert/);
  }
});
