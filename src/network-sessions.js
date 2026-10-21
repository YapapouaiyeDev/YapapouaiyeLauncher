const path = require('node:path');
const { Worker } = require('node:worker_threads');
const crypto = require('node:crypto');
const protocols = require('./network-protocols.json');

class NetworkSessions {
  constructor(onClosed = () => {}, onRelayState = () => {}) {
    this.entries = new Map();
    this.worker = null;
    this.onClosed = onClosed;
    this.onRelayState = onRelayState;
  }

  static supports(version) { return Object.hasOwn(protocols, version); }

  start(id, options) {
    return this.open(id, options, false);
  }
  openRelay(id, options) { return this.open(id, options, true); }
  isRelay(id) { return Boolean(this.entries.get(id)?.relay); }
  relayStatus(id) { return this.entries.get(id)?.status; }

  open(id, options, relay) {
    if (this.entries.has(id)) return Promise.reject(new Error('Session réseau déjà lancée.'));
    if (!this.worker) {
      const worker = this.worker = new Worker(path.join(__dirname, 'network-worker.js'));
      worker.on('message', message => {
        if (worker !== this.worker) return;
        const entry = this.entries.get(message.id);
        if (!entry) return;
        if (message.event === 'ready' || message.event === 'listening') { entry.ready = true; entry.resolve(message.event === 'listening' ? { port: message.port } : undefined); }
        else if (message.event === 'closed') this.closed(message.id, message.error);
        else if (message.event === 'relay-state') { entry.status = message.state; this.onRelayState(message.id, message.state); }
        else if (message.event === 'reply') {
          const command = entry.commands.get(message.request);
          if (!command) return;
          entry.commands.delete(message.request);
          if (message.error) command.reject(new Error(message.error)); else command.resolve();
        }
      });
      const failed = () => {
        if (worker !== this.worker) return;
        for (const id of [...this.entries.keys()]) this.closed(id, 'Le service réseau s’est arrêté.');
      };
      worker.on('error', failed);
      worker.on('exit', failed);
    }
    const promise = new Promise((resolve, reject) => {
      let stopped;
      const completion = new Promise(done => { stopped = done; });
      this.entries.set(id, { resolve, reject, stopped, completion, relay, commands: new Map(), ready: false });
    });
    try { this.worker.postMessage({ action: relay ? 'relay' : 'start', id, options }); }
    catch { this.closed(id, 'Impossible de démarrer le service réseau.'); }
    return promise;
  }

  closed(id, error) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    if (!entry.ready) entry.reject(new Error(error || 'Connexion annulée.'));
    for (const command of entry.commands.values()) command.reject(new Error(error || 'Session arrêtée.'));
    entry.stopped();
    if (!this.entries.size) {
      const worker = this.worker;
      this.worker = null;
      if (worker) void worker.terminate();
    }
    this.onClosed(id, error, entry.ready);
  }

  detach(id) { return this.command(id, 'detach'); }
  focus(id) { return this.command(id, 'focus'); }
  command(id, action) {
    const entry = this.entries.get(id);
    if (!entry?.relay) return Promise.reject(new Error('Cette session ne possède pas de relais continu.'));
    const request = crypto.randomUUID();
    const result = new Promise((resolve, reject) => { entry.commands.set(request, { resolve, reject }); });
    try { this.worker.postMessage({ action, id, request }); }
    catch { this.closed(id, 'Le service réseau s’est arrêté.'); }
    return result;
  }

  async stop(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.worker.postMessage({ action: 'stop', id });
    await entry.completion;
  }

  async stopAll() { await Promise.all([...this.entries.keys()].map(id => this.stop(id))); }
}

module.exports = { NetworkSessions };
