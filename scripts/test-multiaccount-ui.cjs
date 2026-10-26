// Run with: node_modules/.bin/electron scripts/test-multiaccount-ui.cjs
const { app, BrowserWindow, session } = require('electron');
app.disableHardwareAcceleration();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
function implementation(name) {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) || /\/(renderer|sounds|tauri-bridge)\.js$/.test(details.url) }));
  const win = new BrowserWindow({ show: false, width: 1200, height: 900,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  await win.loadFile(path.join(__dirname, '../src/index.html'));
  win.webContents.setZoomFactor(1);
  await win.webContents.insertCSS('*, *::before, *::after { transition: none !important; animation: none !important; }');
  await win.webContents.executeJavaScript(`
    document.body.classList.remove('is-booting');
    document.getElementById('boot-overlay').remove();
    document.querySelectorAll('.page, .nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('page-accounts').classList.add('active');
    document.querySelector('[data-page="accounts"]').classList.add('active');
    let selectedAccountUuid = 'first', pendingLaunch = null, launchInProgress = false, launchRequestPending = false;
    let gameSessions = [{ id: 'session-first', accountUuid: 'first', accountName: 'Premier', serverName: 'AdoServ SE', ram: 4, state: 'running' }];
    const fixture = { accounts: [
      { uuid: 'first', name: 'Premier', type: 'microsoft', active: true },
      { uuid: 'second', name: 'Second', type: 'offline', active: false },
      { uuid: 'third', name: 'Troisieme', type: 'microsoft', active: false },
    ], activeIndex: 0 };
    const launched = [], notices = [], stopped = [], focused = [];
    let syncCalls = 0;
    let finishSync;
    const btnPlay = document.getElementById('btn-play'), ramSlider = document.getElementById('input-ram');
    ramSlider.value = 4;
    let currentServerId = 'adoserv2', currentGameVersion = '1.21.1', currentLoader = 'neoforge';
    const DEFAULT_THEME = 'classic';
    const maintenanceState = { maintenance: false }, defaultSkinSrc = '../assets/logo.png';
    const getPlayerAvatarUrl = () => defaultSkinSrc, getThemeObj = () => ({ images: {} }), getButtonIconSvg = () => '▶';
    const playMinecraftClickSound = () => {}, playGameLaunchSound = () => {}, loadMods = () => {};
    const fetchLaunchLockStatus = async () => ({ enabled: false }), refreshMaintenanceState = async () => {};
    const showToast = message => notices.push(message);
    window.launcher = {
      getAccounts: async () => ({ ...fixture, sessions: [...gameSessions] }),
      checkServerAccess: async () => ({ codesRequired: false }),
      syncMods: async () => { syncCalls++; return new Promise(resolve => { finishSync = () => resolve({ success: true }); }); },
      launchGame: async options => {
        launched.push(options);
        const account = fixture.accounts.find(a => a.uuid === options.accountUuid);
        const existing = gameSessions.find(s => s.accountUuid === account.uuid);
        if (existing) Object.assign(existing, { mode: 'game', ram: options.ram, state: 'running' });
        else gameSessions.push({ id: 'session-' + account.uuid, accountUuid: account.uuid, accountName: account.name, serverId: options.serverId, serverName: 'AdoServ II', ram: options.ram, mode: 'game', state: 'running', relay: Boolean(window.launcher.setSessionMode), canDetach: true, connected: true });
        return { success: true, resumed: Boolean(existing), modsStaged: 3, accountName: account.name };
      },
    };
    ${implementation('sessionForAccount')}
    ${implementation('escapeHtml')}
    ${implementation('updatePlayButtonContent')}
    ${implementation('resetPlayBtn')}
    async ${implementation('requestGameLaunch')}
    async ${implementation('doLaunchGame')}
    async ${implementation('loadAccountsList')}
    loadAccountsList().then(() => resetPlayBtn());
  `);
  const avatarPixel = await win.webContents.executeJavaScript(`
    (async () => {
      const skin = document.createElement('canvas'); skin.width = skin.height = 64;
      const pixels = skin.getContext('2d');
      pixels.fillStyle = '#ff0000'; pixels.fillRect(8, 8, 8, 8);
      pixels.fillStyle = '#0000ff'; pixels.fillRect(40, 8, 2, 2);
      fixture.accounts[0].skin = skin.toDataURL('image/png');
      await loadAccountsList();
      const avatar = document.querySelector('.account-skin');
      await AccountAvatars.apply(avatar, fixture.accounts[0], 40);
      await avatar.decode();
      const head = document.createElement('canvas'); head.width = head.height = 64;
      const context = head.getContext('2d'); context.drawImage(avatar, 0, 0, 64, 64);
      return { face: [...context.getImageData(32, 32, 1, 1).data], overlay: [...context.getImageData(2, 2, 1, 1).data], alt: avatar.alt };
    })()
  `);
  assert.deepEqual(avatarPixel.face, [255, 0, 0, 255]);
  assert.deepEqual(avatarPixel.overlay, [0, 0, 255, 255]);
  assert.equal(avatarPixel.alt, 'Avatar de Premier');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-launch-account')[0].disabled`), true);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-remove')[0].disabled`), true);
  await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-launch-account')[1].click(); new Promise(resolve => setTimeout(resolve, 0))`);
  assert.equal(await win.webContents.executeJavaScript(`launchInProgress`), true);
  assert.equal(await win.webContents.executeJavaScript(`[...document.querySelectorAll('.btn-launch-account')].every(el => el.disabled)`), true);
  await win.webContents.executeJavaScript(`finishSync(); new Promise(resolve => setTimeout(resolve, 0))`);
  assert.equal(await win.webContents.executeJavaScript(`launched[0].accountUuid`), 'second');
  assert.equal(await win.webContents.executeJavaScript(`selectedAccountUuid`), 'first');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-launch-account')[2].disabled`), false);
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('accounts-sessions-summary').textContent`), '2 sessions ouvertes · 8 Go de RAM alloués');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-network-account, .btn-stop-network').length`), 0);
  await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-launch-account')[2].click(); new Promise(resolve => setTimeout(resolve, 0))`);
  await win.webContents.executeJavaScript(`finishSync(); new Promise(resolve => setTimeout(resolve, 0))`);
  assert.equal(await win.webContents.executeJavaScript(`launched[1].accountUuid`), 'third');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-launch-account')[2].textContent`), 'En jeu');
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('btn-play').textContent.includes('EN JEU')`), true);
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('btn-play').disabled`), true);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-launch-account')[2].disabled`), true);
  assert.equal(await win.webContents.executeJavaScript(`launched.length`), 2);
  await win.webContents.executeJavaScript(`
    const closeRequests = [];
    window.launcher.closeGameSession = async id => { closeRequests.push(id); gameSessions = gameSessions.filter(s => s.id !== id); return { success: true }; };
    gameSessions = gameSessions.map((s, index) => index < 2 ? { ...s, pid: 100 + index, relay: true, connected: false, canDetach: false, state: index === 0 ? 'disconnected' : 'stopping' } : s);
    loadAccountsList();
  `);
  assert.match(await win.webContents.executeJavaScript(`document.querySelector('.account-session-state').textContent`), /Jeu déconnecté/);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.btn-close-game').length`), 2);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.btn-close-game').disabled`), false);
  for (const width of [1200, 900]) {
    win.setSize(width, 900);
    assert.equal(await win.webContents.executeJavaScript(`[...document.querySelectorAll('.account-item, .account-actions, .main-content')].filter(el => el.scrollWidth > el.clientWidth + 1).length`), 0);
  }
  win.webContents.invalidate();
  await new Promise(resolve => setTimeout(resolve, 100));
  fs.writeFileSync(path.join(__dirname, '../scratch/disconnected-account-ui.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.btn-close-game').click(); new Promise(resolve => setTimeout(resolve, 0))`);
  assert.equal(await win.webContents.executeJavaScript(`closeRequests[0]`), 'session-first');
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.btn-launch-account').disabled`), false);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.btn-launch-account').textContent`), 'Jouer');
  assert.equal(await win.webContents.executeJavaScript(`gameSessions.some(s => s.id === 'session-second')`), true);
  console.log('Multi-account UI: direct launches, standby guidance, disconnected recovery, independent close and responsive actions passed.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
