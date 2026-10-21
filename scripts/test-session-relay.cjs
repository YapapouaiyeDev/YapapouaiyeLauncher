const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { NetworkClient, Reader, varint, string } = require('../src/network-client');
const { SessionRelay, OPS, control, readControl } = require('../src/session-relay');
const { fixture } = require('./network-fixture.cjs');

const account = { name: 'RelayPlayer', uuid: '00112233445566778899aabbccddeeff' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const limit = Date.now() + 4000;
  while (!check()) { if (Date.now() >= limit) throw new Error('Relay condition timed out'); await pause(5); }
}

class Graphical extends NetworkClient {
  constructor(port, version, secret, wrongMod = false) {
    super({ host: '127.0.0.1', port, version, account });
    this.secret = secret; this.wrongMod = wrongMod; this.focused = 0;
  }
  async handle(id, reader) {
    const ids = this.protocol[this.state];
    if (this.state === 'login' && id === ids.CLIENTBOUND_CUSTOM_QUERY) {
      const transaction = reader.varint(), channel = reader.string();
      const proof = channel.startsWith('nexlux:relay_auth/')
        ? crypto.createHmac('sha256', this.secret).update(channel, 'ascii').digest()
        : string(this.wrongMod ? 'wrong-mod' : 'mod-ready');
      this.send(ids.SERVERBOUND_CUSTOM_QUERY_ANSWER, varint(transaction), Buffer.from([1]), proof);
      return;
    }
    if (this.state === 'configuration' && id === ids.CLIENTBOUND_CUSTOM_PAYLOAD) {
      const channel = reader.string();
      if (channel === 'test:configuration_query') {
        const number = reader.varint();
        // An asynchronous mod reply must precede FinishConfiguration, on both
        // initial connection and replay. A blind cached packet dump fails this.
        await pause(15);
        this.send(ids.SERVERBOUND_CUSTOM_PAYLOAD, string(channel), varint(number));
      }
      return;
    }
    if (this.state === 'game' && id === ids.CLIENTBOUND_CUSTOM_PAYLOAD) {
      const message = readControl(reader.take(reader.buffer.length - reader.offset));
      if (message?.op === OPS.EXIT) this.close();
      if (message?.op === OPS.FOCUS) this.focused++;
      return;
    }
    return super.handle(id, reader);
  }
}

for (const version of ['1.21.1', '26.2']) {
  test(`${version}: control → background → control preserves exactly one upstream login and socket`, { timeout: 15000 }, async t => {
    const server = await fixture(version, { encryption: true, relaySupport: true, modQueries: true });
    t.after(() => server.close());
    let joined = 0;
    server.events.on('connection', () => joined++);
    const secret = crypto.randomBytes(32).toString('hex');
    const relay = new SessionRelay({ host: '127.0.0.1', port: server.port, version, secret, account });
    t.after(() => relay.close());
    const endpoint = await relay.listen();
    let client = new Graphical(endpoint.port, version, secret);
    t.after(() => client.close());
    await client.start();
    await until(() => relay.status().canDetach);
    const peer = [...server.peers][0];
    const originalSocket = relay.upstream.socket;
    for (let index = 0; index < 3; index++) {
      relay.focus();
      await until(() => client.focused > 0);
      await relay.detach();
      await until(() => relay.phase === 'background');
      assert.equal(client.closed, true);
      assert.equal(server.peers.size, 1);
      assert.equal(peer.socket.destroyed, false);
      // A malicious local process cannot take control or cause another login.
      const unauthorized = new Graphical(endpoint.port, version, crypto.randomBytes(32).toString('hex'));
      await assert.rejects(unauthorized.start());
      assert.equal(server.peers.size, 1);
      client = new Graphical(endpoint.port, version, secret);
      await client.start();
      await until(() => relay.phase === 'control');
      assert.equal(relay.upstream.socket, originalSocket);
      assert.equal(joined, 1);
      assert.equal(peer.refreshes, index + 1);
      assert.equal(relay.upstream.closed, false);
      assert.equal(relay.expected.login.size, 1); // original mod handshake preserved
    }
    assert.deepEqual(server.errors, []);
  });
}

test('missing server support refuses detachment and preserves graphical control', { timeout: 10000 }, async t => {
  const server = await fixture('1.21.1'); t.after(() => server.close());
  const secret = crypto.randomBytes(32).toString('hex');
  const relay = new SessionRelay({ host: '127.0.0.1', port: server.port, version: '1.21.1', secret, account });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  const client = new Graphical(port, '1.21.1', secret); t.after(() => client.close());
  await client.start();
  await assert.rejects(relay.detach(), /compagnon NexLux/);
  assert.throws(() => relay.focus(), /compagnon NexLux/);
  assert.equal(client.closed, false);
  assert.equal(relay.upstream.closed, false);
});

test('changed client mods cannot corrupt or replace the persistent connection during resume', { timeout: 10000 }, async t => {
  const server = await fixture('26.2', { relaySupport: true, modQueries: true }); t.after(() => server.close());
  const secret = crypto.randomBytes(32).toString('hex');
  const relay = new SessionRelay({ host: '127.0.0.1', port: server.port, version: '26.2', secret, account });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  const first = new Graphical(port, '26.2', secret); t.after(() => first.close());
  await first.start(); await until(() => relay.status().canDetach);
  await relay.detach(); await until(() => relay.phase === 'background');
  const next = new Graphical(port, '26.2', secret, true);
  await assert.rejects(next.start());
  assert.equal(relay.upstream.closed, false);
  assert.equal(server.peers.size, 1);
  assert.equal(relay.phase, 'background');
});

test('a remote server cannot issue local EXIT/FOCUS commands', { timeout: 10000 }, async t => {
  const server = await fixture('26.2', { relaySupport: true }); t.after(() => server.close());
  const secret = crypto.randomBytes(32).toString('hex');
  const relay = new SessionRelay({ host: '127.0.0.1', port: server.port, version: '26.2', secret, account });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  const client = new Graphical(port, '26.2', secret); t.after(() => client.close());
  await client.start(); await until(() => relay.status().canDetach);
  [...server.peers][0].send(24, control(OPS.EXIT));
  [...server.peers][0].send(24, control(OPS.FOCUS));
  await pause(30);
  assert.equal(client.closed, false);
  assert.equal(client.focused, 0);
});

test('server reconfiguration while background waits for the real client and keeps the socket', { timeout: 10000 }, async t => {
  const server = await fixture('26.2', { relaySupport: true, modQueries: true }); t.after(() => server.close());
  const secret = crypto.randomBytes(32).toString('hex');
  const relay = new SessionRelay({ host: '127.0.0.1', port: server.port, version: '26.2', secret, account });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  const first = new Graphical(port, '26.2', secret); t.after(() => first.close());
  await first.start(); await until(() => relay.status().canDetach);
  await relay.detach(); await until(() => relay.phase === 'background');
  const peer = [...server.peers][0], socket = relay.upstream.socket;
  peer.send(server.wire.config);
  await until(() => relay.pendingConfiguration);
  const next = new Graphical(port, '26.2', secret); t.after(() => next.close());
  await next.start(); await until(() => relay.phase === 'control');
  assert.equal(relay.upstream.socket, socket);
  assert.equal(server.peers.size, 1);
  assert.equal(peer.refreshes, 1);
  assert.equal(relay.pendingConfiguration, false);
  assert.deepEqual(server.errors, []);
});

test('a transfer cannot bypass the relay by connecting the graphical client elsewhere', { timeout: 10000 }, async t => {
  const server = await fixture('26.2', { relaySupport: true }); t.after(() => server.close());
  const secret = crypto.randomBytes(32).toString('hex');
  const relay = new SessionRelay({ host: '127.0.0.1', port: server.port, version: '26.2', secret, account });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  const client = new Graphical(port, '26.2', secret); t.after(() => client.close());
  await client.start(); await until(() => relay.status().canDetach);
  const errors = [];
  relay.on('state', value => { if (value.error) errors.push(value.error); });
  [...server.peers][0].send(relay.protocol.game.CLIENTBOUND_TRANSFER, string('other.example'), varint(25565));
  await until(() => errors.length);
  assert.match(errors[0], /transfert/);
  assert.equal(client.closed, false);
  assert.equal(relay.upstream.closed, false);
  assert.equal(server.peers.size, 1);
});

test('cancelling a relay during listen rejects its endpoint and leaves no listener', async () => {
  const relay = new SessionRelay({ host: '127.0.0.1', port: 25565, version: '26.2', secret: crypto.randomBytes(32).toString('hex'), account });
  const listening = relay.listen();
  relay.close();
  await assert.rejects(listening, /annulé/);
  await pause(15);
  assert.equal(relay.server.listening, false);
  await assert.rejects(relay.listen(), /annulé/);
});
