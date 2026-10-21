const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const accountKey = uuid => String(uuid || '').replace(/-/g, '').toLowerCase();

class GameSessions {
  constructor(onChange = () => {}) {
    this.sessions = new Map();
    this.onChange = onChange;
  }

  list() { return [...this.sessions.values()].map(session => ({ ...session })); }

  checkRam(ram, totalGB, ignoreId) {
    if (!Number.isInteger(ram) || ram < 2) throw new Error('Allocation RAM invalide (minimum 2 Go).');
    const budget = Math.max(0, Math.floor(totalGB) - 3);
    const reserved = this.list().filter(s => s.id !== ignoreId).reduce((sum, s) => sum + (s.ram || 0), 0);
    if (!Number.isFinite(budget) || reserved + ram > budget) {
      throw new Error(`RAM insuffisante : ${Math.max(0, budget - reserved)} Go disponibles pour une autre session (3 Go réservés au système).`);
    }
  }

  begin(account, server, ram, totalGB, mode = 'game') {
    const key = accountKey(account.uuid);
    if (!key) throw new Error('Compte invalide.');
    if (this.list().some(s => accountKey(s.accountUuid) === key)) throw new Error('Ce compte est déjà lancé.');
    if (this.list().some(s => s.state === 'preparing')) throw new Error('Un lancement est déjà en préparation. Patientez.');
    if (!['game', 'network'].includes(mode)) throw new Error('Mode de lancement invalide.');
    if (mode === 'game') {
      this.checkRam(ram, totalGB);
    }
    const session = { id: crypto.randomUUID(), accountUuid: account.uuid, accountName: account.name,
      serverId: server.id, serverName: server.name, mode,
      // RAM is the Java heap reservation, not a measurement of process memory.
      ram: mode === 'game' ? ram : null, state: 'preparing' };
    this.sessions.set(session.id, session);
    this.onChange(this.list());
    return session;
  }

  running(id, pid) {
    const session = this.sessions.get(id);
    if (!session || session.state === 'stopping') return;
    Object.assign(session, { state: 'running', pid });
    this.onChange(this.list());
  }

  stopping(id) {
    const session = this.sessions.get(id);
    if (!session || session.state === 'stopping') return;
    session.state = 'stopping';
    this.onChange(this.list());
  }

  disconnected(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, { connected: false, canDetach: false,
      state: session.state === 'closing' ? 'closing' : 'disconnected' });
    // The window still owns its Java RAM until the actual child close event.
    this.onChange(this.list());
  }

  closing(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.state = 'closing';
    this.onChange(this.list());
  }

  closeFailed(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.state = session.connected ? 'stopping' : 'disconnected';
    this.onChange(this.list());
  }

  relay(id, status = {}) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, { relay: true, canDetach: Boolean(status.canDetach), connected: Boolean(status.connected) });
    if (!['closing', 'disconnected'].includes(session.state)) {
      if (status.phase === 'detaching' || (status.phase === 'background' && session.pid)) session.state = 'stopping';
      else if (session.state !== 'stopping' && session.pid && ['connecting', 'attaching'].includes(status.phase)) session.state = 'preparing';
      else if (session.state !== 'stopping' && session.pid && status.phase === 'control') session.state = 'running';
    }
    this.onChange(this.list());
  }

  background(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, { mode: 'network', ram: null, state: 'running' });
    delete session.pid;
    this.onChange(this.list());
  }

  prepareControl(id, ram, totalGB) {
    const session = this.sessions.get(id);
    if (!session?.relay || session.mode !== 'network' || session.state !== 'running') throw new Error('Cette session n’est pas disponible pour reprendre le contrôle.');
    if (this.list().some(s => s.state === 'preparing')) throw new Error('Un lancement est déjà en préparation. Patientez.');
    this.checkRam(ram, totalGB, id);
    Object.assign(session, { mode: 'game', ram, state: 'preparing' });
    this.onChange(this.list());
    return session;
  }

  finish(id) {
    if (this.sessions.delete(id)) this.onChange(this.list());
  }
}

// Keep the existing Minecraft directory (including worlds) for the first account.
// Other accounts get private mutable files, while assets/libraries remain shared.
function prepareAccountInstance(gameDir, uuid, primaryUuid) {
  if (accountKey(uuid) === accountKey(primaryUuid)) return { directory: gameDir, instance: null };
  const hash = crypto.createHash('sha256').update(accountKey(uuid)).digest('hex');
  const instance = `accounts/${hash}`;
  const directory = path.join(gameDir, 'instances', instance);
  const marker = path.join(directory, '.launcher-profile-ready');
  if (!fs.existsSync(marker)) {
    fs.mkdirSync(directory, { recursive: true });
    for (const name of ['options.txt', 'config', 'resourcepacks', 'shaderpacks']) {
      const source = path.join(gameDir, name);
      if (fs.existsSync(source)) fs.cpSync(source, path.join(directory, name), { recursive: true, force: false });
    }
    fs.writeFileSync(marker, '1');
  }
  return { directory, instance };
}

async function fingerprintMods(directory) {
  const hash = crypto.createHash('sha256');
  if (!fs.existsSync(directory)) return hash.digest('hex');
  for (const name of fs.readdirSync(directory).filter(name => name.toLowerCase().endsWith('.jar')).sort()) {
    const file = crypto.createHash('sha256');
    for await (const bytes of fs.createReadStream(path.join(directory, name))) file.update(bytes);
    hash.update(name).update('\0').update(file.digest());
  }
  return hash.digest('hex');
}

module.exports = { GameSessions, accountKey, prepareAccountInstance, fingerprintMods };
