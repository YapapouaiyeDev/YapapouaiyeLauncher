// Stationary Minecraft connection. No world, entity, inventory or terrain cache.
// Packet IDs are generated from Minecraft's own protocol registrations; see
// scripts/generate-network-protocols.ps1. This is a vanilla protocol client:
// servers requiring client mods may reject it, just as they reject vanilla.
const net = require('node:net');
const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const protocols = require('./network-protocols.json');
const { createEncryption } = require('./network-encryption');

const MAX_FRAME = 0x1fffff;
const MAX_INFLATED = 8 * 1024 * 1024;
const EMPTY = Buffer.alloc(0);

function varint(value) {
  const bytes = [];
  let n = value >>> 0;
  do { const byte = n & 127; n >>>= 7; bytes.push(byte | (n ? 128 : 0)); } while (n);
  return Buffer.from(bytes);
}

function readVarint(buffer, offset = 0) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buffer.length) return null;
    const byte = buffer[offset + i];
    if (i === 4 && (byte & 0xf0)) throw new Error('VarInt réseau invalide.');
    value |= (byte & 127) << (i * 7);
    if (!(byte & 128)) return { value: value | 0, bytes: i + 1 };
  }
  throw new Error('VarInt réseau trop long.');
}

const string = value => {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([varint(bytes.length), bytes]);
};
const byteArray = value => Buffer.concat([varint(value.length), value]);

class Reader {
  constructor(buffer) { this.buffer = buffer; this.offset = 0; }
  take(length) {
    if (!Number.isInteger(length) || length < 0 || this.offset + length > this.buffer.length) throw new Error('Paquet réseau tronqué.');
    const result = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  varint() {
    const result = readVarint(this.buffer, this.offset);
    if (!result) throw new Error('VarInt réseau tronqué.');
    this.offset += result.bytes;
    return result.value;
  }
  array(max = 32767) {
    const length = this.varint();
    if (length > max) throw new Error('Donnée réseau trop longue.');
    return this.take(length);
  }
  string(max = 32767) { return this.array(max).toString('utf8'); }
  boolean() { return this.take(1)[0] !== 0; }
}

function serverHash(serverId, secret, key) {
  const digest = crypto.createHash('sha1').update(serverId, 'latin1').update(secret).update(key).digest();
  let number = BigInt('0x' + digest.toString('hex'));
  if (digest[0] & 128) number -= 1n << 160n;
  return number.toString(16);
}

class NetworkClient extends EventEmitter {
  constructor({ host, port = 25565, version, account }) {
    super();
    if (!Object.hasOwn(protocols, version)) throw new Error('Le mode léger prend en charge Minecraft 1.21.1 et 26.2.');
    if (typeof host !== 'string' || !host.trim() || host.length > 253 || /[\s\0]/.test(host)) throw new Error('Adresse serveur invalide.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port serveur invalide.');
    if (!/^[A-Za-z0-9_]{1,16}$/.test(account?.name) || !/^[a-f0-9]{32}$/i.test(String(account?.uuid).replace(/-/g, ''))) throw new Error('Identité Minecraft invalide.');
    this.host = host.replace(/^\[|\]$/g, '');
    this.port = port;
    this.version = version;
    this.protocol = protocols[version];
    this.account = account;
    this.state = 'login';
    this.buffer = EMPTY;
    this.compression = null;
    this.closed = false;
    this.ready = false;
    this.processing = false;
    this.abort = new AbortController();
  }

  start() {
    if (this.closed) return Promise.reject(new Error('Connexion déjà fermée.'));
    if (this.started) return Promise.reject(new Error('Connexion déjà démarrée.'));
    this.started = true;
    const connected = new Promise((resolve, reject) => {
      const onReady = () => { this.removeListener('closed', onClose); resolve(); };
      const onClose = error => { this.removeListener('ready', onReady); reject(new Error(error || 'Connexion annulée.')); };
      this.once('ready', onReady);
      this.once('closed', onClose);
    });
    this.deadline = setTimeout(() => this.close('Connexion trop longue : le serveur peut exiger des mods client.'), 30000);
    this.connect().catch(() => this.close('Impossible de joindre le serveur.'));
    return connected;
  }

  async connect() {
    let host = this.host, port = this.port;
    if (port === 25565 && !net.isIP(host)) {
      try {
        const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
        records.sort((a, b) => a.priority - b.priority);
        if (records.length) { host = records[0].name; port = records[0].port; }
      } catch (error) {
        if (!['ENODATA', 'ENOTFOUND'].includes(error.code)) throw error;
      }
    }
    if (this.closed) return;
    this.socket = net.createConnection({ host, port });
    this.socket.setNoDelay(true);
    this.socket.setTimeout(60000, () => this.close('Le serveur ne répond plus.'));
    this.socket.on('error', () => this.close('Connexion réseau interrompue.'));
    this.socket.on('close', () => this.close('Connexion fermée par le serveur.'));
    this.socket.on('data', bytes => {
      if (this.closed) return;
      try {
        if (this.decipher) bytes = this.decipher.update(bytes);
        if (this.buffer.length + bytes.length > MAX_FRAME * 2) throw new Error('Tampon réseau trop volumineux.');
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, bytes]) : bytes;
        if (!this.processing) void this.drain();
      } catch (error) { this.close(error.message); }
    });
    this.socket.once('connect', () => {
      if (this.closed) return;
      const addressPort = Buffer.alloc(2); addressPort.writeUInt16BE(this.port);
      this.send(0, varint(this.protocol.protocol), string(this.handshakeHost()), addressPort, varint(2));
      this.send(this.protocol.login.SERVERBOUND_HELLO, string(this.account.name), Buffer.from(this.account.uuid.replace(/-/g, ''), 'hex'));
    });
  }

  handshakeHost() { return this.host; }

  async drain() {
    this.processing = true;
    try {
      while (!this.closed) {
        const length = readVarint(this.buffer);
        if (!length) break;
        if (length.value <= 0 || length.value > MAX_FRAME) throw new Error('Taille de paquet réseau invalide.');
        if (this.buffer.length < length.bytes + length.value) break;
        let packet = this.buffer.subarray(length.bytes, length.bytes + length.value);
        this.buffer = this.buffer.subarray(length.bytes + length.value);
        // Release the backing allocation when the last frame has been consumed.
        if (!this.buffer.length) this.buffer = EMPTY;
        if (this.compression !== null) {
          const input = new Reader(packet);
          const expanded = input.varint();
          packet = input.take(packet.length - input.offset);
          if (expanded < 0 || expanded > MAX_INFLATED) throw new Error('Paquet décompressé trop volumineux.');
          if (expanded) {
            if (expanded < this.compression) throw new Error('Compression réseau invalide.');
            packet = zlib.inflateSync(packet, { maxOutputLength: MAX_INFLATED });
            if (packet.length !== expanded) throw new Error('Taille décompressée invalide.');
          } else if (packet.length >= this.compression) throw new Error('Paquet non compressé invalide.');
        }
        const reader = new Reader(packet);
        const id = reader.varint();
        if (id < 0) throw new Error('Identifiant de paquet réseau invalide.');
        await this.handle(id, reader);
      }
    } catch (error) { this.close(error.message); }
    finally { this.processing = false; }
  }

  send(id, ...parts) {
    if (this.closed) return;
    if (!Number.isInteger(id)) throw new Error('Paquet non pris en charge pour cette version.');
    let packet = Buffer.concat([varint(id), ...parts]);
    if (this.compression !== null) packet = packet.length >= this.compression
      ? Buffer.concat([varint(packet.length), zlib.deflateSync(packet)])
      : Buffer.concat([varint(0), packet]);
    packet = Buffer.concat([varint(packet.length), packet]);
    if (this.cipher) packet = this.cipher.update(packet);
    if (this.socket.writableLength > 1024 * 1024) return this.close('Le serveur ne reçoit plus les réponses.');
    this.socket.write(packet);
  }

  async handle(id, reader) {
    const ids = this.protocol[this.state];
    if (this.state === 'login') {
      if (id === ids.CLIENTBOUND_LOGIN_DISCONNECT) return this.close('Connexion refusée par le serveur. Vérifiez le compte, la version et les mods requis.');
      if (id === ids.CLIENTBOUND_LOGIN_COMPRESSION) {
        const threshold = reader.varint();
        if (threshold < 0) throw new Error('Seuil de compression invalide.');
        this.compression = threshold;
      } else if (id === ids.CLIENTBOUND_HELLO) {
        await this.encrypt(reader);
      } else if (id === ids.CLIENTBOUND_CUSTOM_QUERY) {
        this.send(ids.SERVERBOUND_CUSTOM_QUERY_ANSWER, varint(reader.varint()), Buffer.from([0]));
      } else if (id === ids.CLIENTBOUND_COOKIE_REQUEST) {
        this.send(ids.SERVERBOUND_COOKIE_RESPONSE, string(reader.string()), Buffer.from([0]));
      } else if (id === (ids.CLIENTBOUND_LOGIN_FINISHED ?? ids.CLIENTBOUND_GAME_PROFILE)) {
        this.account = null;
        this.send(ids.SERVERBOUND_LOGIN_ACKNOWLEDGED);
        this.configure();
      }
      return;
    }
    if (id === ids.CLIENTBOUND_DISCONNECT) return this.close('Le serveur a déconnecté ce compte (des mods client peuvent être requis).');
    if (id === ids.CLIENTBOUND_KEEP_ALIVE) this.send(ids.SERVERBOUND_KEEP_ALIVE, reader.take(8));
    else if (id === ids.CLIENTBOUND_PING) this.send(ids.SERVERBOUND_PONG, reader.take(4));
    else if (id === ids.CLIENTBOUND_COOKIE_REQUEST) this.send(ids.SERVERBOUND_COOKIE_RESPONSE, string(reader.string()), Buffer.from([0]));
    else if (id === ids.CLIENTBOUND_TRANSFER) this.close('Le serveur demande un transfert : ouvrez le jeu pour continuer.');
    else if (id === ids.CLIENTBOUND_RESOURCE_PACK_PUSH) {
      const uuid = reader.take(16);
      reader.string(); reader.string();
      if (reader.boolean()) return this.close('Ce serveur exige un pack de ressources : ouvrez le jeu complet.');
      this.send(ids.SERVERBOUND_RESOURCE_PACK, uuid, varint(1)); // DECLINED, no download.
    } else if (this.state === 'configuration') {
      if (id === ids.CLIENTBOUND_SELECT_KNOWN_PACKS) this.send(ids.SERVERBOUND_SELECT_KNOWN_PACKS, varint(0));
      else if (id === ids.CLIENTBOUND_CODE_OF_CONDUCT) this.close('Ce serveur demande de lire et accepter ses règles dans le jeu complet.');
      else if (id === ids.CLIENTBOUND_FINISH_CONFIGURATION) {
        this.send(ids.SERVERBOUND_FINISH_CONFIGURATION);
        this.state = 'game';
      }
    } else if (id === ids.CLIENTBOUND_START_CONFIGURATION) {
      this.send(ids.SERVERBOUND_CONFIGURATION_ACKNOWLEDGED);
      this.configure();
    } else if (id === ids.CLIENTBOUND_LOGIN || id === ids.CLIENTBOUND_RESPAWN) {
      this.needsLoaded = true;
    } else if (id === ids.CLIENTBOUND_CHUNK_BATCH_FINISHED) {
      const rate = Buffer.alloc(4); rate.writeFloatBE(1); // Ask for small terrain batches; discard their contents.
      this.send(ids.SERVERBOUND_CHUNK_BATCH_RECEIVED, rate);
    } else if (id === ids.CLIENTBOUND_PLAYER_POSITION) {
      // 1.21.1: xyz doubles, yaw/pitch floats, relative flags, teleport ID.
      // 26.2: teleport ID first, then PositionMoveRotation and relative flags.
      if (this.version === '1.21.1') reader.take(33);
      const teleport = reader.varint();
      this.send(ids.SERVERBOUND_ACCEPT_TELEPORTATION, varint(teleport));
      clearTimeout(this.deadline);
      if (this.needsLoaded && ids.SERVERBOUND_PLAYER_LOADED !== undefined) this.send(ids.SERVERBOUND_PLAYER_LOADED);
      this.needsLoaded = false;
      if (!this.ready) {
        this.ready = true;
        // No movement/physics or anti-AFK behavior. The server's AFK rules apply.
        if (ids.SERVERBOUND_CLIENT_TICK_END !== undefined) this.ticks = setInterval(() => {
          if (this.state === 'game') this.send(ids.SERVERBOUND_CLIENT_TICK_END);
        }, 50);
        this.emit('ready');
      }
    }
    // Registry data, chunks, entities and other unsolicited state die here.
  }

  configure() {
    this.state = 'configuration';
    this.needsLoaded = true;
    clearTimeout(this.deadline);
    this.deadline = setTimeout(() => this.close('Configuration du serveur trop longue (mods client éventuellement requis).'), 30000);
    const ids = this.protocol.configuration;
    this.send(ids.SERVERBOUND_CLIENT_INFORMATION, string('fr_fr'), Buffer.from([2]), varint(2), Buffer.from([0, 127]), varint(1), Buffer.from([0, 0]), ...(this.version === '26.2' ? [varint(2)] : []));
    this.send(ids.SERVERBOUND_CUSTOM_PAYLOAD, string('minecraft:brand'), string('Yapapouaiye reseau leger'));
  }

  async encrypt(reader) {
    const serverId = reader.string(20);
    const publicKey = reader.array(8192);
    const challenge = reader.array(1024);
    const authenticate = reader.boolean();
    const secret = crypto.randomBytes(16);
    if (authenticate) {
      if (!this.account.access_token || this.account.access_token === 'offline') throw new Error('Ce serveur exige un compte Microsoft connecté.');
      let response;
      try {
        response = await fetch('https://sessionserver.mojang.com/session/minecraft/join', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accessToken: this.account.access_token, selectedProfile: this.account.uuid.replace(/-/g, ''), serverId: serverHash(serverId, secret, publicKey) }),
          signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
          redirect: 'error',
        });
      } catch { throw new Error('Authentification Minecraft indisponible.'); }
      if (response.status !== 204) { await response.body?.cancel(); throw new Error('Session Microsoft refusée. Reconnectez ce compte.'); }
    }
    if (this.closed) return;
    const key = crypto.createPublicKey({ key: publicKey, format: 'der', type: 'spki' });
    const encrypt = value => crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, value);
    this.send(this.protocol.login.SERVERBOUND_KEY, byteArray(encrypt(secret)), byteArray(encrypt(challenge)));
    Object.assign(this, createEncryption(secret));
    // Credentials are only needed for login, never retained with world state.
    this.account = null;
  }

  close(error = null) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.deadline);
    clearInterval(this.ticks);
    this.abort.abort();
    this.socket?.destroy();
    this.buffer = EMPTY;
    this.account = null;
    this.cipher = this.decipher = null;
    this.emit('closed', error);
  }
}

module.exports = { NetworkClient, protocols, varint, readVarint, string, byteArray, Reader, serverHash };
