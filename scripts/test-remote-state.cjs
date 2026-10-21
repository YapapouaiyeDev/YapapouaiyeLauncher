const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const main = read('main.js');
const renderer = read('renderer.js');
function implementation(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const silent = { log() {}, warn() {}, error() {} };
const server = (id, name = id) => ({ id, name, host: `${id}.example.org`, gamePort: 25565, gameVersion: '26.2' });

function backend(send = () => {}) {
  let response = { servers: [server('one')], maintenance: false, message: '' };
  let requests = 0;
  let timer;
  const context = vm.createContext({
    console: silent, Date, sendToRenderer: send,
    loadRemoteStateCache() {}, saveRemoteStateCache() {},
    pickRemoteServerFields: value => value,
    serversApiCandidates: () => ['https://site/api/servers'],
    launcherConfigApiCandidates: () => ['https://site/api/launcher-config'],
    fetchRemoteJson: async url => {
      requests++;
      if (response instanceof Error) throw response;
      return url.includes('/servers') ? { servers: response.servers } : response;
    },
    setInterval(callback, delay) { timer = { callback, delay, unref() {} }; return timer; },
  });
  vm.runInContext(`
    let remoteServersCache = [];
    let remoteLauncherConfig = { maintenance: false, message: '' };
    let remoteStateFetchedAt = 0;
    function getAllServers() { return remoteServersCache.filter(s => s.enabled !== false); }
    function getActiveServer() { return getAllServers()[0] || { id: 'one' }; }
    function getServerGameVersion(s) { return s.gameVersion || '26.2'; }
    function getMaintenanceState() { return { ...remoteLauncherConfig }; }
  ` + implementation(main, 'refreshRemoteLauncherState') + '\n' +
    main.slice(main.indexOf('const REMOTE_STATE_POLL_MS'), main.indexOf('// Per-server Minecraft version')), context);
  return { context, setResponse(value) { response = value; }, requests: () => requests, timer: () => timer };
}

function ui() {
  const listeners = new Map();
  const exposed = {};
  vm.runInNewContext(read('preload.js'), { require: () => ({
    contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
    ipcRenderer: {
      on: (name, cb) => listeners.set(name, cb),
      removeListener: name => listeners.delete(name),
    },
  }) });
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, { textContent: '', title: '', innerHTML: '', classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        add: name => classes.add(name), contains: name => classes.has(name),
      } });
    }
    return nodes.get(id);
  };
  let bindings = 0;
  let modLoads = 0;
  const context = vm.createContext({
    window: { launcher: exposed.launcher },
    document: { getElementById: node, querySelector: () => node('mods-nav'), querySelectorAll: () => [] },
    bindServerTabs() { bindings++; }, updateLiveServerBadge() {}, loadMods() { modLoads++; },
    escapeHtml: value => String(value || ''), DEFAULT_GAME_VERSION: '26.2',
  });
  vm.runInContext(`
    let currentServerId = 'one';
    let currentServerIp = '';
    let currentGameVersion = '26.2';
    let currentLoader = 'neoforge';
    let maintenanceState = { maintenance: false, message: '' };
  ` + ['serverTabBadge', 'renderServerTabs', 'applyServerUI', 'applyRemoteLauncherState',
    'applyMaintenanceState', 'closeMaintenanceModal'].map(name => implementation(renderer, name)).join('\n') +
    renderer.slice(renderer.indexOf('if (window.launcher.onRemoteStateChanged)'),
      renderer.indexOf('async function refreshMaintenanceState')), context);
  return { context, node, bindings: () => bindings, modLoads: () => modLoads,
    send: (name, value) => listeners.get(name)?.({}, value) };
}

test('an admin change reaches the open UI through the real preload event', async () => {
  const view = ui();
  const remote = backend(view.send);
  remote.context.startRemoteStateWatcher();
  assert.equal(remote.timer().delay, 5000);
  await remote.context.pollRemoteStateOnce();
  remote.setResponse({ servers: [server('two', 'Nouveau serveur')], maintenance: true, message: 'Travaux en cours' });
  await remote.context.pollRemoteStateOnce();
  assert.equal(view.node('current-server-title').textContent, 'Nouveau serveur');
  assert.equal(view.node('server-ip-text').textContent, 'two.example.org:25565');
  assert.equal(view.node('launch-version-title').textContent, 'NeoForge 26.2');
  assert.match(view.node('server-tabs-group').innerHTML, /data-server-id="two"/);
  assert.equal(view.bindings(), 2, 'New tabs receive their click handlers');
  assert.equal(view.modLoads(), 1, 'Switching servers refreshes its mods');
  assert.equal(view.node('maintenance-banner').classList.contains('hidden'), false);
  assert.equal(view.node('mods-nav').classList.contains('nav-disabled'), true);
  assert.equal(view.node('maintenance-banner-text').textContent, 'Travaux en cours');
  remote.setResponse({ servers: [server('two', 'Nouveau serveur')], maintenance: false, message: '' });
  await remote.context.pollRemoteStateOnce();
  assert.equal(view.node('maintenance-banner').classList.contains('hidden'), true);
  assert.equal(view.node('mods-nav').classList.contains('nav-disabled'), false);
  assert.equal(view.node('modal-maintenance').classList.contains('hidden'), true);
  await remote.context.pollRemoteStateOnce();
  assert.equal(view.bindings(), 3, 'An unchanged state does not repaint the UI');
});

test('the play badge follows startup, server selection and live version changes', async () => {
  const view = ui();
  const first = { ...server('one'), defaultLoader: 'neoforge' };
  const second = { ...server('two'), gameVersion: '1.21.1', defaultLoader: 'fabric' };
  view.context.window.launcher.getServers = async () => ({ servers: [first, second], activeServer: first });
  vm.runInContext(implementation(renderer, 'initServerSelector'), view.context);
  await view.context.initServerSelector();
  assert.equal(view.node('launch-version-title').textContent, 'NeoForge 26.2');

  view.context.window.launcher.setActiveServer = async id => {
    assert.equal(id, 'two');
    return { success: true, activeServer: second };
  };
  view.context.showToast = () => {};
  vm.runInContext(implementation(renderer, 'onServerTabClick'), view.context);
  await view.context.onServerTabClick({ dataset: { serverId: 'two' }, classList: { add() {} } }, []);
  assert.equal(view.node('launch-version-title').textContent, 'Fabric 1.21.1');

  view.send('remote-state', { activeServer: { ...second, gameVersion: '26.2' } });
  assert.equal(view.node('launch-version-title').textContent, 'Fabric 26.2');
  assert.equal(view.node('server-badge-tag').textContent, '26.2');
  assert.equal(vm.runInContext('currentGameVersion', view.context), '26.2');
  assert.equal(vm.runInContext('currentLoader', view.context), 'fabric');

  view.send('remote-state', { activeServer: { ...first, defaultLoader: undefined, loader: 'fabric' } });
  assert.equal(view.node('launch-version-title').textContent, 'Fabric 26.2', 'Tauri loader alias is supported');
});

test('poll, focus and manual refresh share the request already in flight', async () => {
  let events = 0;
  const remote = backend(() => events++);
  await Promise.all(Array.from({ length: 8 }, () => remote.context.pollRemoteStateOnce()));
  assert.equal(remote.requests(), 2, 'One request for servers and one for maintenance');
  assert.equal(events, 1);
  const payload = await remote.context.pollRemoteStateOnce();
  assert.equal(payload.serversOk, true);
  assert.equal(payload.configOk, true);
  assert.equal(events, 1);
});

test('an unavailable development endpoint is quiet when production succeeds, but total failure is reported', async () => {
  const remote = backend();
  const warnings = [];
  remote.context.console = { ...silent, warn: (...parts) => warnings.push(parts.join(' ')) };
  remote.context.serversApiCandidates = () => ['http://127.0.0.1:8789/api/servers', 'https://site/api/servers'];
  remote.context.launcherConfigApiCandidates = () => ['http://127.0.0.1:8789/api/launcher-config', 'https://site/api/launcher-config'];
  const fetch = remote.context.fetchRemoteJson;
  remote.context.fetchRemoteJson = url => {
    if (url.includes('127.0.0.1')) throw new Error('ECONNREFUSED');
    return fetch(url);
  };
  const online = await remote.context.pollRemoteStateOnce();
  assert.equal(online.serversOk, true);
  assert.equal(online.configOk, true);
  assert.deepEqual(warnings, []);
  remote.setResponse(new Error('offline'));
  const offline = await remote.context.pollRemoteStateOnce();
  assert.equal(offline.serversOk, false);
  assert.equal(offline.configOk, false);
  assert.equal(offline.activeServerId, 'one');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /cache conservé.*ECONNREFUSED.*offline/);
});

test('offline or malformed responses preserve the last valid admin state', async () => {
  let events = 0;
  const remote = backend(() => events++);
  remote.setResponse({ servers: [server('one')], maintenance: true, message: 'Maintenance' });
  await remote.context.pollRemoteStateOnce();
  for (const response of [new Error('offline'), { servers: null, ok: false }, { error: 'unavailable' }]) {
    remote.setResponse(response);
    const payload = await remote.context.pollRemoteStateOnce();
    assert.equal(payload.activeServerId, 'one');
    assert.equal(payload.launcherConfig.maintenance, true);
    assert.equal(payload.launcherConfig.message, 'Maintenance');
  }
  assert.equal(events, 1);
});

test('live admin refresh cannot change the launch destination while mods sync', async () => {
  let completeSync;
  let launched;
  const context = vm.createContext({
    currentServerId: 'one', currentGameVersion: '26.2', currentLoader: 'neoforge', ramSlider: null,
    document: { getElementById: () => null, querySelectorAll: () => [] }, btnPlay: { classList: { add() {} } },
    launchInProgress: false, pendingLaunch: null, selectedAccountUuid: 'account-one', sessionForAccount: () => null,
    loadAccountsList: async () => {},
    playGameLaunchSound() {}, showToast() {}, loadMods() {}, resetPlayBtn() {},
    refreshMaintenanceState() {}, openMaintenanceModal() {},
    window: { launcher: {
      syncMods: id => { assert.equal(id, 'one'); return new Promise(resolve => { completeSync = resolve; }); },
      launchGame: async options => { launched = options; return { success: false, code: 'LAUNCH_MAINTENANCE' }; },
    } },
  });
  vm.runInContext(implementation(renderer, 'doLaunchGame'), context);
  const pending = context.doLaunchGame();
  context.currentServerId = 'two';
  context.currentGameVersion = '1.21.1';
  context.currentLoader = 'fabric';
  context.selectedAccountUuid = 'account-two';
  completeSync({ success: true });
  await pending;
  assert.equal(launched.serverId, 'one');
  assert.equal(launched.version, '26.2');
  assert.equal(launched.loader, 'neoforge');
  assert.equal(launched.accountUuid, 'account-one');
});
