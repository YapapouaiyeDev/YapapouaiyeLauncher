// Run with node scripts/test-network-electron.cjs. The Node parent creates and
// removes the archive after Electron exits (Windows keeps ASAR handles open).
const { fixture } = require('./network-fixture.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

async function parent() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'network-electron-'));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  for (const file of ['network-sessions.js', 'network-worker.js', 'network-client.js', 'network-encryption.js', 'network-protocols.json', 'session-relay.js']) {
    fs.copyFileSync(path.join(__dirname, '../src', file), path.join(source, file));
  }
  fs.cpSync(path.dirname(require.resolve('aes-js/package.json')), path.join(source, 'node_modules/aes-js'), { recursive: true });
  const archive = path.join(root, 'app.asar');
  try {
    await require('@electron/asar').createPackage(source, archive);
    await new Promise((resolve, reject) => {
      const child = require('node:child_process').spawn(require('electron'), [__filename, root], { stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Electron probe exited ${code}`)));
    });
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('network-electron-')) throw new Error('Unexpected test cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function child() {
  const root = process.argv[2], archive = path.join(root, 'app.asar');
  const { NetworkClient, varint, string } = require(path.join(archive, 'network-client.js'));
  const { NetworkSessions } = require(path.join(archive, 'network-sessions.js'));
  const { readControl, OPS } = require(path.join(archive, 'session-relay.js'));
  const crypto = require('node:crypto');
  const account = { name: 'ElectronProbe', uuid: '00112233445566778899aabbccddeeff' };
  const waitFor = async check => {
    const deadline = Date.now() + 4000;
    while (!check()) { if (Date.now() > deadline) throw new Error('Electron relay timed out'); await new Promise(resolve => setTimeout(resolve, 5)); }
  };
  class Graphical extends NetworkClient {
    async handle(id, reader) {
      if (this.state === 'login' && id === 4) {
        const request = reader.varint(), channel = reader.string();
        const proof = crypto.createHmac('sha256', this.secret).update(channel, 'ascii').digest();
        this.send(2, varint(request), Buffer.from([1]), proof); return;
      }
      if (this.state === 'game' && id === this.protocol.game.CLIENTBOUND_CUSTOM_PAYLOAD) {
        if (readControl(reader.take(reader.buffer.length - reader.offset))?.op === OPS.EXIT) this.close();
        return;
      }
      return super.handle(id, reader);
    }
  }
  for (const version of ['1.21.1', '26.2']) {
    const server = await fixture(version, { encryption: true, relaySupport: true });
    let service, client;
    try {
      service = new NetworkSessions();
      const secret = crypto.randomBytes(32).toString('hex');
      const { port } = await service.openRelay('asar', { host: '127.0.0.1', port: server.port, version, account, secret });
      service.worker.once('error', error => console.error('Worker diagnostic:', error.message));
      const create = () => { const value = new Graphical({ host: '127.0.0.1', port, version, account }); value.secret = secret; return value; };
      client = create(); await client.start();
      await waitFor(() => service.relayStatus('asar')?.canDetach);
      const peer = [...server.peers][0];
      await service.detach('asar');
      await waitFor(() => service.relayStatus('asar')?.phase === 'background');
      client = create(); await client.start();
      await waitFor(() => service.relayStatus('asar')?.phase === 'control');
      assert.equal(server.peers.size, 1);
      assert.equal([...server.peers][0], peer);
      assert.equal(peer.refreshes, 1);
      assert.deepEqual(server.errors, []);
      await service.stop('asar');
      assert.equal(service.worker, null);
      console.log(`Electron 40 / ${version}: app.asar worker, AES fallback, same server socket through detach/resume passed.`);
    } finally {
      client?.close();
      await service?.stopAll();
      await server.close();
    }
  }
}

if (process.versions.electron) {
  const { app } = require('electron');
  app.whenReady().then(child).then(() => app.quit()).catch(error => { console.error(error.message); app.exit(1); });
} else parent().catch(error => { console.error(error.message); process.exitCode = 1; });
