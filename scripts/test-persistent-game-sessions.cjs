const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile, spawnSync } = require('node:child_process');
const { PersistentGameSessions, RecoveredGame, isSessionProcess, markerFor } = require('../src/persistent-game-sessions');
const { GameSessions } = require('../src/game-sessions');

const record = () => ({ id: crypto.randomUUID(), accountUuid: 'account-one', accountName: 'Joueur',
  serverId: 'test', serverName: 'Serveur', mode: 'game', ram: 6, state: 'running', pid: 123 });
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-persistent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));
  return root;
}

test('only verified clients are restored; secrets never enter the session file', async t => {
  const file = path.join(temporary(t), 'sessions.json');
  const first = record(), exited = record();
  const registry = new PersistentGameSessions(file, async s => s.id === first.id);
  registry.save([{ ...first, access_token: 'private-token' }, exited,
    { ...record(), state: 'preparing', pid: undefined }, { ...record(), mode: 'network' }]);
  assert.equal(fs.readFileSync(file, 'utf8').includes('private-token'), false);
  const restored = await registry.recover();
  assert.deepEqual(restored, [first]);
  const sessions = new GameSessions(list => registry.save(list));
  sessions.restore(restored);
  assert.throws(() => sessions.begin({ uuid: first.accountUuid }, { id: 'test' }, 6, 16), /déjà lancé/);
  assert.throws(() => sessions.begin({ uuid: 'second' }, { id: 'test' }, 8, 16), /RAM insuffisante/);
  sessions.finish(first.id);
  assert.deepEqual(await registry.recover(), []);
});

test('a transient inspection failure never releases a live client reservation', async () => {
  let result = true;
  const game = new RecoveredGame(record(), async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  let closed = 0, errors = 0;
  game.on('close', () => closed++);
  game.on('monitor-error', () => errors++);
  try {
    await game.poll();
    result = new Error('CIM unavailable');
    await game.poll();
    assert.equal(errors, 1);
    assert.equal(closed, 0);
    result = false;
    await game.poll();
    await game.poll();
    assert.equal(closed, 1);
  } finally { clearInterval(game.timer); }
});

test('client survives parent launcher exit, writes logs and is recovered by a new registry', async t => {
  const root = temporary(t);
  const session = record();
  const moduleFile = require.resolve('../src/persistent-game-sessions');
  const sessionFile = path.join(root, 'sessions.json');
  const logFile = path.join(root, 'game.log');
  const parentFile = path.join(root, 'launcher.cjs');
  fs.writeFileSync(parentFile, `
    const { spawnIndependentGame, PersistentGameSessions } = require(${JSON.stringify(moduleFile)});
    const session = ${JSON.stringify(session)};
    const child = spawnIndependentGame(process.execPath,
      ['-e', 'console.log("started"); setInterval(() => console.log("alive"), 100)', '--', ${JSON.stringify(markerFor(session.id))}],
      ${JSON.stringify(root)}, ${JSON.stringify(logFile)});
    child.once('spawn', () => {
      session.pid = child.pid;
      new PersistentGameSessions(${JSON.stringify(sessionFile)}).save([session]);
      child.unref();
    });
  `);
  await new Promise((resolve, reject) => execFile(process.execPath, [parentFile], { timeout: 10000, windowsHide: true },
    error => error ? reject(error) : resolve()));
  const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))[0];
  t.after(() => { try { process.kill(saved.pid); } catch {} });
  assert.ok(await isSessionProcess(saved));
  assert.equal(await isSessionProcess({ ...saved, id: crypto.randomUUID() }), false, 'A reused or unrelated PID cannot be claimed');
  const registry = new PersistentGameSessions(sessionFile);
  assert.deepEqual(await registry.recover(), [saved]);
  const before = fs.statSync(logFile).size;
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(fs.statSync(logFile).size > before, 'Output keeps working after the launcher has exited');
  process.kill(saved.pid);
  const deadline = Date.now() + 5000;
  while (await isSessionProcess(saved)) {
    if (Date.now() > deadline) throw new Error('Fixture process did not exit');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  const monitor = new RecoveredGame(saved);
  monitor.once('close', () => registry.save([]));
  await monitor.poll();
  assert.deepEqual(await registry.recover(), []);
});

test('actual Java client survives Electron app.quit through ManagedLaunch', async t => {
  if (spawnSync('java', ['-version'], { windowsHide: true }).error) return t.skip('Java is unavailable');
  const root = temporary(t);
  const session = record();
  const sessionFile = path.join(root, 'sessions.json');
  const javaFile = path.join(root, 'Survivor.java');
  fs.writeFileSync(javaFile, 'class Survivor { public static void main(String[] args) throws Exception { while (true) { System.out.println("alive"); Thread.sleep(100); } } }');
  const parentFile = path.join(root, 'electron-launcher.cjs');
  const core = path.dirname(require.resolve('minecraft-java-core'));
  fs.writeFileSync(parentFile, `
    const { app } = require('electron');
    const { ManagedLaunch } = require(${JSON.stringify(require.resolve('../src/managed-launch'))});
    const { PersistentGameSessions } = require(${JSON.stringify(require.resolve('../src/persistent-game-sessions'))});
    const Args = require(${JSON.stringify(path.join(core, 'Minecraft/Minecraft-Arguments.js'))}).default;
    const Loader = require(${JSON.stringify(path.join(core, 'Minecraft/Minecraft-Loader.js'))}).default;
    Args.prototype.GetArguments = async () => ({ jvm: [], classpath: [], mainClass: ${JSON.stringify(javaFile)}, game: [] });
    Loader.prototype.GetArguments = async () => ({ jvm: [], game: [] });
    app.whenReady().then(async () => {
      const session = ${JSON.stringify(session)};
      const launcher = new ManagedLaunch();
      launcher.DownloadGame = async () => ({ minecraftJson: { id: 'test' }, minecraftVersion: 'test', minecraftJava: {}, minecraftLoader: null });
      launcher.once('spawn', pid => {
        session.pid = pid;
        new PersistentGameSessions(${JSON.stringify(sessionFile)}).save([session]);
      });
      await launcher.Launch({ sessionId: session.id, path: ${JSON.stringify(root)},
        authenticator: { name: 'Fixture', uuid: 'fixture' }, java: { path: 'java' }, loader: { type: null } });
      app.quit();
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  await new Promise((resolve, reject) => execFile(require('electron'), [parentFile], { timeout: 15000, windowsHide: true },
    (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve()));
  const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))[0];
  t.after(() => { try { process.kill(saved.pid); } catch {} });
  assert.ok(await isSessionProcess(saved));
  const logFile = path.join(root, `.launcher-session-${session.id}.log`);
  const deadline = Date.now() + 10000;
  while (!fs.readFileSync(logFile, 'utf8').includes('alive')) {
    if (Date.now() > deadline) throw new Error('Detached Java client did not start: ' + fs.readFileSync(logFile, 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(await new PersistentGameSessions(sessionFile).recover(), [saved]);
  process.kill(saved.pid);
});
