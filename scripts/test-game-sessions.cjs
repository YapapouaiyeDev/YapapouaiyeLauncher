const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter, once } = require('node:events');
const { GameSessions, accountKey, prepareAccountInstance, fingerprintMods } = require('../src/game-sessions');
const { ManagedLaunch } = require('../src/managed-launch');
const { NetworkSessions } = require('../src/network-sessions');

const account = (uuid, microsoft = false) => ({ uuid, name: uuid, access_token: `secret-${uuid}`, meta: { type: microsoft ? 'microsoft' : 'offline' } });
const server = { id: 'test', name: 'Serveur Test', defaultLoader: 'vanilla', host: 'localhost', gamePort: 25565 };

test('sessions reserve RAM atomically, reject duplicates/preparation races, and close independently', () => {
  const updates = [];
  const sessions = new GameSessions(value => updates.push(value));
  const first = sessions.begin(account('one'), server, 6, 16);
  assert.throws(() => sessions.begin(account('ONE'), server, 6, 16), /déjà lancé/);
  assert.throws(() => sessions.begin(account('two'), server, 6, 16), /préparation/);
  sessions.running(first.id, 101);
  assert.throws(() => sessions.begin(account('two'), server, 8, 16), /RAM insuffisante/);
  const second = sessions.begin(account('two'), server, 6, 16);
  sessions.running(second.id, 102);
  sessions.finish(first.id);
  assert.equal(sessions.list().length, 1);
  assert.equal(sessions.list()[0].accountUuid, 'two');
  sessions.finish(first.id); // Late/duplicate close cannot release another session.
  assert.equal(sessions.list()[0].ram, 6);
  assert.equal(JSON.stringify(updates).includes('secret-'), false);
  sessions.finish(second.id);
  assert.equal(sessions.list().length, 0);
  for (const ram of [0, -2, 1.5, NaN, Infinity, '4']) assert.throws(() => sessions.begin(account('one'), server, ram, 16), /RAM/);
  assert.throws(() => sessions.begin(account('one'), server, 2, 2), /RAM insuffisante/);
});

test('account directories preserve legacy worlds and never overwrite another profile', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-accounts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'saves'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'saves/world'), 'world');
  fs.writeFileSync(path.join(root, 'options.txt'), 'renderDistance:12');
  fs.writeFileSync(path.join(root, 'config/hud.json'), 'original');
  assert.equal(prepareAccountInstance(root, 'primary', 'PRIMARY').directory, root);
  const second = prepareAccountInstance(root, '../../other', 'primary');
  assert.ok(second.directory.startsWith(path.join(root, 'instances', 'accounts') + path.sep));
  assert.equal(fs.readFileSync(path.join(second.directory, 'options.txt'), 'utf8'), 'renderDistance:12');
  assert.equal(fs.existsSync(path.join(second.directory, 'saves')), false);
  fs.writeFileSync(path.join(second.directory, 'options.txt'), 'renderDistance:8');
  fs.writeFileSync(path.join(second.directory, 'config/hud.json'), 'private');
  prepareAccountInstance(root, '../../other', 'primary');
  assert.equal(fs.readFileSync(path.join(second.directory, 'config/hud.json'), 'utf8'), 'private');
  assert.equal(fs.readFileSync(path.join(root, 'options.txt'), 'utf8'), 'renderDistance:12');
  assert.equal(fs.readFileSync(path.join(root, 'saves/world'), 'utf8'), 'world');
});

test('updating cached mods for a second account cannot modify the first account game files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-mod-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, 'cache');
  fs.mkdirSync(cache);
  fs.writeFileSync(path.join(cache, 'mod.jar'), 'version-one');
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('function stageModsForLaunch(');
  const implementation = source.slice(start, source.indexOf('\n}', start) + 2);
  const context = vm.createContext({ fs, path, gameDir: root, getServerModsDir: () => cache,
    listJarFiles: dir => fs.readdirSync(dir).filter(name => /\.jar$/i.test(name)),
    customModsDir: path.join(root, 'none'), injectClientCompanionMod() {}, console: { log() {} } });
  vm.runInContext(implementation, context);
  const first = path.join(root, 'first-mods'), second = path.join(root, 'second-mods');
  context.stageModsForLaunch('server', '1.21.1', 'vanilla', first);
  fs.writeFileSync(path.join(cache, 'mod.jar'), 'version-two');
  context.stageModsForLaunch('server', '1.21.1', 'vanilla', second);
  assert.equal(fs.readFileSync(path.join(first, 'mod.jar'), 'utf8'), 'version-one');
  assert.equal(fs.readFileSync(path.join(second, 'mod.jar'), 'utf8'), 'version-two');
});

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
function backend(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-multi-ipc-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { accounts: { accounts: [account('one', true), account('two')], activeIndex: 0 }, config: {}, launches: [],
    network: [], relays: [], stopped: [], diagnostics: [], maintenance: async () => ({ maintenance: false }), refresh: async a => ({ ...a, access_token: `fresh-${a.uuid}` }) };
  const handlers = {};
  const sessions = new GameSessions();
  const gameLaunchers = new Map(), relayProfiles = new Map(), relayEntries = new Map();
  const networkService = {
    start: async (id, options) => { env.network.push({ id, options }); if (env.networkError) throw new Error(env.networkError); },
    openRelay: async (id, options) => { env.relays.push({ id, options }); relayEntries.set(id, { connected: true, canDetach: true, phase: 'control' }); return { port: 26000 + env.relays.length }; },
    isRelay: id => relayEntries.has(id), relayStatus: id => relayEntries.get(id),
    stop: async id => { if (relayEntries.has(id)) { env.stopped.push(id); relayEntries.delete(id); } },
    focus: async () => {},
    detach: async id => { setImmediate(() => gameLaunchers.get(id)?.emit('close', 0)); },
  };
  class FakeLaunch extends EventEmitter {
    constructor() { super(); this.loaderId = 'neoforge-21.1.264'; this.exited = new Promise(resolve => this.once('close', resolve)); }
    waitForExit() { return this.exited; }
    async requestClose() {
      if (env.closeError) throw new Error(env.closeError);
      env.closeRequests = (env.closeRequests || 0) + 1;
      if (!env.holdClose) setImmediate(() => this.emit('close', 0));
    }
    async Launch(options) {
      this.options = options;
      env.launches.push(this);
      if (env.launchError) throw new Error(env.launchError);
      this.emit('spawn', 100 + env.launches.length);
    }
  }
  const context = vm.createContext({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    invitationGate: { required: () => env.invitation || null },
    loadAccounts: () => structuredClone(env.accounts), saveAccounts: data => { env.accounts = structuredClone(data); },
    loadConfig: () => ({ ...env.config }), saveConfig: patch => { Object.assign(env.config, patch); },
    authAccount: env.accounts.accounts[0], accountKey, structuredClone, gameSessions: sessions,
    sessionRecoveryError: null,
    skinForAccount: require('../src/account-avatars').skinForAccount,
    getAllServers: () => [server], getRemoteServerById: () => ({ ...server, codesRequired: env.codesRequired }),
    getFreshMaintenanceState: () => env.maintenance(), getMaintenanceState: () => ({ maintenance: false }),
    withTimeout: promise => promise, sessionVerifiedServers: new Set(), checkLaunchLockForGame: () => ({ allowed: !env.locked }),
    ManagedLaunch: FakeLaunch, Microsoft: class { refresh(a) { return env.refresh(a); } },
    NetworkSessions, networkSessions: networkService, gameLaunchers, relayProfiles, fingerprintMods, crypto: require('node:crypto'),
    isMicrosoftAccount: a => a?.meta?.type === 'microsoft', normalizeLoader: () => env.loader || 'vanilla',
    prepareAccountInstance, gameDir: root, path, fs, os: { totalmem: () => 16 * 1024 ** 3 },
    ensureServerInList() {}, syncClientOptionsToMinecraft() {}, getServerGameVersion: () => env.version || '1.21.1',
    getServerLaunchArgs: () => [], stageModsForLaunch: (...args) => { env.staged = args; return { staged: 1, failed: 0 }; },
    sendToRenderer() {}, mainWindow: null, loadLaunchLock: () => ({ enabled: false }),
    getClientModsConfig: () => ({}), console: { log() {}, warn() {}, error() {} },
    logToFile: (level, message) => env.diagnostics.push({ level, message }),
  });
  const start = source.indexOf('ipcMain.handle("launch-game",');
  vm.runInContext(source.slice(start, source.indexOf('// Multi-Server IPC Handlers', start)).replace(/\/\/ =+\s*$/, ''), context);
  for (const name of ['get-accounts', 'remove-account', 'stop-network-session', 'close-game-session']) {
    const start = source.indexOf(`ipcMain.handle("${name}",`);
    vm.runInContext(source.slice(start, source.indexOf('\nipcMain.handle(', start + 1)), context);
  }
  return { env, context, sessions, handlers, launch: options => handlers['launch-game'](null, { serverId: 'test', ram: 6, ...options }) };
}

test('a clean Java exit preserves its final output for diagnosing an unexpected closure', async t => {
  const b = backend(t);
  await b.launch({ accountUuid: 'one' });
  const launcher = b.env.launches[0];
  launcher.emit('data', 'old output'.repeat(10000));
  launcher.emit('data', 'Final disconnection explanation');
  launcher.emit('close', 0);
  const entry = b.env.diagnostics.find(item => item.level === 'GAME');
  assert.match(entry.message, /code 0/);
  assert.match(entry.message, /Final disconnection explanation$/);
  assert.ok(entry.message.length < 65536 + 200, 'Output tail is bounded even in a long game');
  assert.equal(b.sessions.list().length, 0);
});

test('launch IPC snapshots the requested account and refreshes its token despite account switching', async t => {
  const b = backend(t);
  let refreshStarted, finishRefresh;
  const started = new Promise(resolve => { refreshStarted = resolve; });
  b.env.refresh = a => { refreshStarted(); return new Promise(resolve => { finishRefresh = () => resolve({ ...a, access_token: 'fresh-one' }); }); };
  const first = b.launch({ accountUuid: 'one' });
  await started;
  b.context.authAccount = b.env.accounts.accounts[1];
  b.env.accounts.activeIndex = 1;
  finishRefresh();
  assert.equal((await first).success, true);
  assert.equal(b.env.launches[0].options.authenticator.uuid, 'one');
  assert.equal(b.env.accounts.accounts[0].access_token, 'fresh-one');
  assert.equal(b.env.accounts.accounts[1].access_token, 'secret-two');
  assert.equal(b.env.accounts.activeIndex, 1);
  assert.equal(b.context.authAccount.uuid, 'two');
  assert.equal((await b.launch({ accountUuid: 'two' })).success, true);
  assert.notEqual(b.env.launches[0].options.instance, b.env.launches[1].options.instance);
  assert.equal(b.sessions.list().length, 2);
  b.env.launches[0].emit('close', 0);
  assert.deepEqual(b.sessions.list().map(s => s.accountUuid), ['two']);
});

test('launch IPC keeps invitation, maintenance, password and access-code gates and releases failed reservations', async t => {
  const b = backend(t);
  b.env.invitation = { success: false, code: 'INVITATION_REQUIRED' };
  assert.equal((await b.launch()).code, 'INVITATION_REQUIRED');
  b.env.invitation = null;
  b.env.maintenance = async () => ({ maintenance: true });
  assert.equal((await b.launch()).code, 'LAUNCH_MAINTENANCE');
  assert.equal(b.sessions.list().length, 0);
  b.env.maintenance = async () => ({ maintenance: false });
  b.env.locked = true;
  assert.equal((await b.launch()).code, 'LAUNCH_LOCKED');
  b.env.locked = false;
  b.env.codesRequired = true;
  assert.equal((await b.launch()).code, 'SERVER_CODES_REQUIRED');
  b.env.codesRequired = false;
  b.env.refresh = async () => ({ error: 'expired' });
  assert.equal((await b.launch()).success, false);
  b.env.launchError = 'spawn failed';
  assert.equal((await b.launch({ accountUuid: 'two' })).success, false);
  assert.equal(b.sessions.list().length, 0);
  assert.equal((await b.launch({ accountUuid: 'missing' })).success, false);
});

test('running accounts cannot be removed and account/session APIs never expose tokens', async t => {
  const b = backend(t);
  await b.launch({ accountUuid: 'one' });
  b.env.accounts.accounts[0].profile = { skins: [{ state: 'ACTIVE', base64: 'data:image/png;base64,aGVsbG8=' }] };
  const projection = b.handlers['get-accounts']();
  assert.equal(projection.accounts[0].skin, 'data:image/png;base64,aGVsbG8=');
  assert.equal('profile' in projection.accounts[0], false);
  assert.equal(JSON.stringify(projection).includes('secret-'), false);
  assert.equal(JSON.stringify(projection).includes('fresh-'), false);
  assert.equal(projection.sessions[0].state, 'running');
  assert.equal((await b.handlers['remove-account'](null, 0)).success, false);
  assert.equal((await b.handlers['remove-account'](null, 1)).success, true);
  assert.equal(b.sessions.list().length, 1);
});



test('removed network mode is rejected before creating a session or worker', async t => {
  const b = backend(t);
  assert.equal((await b.launch({ accountUuid: 'one', mode: 'network' })).success, false);
  assert.equal(b.sessions.list().length, 0);
  assert.equal(b.env.network.length, 0);
  assert.equal(b.env.relays.length, 0);
});

test('direct NeoForge sessions request standby only after another graphical client', async t => {
  const b = backend(t);
  b.env.loader = 'neoforge';
  b.env.version = '26.2';
  assert.equal((await b.launch({ accountUuid: 'one' })).success, true);
  assert.equal(b.env.launches[0].options.JVM_ARGS?.includes('-Dnexlux.standbyOnJoin=true') || false, false);
  assert.equal(b.env.launches[0].options.memory.min, '256M');
  assert.equal(b.env.relays.length, 0);
  assert.equal(b.env.launches[0].options.JVM_ARGS?.some(arg => arg.startsWith('-Dnexlux.relayControl=')) || false, false);
  assert.equal((await b.launch({ accountUuid: 'two' })).success, true);
  assert.ok(b.env.launches[1].options.JVM_ARGS.includes('-Dnexlux.standbyOnJoin=true'));
  b.env.launches.forEach(launcher => launcher.emit('close', 0));
  assert.equal((await b.launch({ accountUuid: 'two' })).success, true);
  assert.equal(b.env.launches[2].options.JVM_ARGS?.includes('-Dnexlux.standbyOnJoin=true') || false, false);
});




test('managed launcher finishes a failed download before allowing another preparation', async t => {
  const launcher = new ManagedLaunch();
  let completeDownload;
  let completed = false;
  launcher.DownloadGame = async () => {
    launcher.emit('error', new Error('download failed'));
    await new Promise(resolve => { completeDownload = resolve; });
    completed = true;
  };
  let settled = false;
  const result = launcher.Launch({ path: os.tmpdir(), authenticator: account('one') }).catch(error => { settled = true; return error; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  completeDownload();
  assert.match((await result).message, /download failed/);
  assert.equal(completed, true);
  assert.equal(launcher.child, undefined);
});

test('managed launcher tracks actual child spawn, private files, exit and spawn errors', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-managed-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const core = path.dirname(require.resolve('minecraft-java-core'));
  const Args = require(path.join(core, 'Minecraft/Minecraft-Arguments.js')).default;
  const Loader = require(path.join(core, 'Minecraft/Minecraft-Loader.js')).default;
  const originalArgs = Args.prototype.GetArguments, originalLoader = Loader.prototype.GetArguments;
  t.after(() => { Args.prototype.GetArguments = originalArgs; Loader.prototype.GetArguments = originalLoader; });
  Args.prototype.GetArguments = async () => ({ jvm: [], classpath: [], mainClass: '-e', game: ['process.stdout.write(process.cwd()); setTimeout(() => process.exit(0), 30)'] });
  Loader.prototype.GetArguments = async () => ({ jvm: [], game: [] });
  const launcher = new ManagedLaunch();
  launcher.DownloadGame = async () => ({ minecraftJson: { id: 'test' }, minecraftVersion: 'test', minecraftJava: {}, minecraftLoader: null });
  let logs = '', pid;
  launcher.on('data', data => { logs += data; });
  launcher.on('spawn', value => { pid = value; });
  const closed = once(launcher, 'close');
  await launcher.Launch({ path: root, instance: 'accounts/test', authenticator: account('one'), java: { path: process.execPath }, loader: { type: null } });
  assert.ok(pid > 0);
  const [code] = await closed;
  assert.equal(code, 0);
  assert.equal(logs, path.join(root, 'instances/accounts/test'));
  if (process.platform === 'win32') {
    Args.prototype.GetArguments = async () => ({ jvm: [], classpath: [], mainClass: '-e', game: ['setTimeout(() => {}, 30000)'] });
    const headless = new ManagedLaunch(); headless.DownloadGame = launcher.DownloadGame;
    await headless.Launch({ path: root, instance: 'accounts/headless', authenticator: account('two'), java: { path: process.execPath }, loader: { type: null } });
    t.after(() => headless.child.kill());
    await assert.rejects(headless.requestClose(), /Fermez Minecraft directement/);
    assert.equal(headless.child.exitCode, null, 'Missing GUI must never force-kill the owned process');
    headless.child.kill();
    await headless.waitForExit();
  }
  const bad = new ManagedLaunch();
  bad.DownloadGame = launcher.DownloadGame;
  await assert.rejects(bad.Launch({ path: root, authenticator: account('one'), java: { path: path.join(root, 'missing-java') }, loader: { type: null } }), /ENOENT/);
});
