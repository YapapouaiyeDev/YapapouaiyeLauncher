// Loopback-only protocol fixture, not a Minecraft server. Explicit wire IDs are
// independent of the generated production table. Payload traffic is synthetic.
const net = require('node:net');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { EventEmitter, once } = require('node:events');
const { Reader, varint, readVarint, string, byteArray } = require('../src/network-client');
const { createEncryption } = require('../src/network-encryption');

const wires = {
  '1.21.1': { protocol: 767, position: 64, keepalive: 38, ping: 53, batch: 12, config: 105, cookie: 22, resource: 70, outboundKeepalive: 24, outboundPong: 39, outboundBatch: 8, outboundConfig: 12, outboundCookie: 17, outboundResource: 43 },
  '26.2': { protocol: 776, position: 72, keepalive: 44, ping: 61, batch: 11, config: 118, cookie: 21, resource: 81, outboundKeepalive: 28, outboundPong: 45, outboundBatch: 11, outboundConfig: 16, outboundCookie: 21, outboundResource: 49 },
};

async function fixture(version, { encryption = false, compression = true, reject = false, relaySupport = false, modQueries = false } = {}) {
  const wire = wires[version], peers = new Set(), events = new EventEmitter();
  const errors = [];
  const server = net.createServer(socket => {
    const peer = new EventEmitter();
    Object.assign(peer, { socket, state: 'handshake', buffer: Buffer.alloc(0), compression: false, sent: 0 });
    peers.add(peer);
    socket.on('error', () => {});
    socket.on('close', () => { peers.delete(peer); peer.emit('closed'); });
    peer.send = (id, ...parts) => {
      let packet = Buffer.concat([varint(id), ...parts]);
      if (peer.compression) packet = packet.length >= 64
        ? Buffer.concat([varint(packet.length), zlib.deflateSync(packet)])
        : Buffer.concat([varint(0), packet]);
      packet = Buffer.concat([varint(packet.length), packet]);
      if (peer.cipher) packet = peer.cipher.update(packet);
      socket.write(packet); peer.sent += packet.length;
    };
    peer.position = () => peer.send(wire.position, ...(version === '1.21.1'
      ? [Buffer.alloc(33), varint(7)] : [varint(7), Buffer.alloc(60)]));
    peer.success = () => {
      if (reject) { peer.send(0, string(JSON.stringify({ text: 'Mods requis' }))); return; }
      if (modQueries && !peer.queried) {
        peer.queried = true; peer.send(4, varint(41), string('test:login_query'));
        peer.state = 'query'; return;
      }
      if (compression) { peer.send(3, varint(64)); peer.compression = true; }
      peer.send(2, Buffer.from('00112233445566778899aabbccddeeff', 'hex'), string(peer.name), varint(0));
      peer.state = 'loginAck';
    };
    peer.handle = (id, reader) => {
      if (peer.state === 'handshake') {
        if (id !== 0 || reader.varint() !== wire.protocol) throw new Error('Wrong protocol handshake');
        reader.string(); reader.take(2);
        if (reader.varint() !== 2) throw new Error('Wrong next state');
        peer.state = 'login';
      } else if (peer.state === 'login') {
        if (id !== 0) throw new Error('Missing login start');
        peer.name = reader.string(); reader.take(16);
        if (encryption) {
          const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
          peer.privateKey = pair.privateKey;
          peer.challenge = crypto.randomBytes(4);
          peer.send(1, string(''), byteArray(pair.publicKey.export({ format: 'der', type: 'spki' })), byteArray(peer.challenge), Buffer.from([0]));
          peer.state = 'key';
        } else peer.success();
      } else if (peer.state === 'query') {
        if (id !== 2 || reader.varint() !== 41 || !reader.boolean() || reader.string() !== 'mod-ready') throw new Error('Missing mod login response');
        peer.success();
      } else if (peer.state === 'key') {
        if (id !== 1) throw new Error('Missing encryption response');
        // PKCS#1 v1.5 unpadding in the fixture avoids Node/OpenSSL differences
        // in privateDecrypt's implicit rejection support. Production only encrypts.
        const decrypt = value => {
          const padded = crypto.privateDecrypt({ key: peer.privateKey, padding: crypto.constants.RSA_NO_PADDING }, value);
          if (padded[0] !== 0 || padded[1] !== 2) throw new Error('Bad RSA padding');
          return padded.subarray(padded.indexOf(0, 2) + 1);
        };
        const secret = decrypt(reader.array());
        if (!decrypt(reader.array()).equals(peer.challenge)) throw new Error('Bad encrypted challenge');
        Object.assign(peer, createEncryption(secret));
        peer.success();
      } else if (peer.state === 'loginAck') {
        if (id !== 3) throw new Error('Missing login acknowledgement');
        peer.state = 'configuration';
        peer.send(14, varint(0));
      } else if (peer.state === 'configuration') {
        if (id === 0) {
          const expected = Buffer.from(version === '26.2' ? '0566725f66720202007f01000002' : '0566725f66720202007f010000', 'hex');
          if (!reader.buffer.subarray(reader.offset).equals(expected)) throw new Error('Wrong client information encoding');
        }
        if (id === 7) {
          if (reader.varint() !== 0) throw new Error('Unexpected known packs');
          if (modQueries) peer.send(1, string('test:configuration_query'), varint(13));
          else peer.send(3);
        } else if (id === 2 && modQueries) {
          if (reader.string() === 'test:configuration_query') {
            if (reader.varint() !== 13) throw new Error('Bad configuration mod reply');
            peer.send(3);
          }
        } else if (id === 3) {
          peer.state = 'game';
          if (relaySupport) peer.send(version === '26.2' ? 49 : 43, Buffer.alloc(4, 1));
          peer.position();
          if (relaySupport) peer.send(version === '26.2' ? 24 : 25, require('../src/session-relay').control(1));
          events.emit('connection', peer);
        }
      } else {
        peer.emit('packet', { id, data: reader.take(reader.buffer.length - reader.offset) });
        if (relaySupport && id === (version === '26.2' ? 22 : 18)) {
          const message = require('../src/session-relay').readControl(reader.buffer.subarray(1));
          if (message?.op === 2) {
            peer.refreshes = (peer.refreshes || 0) + 1;
            const { control } = require('../src/session-relay');
            const custom = version === '26.2' ? 24 : 25;
            peer.send(custom, control(3, message.nonce));
            peer.send(version === '26.2' ? 49 : 43, Buffer.alloc(4, 2));
            peer.position();
            peer.send(custom, control(4, message.nonce));
          }
        }
        if (id === wire.outboundConfig) { peer.state = 'configuration'; peer.send(14, varint(0)); }
      }
    };
    socket.on('data', bytes => {
      try {
        if (peer.decipher) bytes = peer.decipher.update(bytes);
        peer.buffer = Buffer.concat([peer.buffer, bytes]);
        for (;;) {
          const length = readVarint(peer.buffer);
          if (!length || peer.buffer.length < length.bytes + length.value) break;
          let packet = peer.buffer.subarray(length.bytes, length.bytes + length.value);
          peer.buffer = peer.buffer.subarray(length.bytes + length.value);
          if (peer.compression) {
            const reader = new Reader(packet), expanded = reader.varint();
            packet = reader.take(packet.length - reader.offset);
            if (expanded) packet = zlib.inflateSync(packet);
          }
          const reader = new Reader(packet);
          peer.handle(reader.varint(), reader);
        }
      } catch (error) { errors.push(error); socket.destroy(); }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { wire, peers, errors, events, port: server.address().port,
    async close() { for (const peer of peers) peer.socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}

module.exports = { fixture, wires };
