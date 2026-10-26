const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');

function startup() {
  const ipcMain = new EventEmitter();
  const windows = [];
  let splashClosed = 0;
  let now = 0;
  const timers = [];
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.shown = 0;
      windows.push(this);
    }
    loadFile() {}
    isDestroyed() { return false; }
    show() { this.shown++; }
    focus() {}
    setIgnoreMouseEvents() {}
  }
  const context = vm.createContext({
    ipcMain, BrowserWindow, mainWindow: null, splashWindow: null, path: require('node:path'),
    setTimeout(callback, delay) { timers.push({ callback, at: now + delay }); },
    __dirname: '/launcher/src', process: { platform: 'win32' }, console,
    startRemoteStateWatcher() {}, pollRemoteStateOnce: async () => {}, logToFile() {},
    closeSplash() { splashClosed++; },
  });
  const start = source.indexOf('let mainWindowShown = false;');
  vm.runInContext(source.slice(start, source.indexOf('function closeSplash()', start)), context);
  vm.runInContext('createSplash()', context);
  vm.runInContext('createWindow()', context);
  return {
    splash: windows[0], window: windows[1], ipcMain, closed: () => splashClosed,
    advance(ms) {
      now += ms;
      for (const timer of timers.splice(0)) {
        if (timer.at <= now) timer.callback();
        else timers.push(timer);
      }
    },
  };
}

for (const order of ['paint-first', 'initialization-first']) {
  test(`logo remains until the interface is ready (${order})`, () => {
    const boot = startup();
    boot.splash.emit('ready-to-show');
    boot.advance(1500);
    assert.equal(boot.window.options.show, false);
    const paint = () => boot.window.emit('ready-to-show');
    const initialized = () => boot.ipcMain.emit('launcher-ready', { sender: boot.window.webContents });
    (order === 'paint-first' ? paint : initialized)();
    assert.equal(boot.window.shown, 0);
    assert.equal(boot.closed(), 0);
    (order === 'paint-first' ? initialized : paint)();
    assert.equal(boot.window.shown, 1);
    assert.equal(boot.closed(), 1);
    initialized();
    assert.equal(boot.window.shown, 1);
  });
}

test('another renderer cannot dismiss the loading logo', () => {
  const boot = startup();
  boot.window.emit('ready-to-show');
  boot.ipcMain.emit('launcher-ready', { sender: {} });
  assert.equal(boot.window.shown, 0);
  assert.equal(boot.closed(), 0);
});

test('a page load failure leaves the launcher accessible', () => {
  const boot = startup();
  boot.window.webContents.emit('did-fail-load', {}, -2, 'Failed');
  assert.equal(boot.window.shown, 1);
  assert.equal(boot.closed(), 1);
});

test('a fast startup keeps the logo visible for at least 1.5 seconds', () => {
  const boot = startup();
  boot.window.emit('ready-to-show');
  boot.ipcMain.emit('launcher-ready', { sender: boot.window.webContents });
  boot.advance(5000);
  assert.equal(boot.window.shown, 0);
  boot.splash.emit('ready-to-show');
  assert.equal(boot.splash.shown, 1);
  boot.advance(1499);
  assert.equal(boot.window.shown, 0);
  assert.equal(boot.closed(), 0);
  boot.advance(1);
  assert.equal(boot.window.shown, 1);
  assert.equal(boot.closed(), 1);
});

test('a failed splash does not block a ready launcher', () => {
  const boot = startup();
  boot.window.emit('ready-to-show');
  boot.ipcMain.emit('launcher-ready', { sender: boot.window.webContents });
  boot.splash.webContents.emit('did-fail-load');
  assert.equal(boot.window.shown, 1);
});
