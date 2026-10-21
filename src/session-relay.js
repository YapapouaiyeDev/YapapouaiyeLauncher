// The upstream socket belongs to the launcher for the entire player session.
// A graphical client attaches over authenticated loopback. NexLux on the server
// rebuilds its state without a second login, logout or connection replacement.
const net = require('node:net');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const { NetworkClient, Reader, varint, readVarint, string } = require('./network-client');

const CHANNEL = 'nexlux:relay_session';
const OPS = Object.freeze({ CAPS: 1, RESYNC: 2, BEGIN: 3, END: 4, BACKGROUND: 5, DETACH: 6, EXIT: 7, FOCUS: 8, ERROR: 9, HELLO: 10 });
const NONE = Buffer.alloc(16);
const AUTH_ID = -2147483648;
const MAX_FRAME = 0x1fffff, MAX_INFLATED = 8 * 1024 * 1024;
const MAX_BOOTSTRAP = 8 * 1024 * 1024;
const EMPTY = Buffer.alloc(0);
const digest = (state, id, bytes) => crypto.createHash('sha256').update(state).update(varint(id)).update(bytes).digest('hex');
const control = (op, nonce = NONE) => Buffer.concat([string(CHANNEL), varint(1), varint(op), nonce]);
function readControl(bytes) {
  const reader = new Reader(bytes);
  if (reader.string() !== CHANNEL) return null;
  if (reader.varint() !== 1) throw new Error('Version du relais NexLux incompatible.');
  const op = reader.varint(), nonce = reader.take(16);
  if (reader.offset !== bytes.length || op < 1 || op > 10) throw new Error('Message de relais invalide.');
  return { op, nonce };
}

class Upstream extends NetworkClient {
  constructor(options, relay) { super(options); this.relay = relay; }
  handshakeHost() { return this.host + this.relay.handshakeSuffix; }
  async handle(id, reader) {
    const ids = this.protocol[this.state];
    // The real access token is used only by the backend to authenticate this
    // socket. It is never sent to, or replaced by, the graphical client.
    if (this.state === 'login' && [ids.CLIENTBOUND_HELLO, ids.CLIENTBOUND_LOGIN_COMPRESSION].includes(id)) return super.handle(id, reader);
    await this.relay.fromServer(this.state, id, reader.take(reader.buffer.length - reader.offset));
  }
}

class Frontend {
  constructor(relay, socket) {
    this.relay = relay; this.socket = socket; this.buffer = EMPTY;
    this.state = 'handshake'; this.mode = 'auth'; this.compression = false;
    this.closed = false; this.processing = false;
    socket.setNoDelay(true);
    socket.setTimeout(60000, () => this.close());
    this.deadline = setTimeout(() => this.close(), 10000);
    socket.on('error', () => this.close());
    socket.on('close', () => this.close());
    socket.on('data', bytes => {
      if (this.closed) return;
      if (this.buffer.length + bytes.length > MAX_FRAME * 2) return this.close();
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, bytes]) : bytes;
      if (!this.processing) void this.drain();
    });
  }
  async drain() {
    this.processing = true;
    try {
      while (!this.closed) {
        const frame = readVarint(this.buffer);
        if (!frame) break;
        if (frame.value < 1 || frame.value > MAX_FRAME) throw new Error('Trame locale invalide.');
        if (this.buffer.length < frame.bytes + frame.value) break;
        let bytes = this.buffer.subarray(frame.bytes, frame.bytes + frame.value);
        this.buffer = this.buffer.subarray(frame.bytes + frame.value);
        if (!this.buffer.length) this.buffer = EMPTY;
        if (this.compression) {
          const input = new Reader(bytes), size = input.varint();
          bytes = input.take(bytes.length - input.offset);
          if (size < 0 || size > MAX_INFLATED) throw new Error('Trame locale trop volumineuse.');
          if (size) {
            if (size < 256) throw new Error('Compression locale invalide.');
            bytes = zlib.inflateSync(bytes, { maxOutputLength: MAX_INFLATED });
            if (bytes.length !== size) throw new Error('Taille locale invalide.');
          } else if (bytes.length >= 256) throw new Error('Compression locale invalide.');
        }
        const reader = new Reader(bytes), id = reader.varint();
        if (id < 0) throw new Error('Identifiant local invalide.');
        await this.receive(id, reader);
      }
    } catch { this.close(); }
    finally { this.processing = false; }
  }
  send(id, body = EMPTY) {
    if (this.closed) return;
    let bytes = Buffer.concat([varint(id), body]);
    if (this.compression) bytes = bytes.length >= 256
      ? Buffer.concat([varint(bytes.length), zlib.deflateSync(bytes)])
      : Buffer.concat([varint(0), bytes]);
    if (bytes.length > MAX_FRAME || this.socket.writableLength > MAX_INFLATED) return this.close();
    this.socket.write(Buffer.concat([varint(bytes.length), bytes]));
  }
  async receive(id, reader) {
    const relay = this.relay;
    if (this.state === 'handshake') {
      if (id !== 0 || reader.varint() !== relay.protocol.protocol) return this.close();
      const host = reader.string(1024); reader.take(2);
      const next = reader.varint();
      if (next === 1) { this.state = 'status'; return; }
      if (next !== 2) return this.close();
      // Preserve NeoForge's original handshake marker, not the loopback host.
      const marker = host.indexOf('\0');
      this.suffix = marker < 0 ? '' : host.slice(marker);
      this.state = 'login';
      return;
    }
    if (this.state === 'status') {
      if (id === 0) this.send(0, string(JSON.stringify({ version: { name: relay.version, protocol: relay.protocol.protocol }, players: { max: 1, online: relay.upstream?.ready ? 1 : 0 }, description: { text: relay.name } })));
      else if (id === 1) { this.send(1, reader.take(8)); this.socket.end(); }
      return;
    }
    if (!this.authenticated) {
      if (!this.challenge) {
        if (id !== 0 || reader.string() !== relay.accountName || reader.take(16).toString('hex') !== relay.accountUuid) return this.close();
        if (relay.front && !relay.front.closed) return this.close();
        this.challenge = 'nexlux:relay_auth/' + crypto.randomBytes(16).toString('hex');
        this.send(relay.protocol.login.CLIENTBOUND_CUSTOM_QUERY, Buffer.concat([varint(AUTH_ID), string(this.challenge)]));
      } else {
        if (id !== relay.protocol.login.SERVERBOUND_CUSTOM_QUERY_ANSWER || reader.varint() !== AUTH_ID || !reader.boolean()) return this.close();
        const proof = reader.take(32), expected = crypto.createHmac('sha256', relay.secret).update(this.challenge, 'ascii').digest();
        if (reader.offset !== reader.buffer.length || !crypto.timingSafeEqual(proof, expected)) return this.close();
        this.authenticated = true;
        clearTimeout(this.deadline);
        this.deadline = setTimeout(() => this.close(), 120000);
        this.send(relay.protocol.login.CLIENTBOUND_LOGIN_COMPRESSION, varint(256));
        this.compression = true;
        await relay.attach(this);
      }
      return;
    }
    await relay.fromFrontend(this, this.state, id, reader.take(reader.buffer.length - reader.offset));
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.buffer = EMPTY;
    clearTimeout(this.deadline); clearInterval(this.pulse);
    this.socket.destroy(); this.relay.frontClosed(this);
  }
}

class SessionRelay extends EventEmitter {
  constructor(options) {
    super();
    // Reuse the network client's boundary validation before binding a listener.
    const validation = new NetworkClient(options); validation.close();
    if (!/^[a-f0-9]{64}$/.test(options.secret)) throw new Error('Clé locale du relais invalide.');
    this.options = { ...options }; this.secret = options.secret;
    this.version = options.version; this.protocol = validation.protocol;
    this.accountName = options.account.name;
    this.accountUuid = options.account.uuid.replace(/-/g, '').toLowerCase();
    this.name = options.serverName || 'Minecraft';
    this.closed = false; this.phase = 'waiting'; this.handshakeSuffix = '';
    this.bootstrap = { login: [], configuration: [] };
    this.expected = { login: new Map(), configuration: new Map() };
    this.replyBarrier = { login: [], configuration: [] }; this.replyCount = 0;
    this.bootstrapBytes = 0; this.cacheValid = true; this.snapshotComplete = false;
    this.serverCapable = false; this.candidates = new Set();
  }
  async listen() {
    if (this.closed) throw new Error('Relais annulé.');
    this.server = net.createServer(socket => {
      if (this.candidates.size >= 4) return socket.destroy();
      const frontend = new Frontend(this, socket); this.candidates.add(frontend);
    });
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        this.off('closed', cancelled);
        this.server.off('error', failed);
        this.server.off('listening', listening);
      };
      const cancelled = () => { cleanup(); reject(new Error('Relais annulé.')); };
      const failed = error => { cleanup(); reject(error); };
      const listening = () => { cleanup(); resolve(); };
      this.once('closed', cancelled);
      this.server.once('error', failed);
      this.server.once('listening', listening);
      this.server.listen(0, '127.0.0.1');
    });
    if (this.closed) throw new Error('Relais annulé.');
    this.server.on('error', () => this.close('Le relais local s’est arrêté.'));
    return { port: this.server.address().port };
  }
  status(error) {
    return { phase: this.phase, connected: Boolean(this.upstream?.ready), canDetach: Boolean(this.upstream?.ready && this.serverCapable && this.snapshotComplete && this.cacheValid), ...(error ? { error } : {}) };
  }
  changed(error) { this.emit('state', this.status(error)); }
  disableSnapshot() {
    this.cacheValid = false; this.bootstrap = { login: [], configuration: [] };
    this.expected = { login: new Map(), configuration: new Map() };
    this.replyBarrier = { login: [], configuration: [] }; this.bootstrapBytes = 0;
    this.changed();
  }
  save(state, id, body) {
    if (!this.cacheValid) return;
    const compressed = zlib.deflateRawSync(body);
    this.bootstrapBytes += compressed.length + 32;
    if (this.bootstrapBytes > MAX_BOOTSTRAP || this.bootstrap[state].length >= 4096) {
      this.disableSnapshot(); return;
    }
    this.bootstrap[state].push({ id, data: compressed, before: this.replyBarrier[state] });
    this.replyBarrier[state] = [];
  }
  replay(frontend, state) {
    frontend.remaining = new Map(this.expected[state]);
    frontend.replayPackets = this.bootstrap[state]; frontend.replayIndex = 0;
    frontend.observedReplies = new Map(); this.pumpReplay(frontend);
  }
  pumpReplay(frontend) {
    // Keep the original handshake's causal barriers. Never send a protocol
    // transition before the graphical client's mod/query replies have arrived.
    while (!frontend.closed && frontend.replayIndex < frontend.replayPackets.length) {
      const packet = frontend.replayPackets[frontend.replayIndex];
      const needed = new Map();
      for (const key of packet.before) needed.set(key, (needed.get(key) || 0) + 1);
      if ([...needed].some(([key, count]) => (frontend.observedReplies.get(key) || 0) < count)) return;
      for (const [key, count] of needed) frontend.observedReplies.set(key, frontend.observedReplies.get(key) - count);
      frontend.replayIndex++;
      frontend.send(packet.id, zlib.inflateRawSync(packet.data, { maxOutputLength: MAX_INFLATED }));
    }
  }
  async attach(frontend) {
    if (this.closed || (this.front && !this.front.closed)) return frontend.close();
    this.front = frontend;
    if (!this.upstream) {
      this.handshakeSuffix = frontend.suffix;
      frontend.mode = 'initial'; this.phase = 'connecting';
      this.upstream = new Upstream(this.options, this);
      this.options = null;
      this.upstream.once('closed', error => this.close(error));
      this.upstream.start().catch(() => {});
      this.tick = setInterval(() => {
        if (this.upstream.state === 'game' && (!this.front || this.front.mode !== 'live')) {
          const id = this.protocol.game.SERVERBOUND_CLIENT_TICK_END;
          if (id !== undefined) this.upstream.send(id);
        }
      }, 50);
    } else {
      if (!this.status().canDetach || this.upstream.state !== 'game') return frontend.close();
      frontend.mode = 'replay'; this.phase = 'attaching';
      this.replay(frontend, 'login');
    }
    this.changed();
    frontend.pulse = setInterval(() => {
      if (frontend.closed || !['configuration', 'game'].includes(frontend.state)) return;
      if (frontend.ping && Date.now() - frontend.pingAt > 60000) return frontend.close();
      if (!frontend.ping) {
        frontend.ping = crypto.randomBytes(8); frontend.pingAt = Date.now();
        frontend.send(this.protocol[frontend.state].CLIENTBOUND_KEEP_ALIVE, frontend.ping);
      }
    }, 10000);
  }
  rememberReply(state, id, body) {
    if (!this.cacheValid) return;
    const key = digest(state, id, body), map = this.expected[state];
    this.replyCount++;
    if (this.replyCount > 4096) { this.disableSnapshot(); return; }
    if (!map.has(key)) {
      this.bootstrapBytes += 96;
      if (map.size >= 4096 || this.bootstrapBytes > MAX_BOOTSTRAP) { this.disableSnapshot(); return; }
    }
    map.set(key, (map.get(key) || 0) + 1);
    this.replyBarrier[state].push(key);
  }
  validateReply(frontend, state, id, body) {
    const key = digest(state, id, body), count = frontend.remaining.get(key) || 0;
    if (!count) {
      this.changed('Le client ne correspond plus à la configuration de cette session. La connexion au serveur est conservée.');
      frontend.close(); return false;
    }
    if (count === 1) frontend.remaining.delete(key); else frontend.remaining.set(key, count - 1);
    frontend.observedReplies.set(key, (frontend.observedReplies.get(key) || 0) + 1);
    this.pumpReplay(frontend);
    return true;
  }
  sendControl(op, nonce) {
    if (this.upstream?.state === 'game') this.upstream.send(this.protocol.game.SERVERBOUND_CUSTOM_PAYLOAD, control(op, nonce));
  }
  idleSettings() {
    if (!this.settings || this.upstream?.state !== 'game') return;
    const bytes = Buffer.from(this.settings), reader = new Reader(bytes);
    reader.string(); bytes[reader.offset++] = 2; // small view distance
    bytes[reader.offset] = 2; // hidden chat; avoid unacknowledged signed messages
    this.upstream.send(this.protocol.game.SERVERBOUND_CLIENT_INFORMATION, bytes);
  }
  fromFrontend(frontend, state, id, body) {
    if (this.front !== frontend || this.closed) return;
    const ids = this.protocol[state], upstream = this.upstream;
    if (id === ids.SERVERBOUND_KEEP_ALIVE) {
      if (frontend.ping && body.equals(frontend.ping)) frontend.ping = null;
      return;
    }
    if (id === ids.SERVERBOUND_PONG) return; // upstream ping ownership stays here
    if (state === 'game' && id === ids.SERVERBOUND_CUSTOM_PAYLOAD) {
      const message = readControl(body);
      if (message) {
        if (message.op === OPS.DETACH) void this.detach().catch(error => this.changed(error.message));
        return; // a graphical client cannot issue server resynchronization or EXIT
      }
    }
    if (frontend.mode === 'detaching') return;
    let significant = true;
    if (state === 'configuration' && id === ids.SERVERBOUND_CLIENT_INFORMATION) { this.settings = Buffer.from(body); significant = false; }
    if (state === 'configuration' && id === ids.SERVERBOUND_CUSTOM_PAYLOAD) {
      const reader = new Reader(body);
      if (reader.string() === 'minecraft:brand') significant = false;
    }
    const finishLogin = state === 'login' && id === ids.SERVERBOUND_LOGIN_ACKNOWLEDGED;
    const finishConfig = state === 'configuration' && id === ids.SERVERBOUND_FINISH_CONFIGURATION;
    const replaying = frontend.mode === 'replay';
    if (replaying) {
      if ((finishLogin || finishConfig) && frontend.remaining.size) { frontend.close(); return; }
      if (!finishLogin && !finishConfig && significant && !this.validateReply(frontend, state, id, body)) return;
    } else if (['login', 'configuration'].includes(state) && significant && !finishLogin && !finishConfig) this.rememberReply(state, id, body);
    if (finishLogin) {
      if (!replaying) { upstream.send(id, body); upstream.state = 'configuration'; }
      frontend.state = 'configuration';
      if (replaying) this.replay(frontend, 'configuration');
      return;
    }
    if (finishConfig) {
      frontend.state = 'game';
      if (!replaying) {
        upstream.send(id, body); upstream.state = 'game';
        this.snapshotComplete = true;
        if (frontend.refreshAfterConfiguration) this.beginRefresh(frontend);
        else frontend.mode = 'live';
      } else if (this.pendingConfiguration) {
        // A server reload may have started while Java was absent. Let the real
        // client negotiate it before requesting any fresh world state.
        frontend.mode = 'await-configuration'; frontend.refreshAfterConfiguration = true;
        frontend.send(this.protocol.game.CLIENTBOUND_START_CONFIGURATION);
      } else {
        this.beginRefresh(frontend);
      }
      return;
    }
    if (replaying || (frontend.mode === 'resync' && !frontend.resyncStarted)) return;
    if (state === 'game' && id === ids.SERVERBOUND_CONFIGURATION_ACKNOWLEDGED) {
      this.pendingConfiguration = false;
      upstream.send(id, body); upstream.state = 'configuration'; frontend.state = 'configuration';
      frontend.mode = 'initial'; this.snapshotComplete = false;
      this.bootstrap.configuration = []; this.expected.configuration.clear();
      this.replyBarrier.configuration = [];
      this.replyCount = [...this.expected.login.values()].reduce((sum, count) => sum + count, 0);
      this.bootstrapBytes = this.bootstrap.login.reduce((sum, packet) => sum + packet.data.length + 32, 0);
      this.changed(); return;
    }
    if (state === 'game' && id === ids.SERVERBOUND_CLIENT_INFORMATION) this.settings = Buffer.from(body);
    if (state === 'game' && id === ids.SERVERBOUND_ACCEPT_TELEPORTATION) {
      frontend.confirmed = true;
      if (frontend.mode === 'resync' && frontend.resyncEnded) this.finishAttach(frontend);
    }
    upstream.send(id, body);
  }
  beginRefresh(frontend) {
    frontend.mode = 'resync'; frontend.refresh = crypto.randomBytes(16);
    this.refreshTimer = setTimeout(() => {
      if (this.front === frontend && frontend.mode === 'resync') {
        this.changed('Le serveur n’a pas terminé la reprise. La connexion est conservée.'); frontend.close();
      }
    }, 30000);
    if (this.settings) this.upstream.send(this.protocol.game.SERVERBOUND_CLIENT_INFORMATION, this.settings);
    this.sendControl(OPS.RESYNC, frontend.refresh);
  }
  finishAttach(frontend) {
    clearTimeout(this.refreshTimer); clearTimeout(frontend.deadline);
    frontend.mode = 'live'; this.phase = 'control';
    frontend.remaining = frontend.observedReplies = frontend.replayPackets = null;
    frontend.send(this.protocol.game.CLIENTBOUND_CUSTOM_PAYLOAD, control(OPS.CAPS));
    this.changed();
  }
  async fromServer(state, id, body) {
    const ids = this.protocol[state], upstream = this.upstream, frontend = this.front;
    if (id === ids.CLIENTBOUND_KEEP_ALIVE) { upstream.send(ids.SERVERBOUND_KEEP_ALIVE, new Reader(body).take(8)); return; }
    if (id === ids.CLIENTBOUND_PING) { upstream.send(ids.SERVERBOUND_PONG, new Reader(body).take(4)); return; }
    if (id === ids.CLIENTBOUND_TRANSFER) {
      // Forwarding this packet would let Minecraft leave the relay and create
      // another server connection behind the launcher's session registry.
      this.changed('Le serveur demande un transfert vers un autre serveur. La bascule conserve uniquement la connexion actuelle ; aucun transfert automatique n’est effectué.');
      return;
    }
    if (state === 'login' && id === ids.CLIENTBOUND_CUSTOM_QUERY) {
      const reader = new Reader(body); reader.varint();
      if (reader.string().startsWith('nexlux:relay_auth/')) return this.close('Le serveur utilise un canal local réservé.');
    }
    if (state === 'game' && id === ids.CLIENTBOUND_CUSTOM_PAYLOAD) {
      const message = readControl(body);
      if (message) {
        if (message.op === OPS.CAPS) {
          this.serverCapable = true;
          if (frontend?.mode === 'live' && this.status().canDetach) frontend.send(id, body);
          this.changed();
        } else if (frontend?.mode === 'resync' && message.nonce.equals(frontend.refresh)) {
          if (message.op === OPS.BEGIN) frontend.resyncStarted = true;
          else if (message.op === OPS.END) {
            frontend.resyncEnded = true;
            if (frontend.confirmed) this.finishAttach(frontend);
          } else if (message.op === OPS.ERROR) {
            this.changed('Le serveur a refusé la resynchronisation. La connexion est conservée.'); frontend.close();
          }
        }
        return; // remote servers can never send EXIT or FOCUS to the local client
      }
    }
    if (id === ids.CLIENTBOUND_DISCONNECT || id === ids.CLIENTBOUND_LOGIN_DISCONNECT) {
      if (frontend && !frontend.closed) frontend.send(id, body);
      this.close('Le serveur a déconnecté ce compte.'); return;
    }
    if (['login', 'configuration'].includes(state)) this.save(state, id, body);
    if (state === 'login' && id === (ids.CLIENTBOUND_LOGIN_FINISHED ?? ids.CLIENTBOUND_GAME_PROFILE)) upstream.account = null;
    if (state === 'game' && id === ids.CLIENTBOUND_PLAYER_POSITION) {
      clearTimeout(upstream.deadline);
      if (!upstream.ready) {
        upstream.ready = true; upstream.emit('ready');
        this.phase = 'control'; clearTimeout(frontend?.deadline); this.changed();
        if (this.status().canDetach && frontend?.mode === 'live') frontend.send(this.protocol.game.CLIENTBOUND_CUSTOM_PAYLOAD, control(OPS.CAPS));
      }
    }
    const live = frontend && !frontend.closed && (frontend.mode === 'initial' || frontend.mode === 'live' || (frontend.mode === 'resync' && frontend.resyncStarted));
    if (live) { frontend.send(id, body); return; }
    // No graphical client: keep only protocol liveness, never cache the world.
    if (state === 'game' && id === ids.CLIENTBOUND_PLAYER_POSITION) {
      const reader = new Reader(body);
      if (this.version === '1.21.1') reader.take(33);
      upstream.send(ids.SERVERBOUND_ACCEPT_TELEPORTATION, varint(reader.varint()));
      if (ids.SERVERBOUND_PLAYER_LOADED !== undefined) upstream.send(ids.SERVERBOUND_PLAYER_LOADED);
    } else if (state === 'game' && id === ids.CLIENTBOUND_CHUNK_BATCH_FINISHED) {
      const rate = Buffer.alloc(4); rate.writeFloatBE(1); upstream.send(ids.SERVERBOUND_CHUNK_BATCH_RECEIVED, rate);
    } else if (id === ids.CLIENTBOUND_COOKIE_REQUEST) {
      const reader = new Reader(body); upstream.send(ids.SERVERBOUND_COOKIE_RESPONSE, Buffer.concat([string(reader.string()), Buffer.from([0])]));
    } else if (state === 'game' && id === ids.CLIENTBOUND_START_CONFIGURATION) {
      // Never silently reconnect or pretend to negotiate a new mod pack while
      // no graphical client is present. The existing socket stays open.
      this.pendingConfiguration = true;
      this.changed('Le serveur demande une nouvelle configuration : reprenez le contrôle du compte.');
    }
  }
  async detach() {
    if (!this.status().canDetach) throw new Error('Le compagnon NexLux à jour doit être présent sur le serveur avant cette bascule.');
    const frontend = this.front;
    if (!frontend || frontend.closed) return;
    if (frontend.mode !== 'live' || this.upstream.state !== 'game') throw new Error('Attendez la fin du chargement du jeu.');
    frontend.mode = 'detaching'; this.phase = 'detaching';
    this.idleSettings(); this.sendControl(OPS.BACKGROUND);
    frontend.send(this.protocol.game.CLIENTBOUND_CUSTOM_PAYLOAD, control(OPS.EXIT));
    this.changed();
  }
  focus() {
    if (!this.front || this.front.mode !== 'live') throw new Error('Le client graphique n’est pas prêt.');
    if (!this.serverCapable) throw new Error('Le compagnon NexLux à jour doit être présent sur le serveur pour contrôler cette fenêtre.');
    this.front.send(this.protocol.game.CLIENTBOUND_CUSTOM_PAYLOAD, control(OPS.FOCUS));
  }
  frontClosed(frontend) {
    this.candidates.delete(frontend);
    if (this.front !== frontend) return;
    this.front = null; clearTimeout(this.refreshTimer);
    if (this.closed) return;
    if (!this.status().canDetach) return this.close('Le client graphique s’est fermé.');
    this.idleSettings(); this.sendControl(OPS.BACKGROUND);
    this.phase = 'background'; this.changed();
  }
  close(error = null) {
    if (this.closed) return;
    this.closed = true; clearInterval(this.tick); clearTimeout(this.refreshTimer);
    for (const frontend of this.candidates) frontend.close();
    this.server?.close(); this.upstream?.close();
    this.bootstrap = null; this.expected = null; this.options = null; this.secret = null;
    this.emit('closed', error);
  }
}

module.exports = { SessionRelay, OPS, CHANNEL, control, readControl };
