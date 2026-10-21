const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { readClientOptions } = require('../src/client-options');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
function definition(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

test('HUD survives restarts, module toggles and saves from either companion client', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-hud-'));
  const configDir = path.join(directory, 'config');
  fs.mkdirSync(configDir);
  const configFile = path.join(directory, 'config.json');
  fs.writeFileSync(configFile, '{}');
  const modern = path.join(configDir, 'yapapouaiye_client.json');
  const legacy = path.join(configDir, 'lunar_client.json');
  function boot() {
    const read = () => JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const context = vm.createContext({ fs, path, console, configFile, launcherDir: directory,
      gameDir: directory, loadConfig: read, readConfigRaw: () => ({ value: read() }),
      readClientOptions, ensureNeoForgeFmlConfig() {}, gameOptions: {}, overlayWindow: null });
    const defaults = source.slice(source.indexOf('const DEFAULT_CLIENT_MODS ='), source.indexOf('function getClientModsConfig'));
    vm.runInContext(defaults + ['normalizeClientModsDeep', 'getClientModsConfig',
      'saveConfig', 'syncClientOptionsToMinecraft', 'saveClientModsConfig'].map(definition).join('\n'), context);
    return context;
  }
  try {
    let app = boot();
    app.saveClientModsConfig({ hudPositions: { fpsX: 173, fpsY: 91, armorX: 231 } });
    app = boot();
    assert.equal(app.getClientModsConfig().hudPositions.fpsX, 173);
    app.saveClientModsConfig({ zoom: { enabled: false } });
    assert.equal(app.getClientModsConfig().hudPositions.armorX, 231);
    // Old client saves after the launcher wrote both files.
    fs.writeFileSync(legacy, JSON.stringify({ fpsX: 333, fpsY: 0 }));
    fs.utimesSync(modern, 1000, 1000);
    fs.utimesSync(legacy, 2000, 2000);
    app = boot();
    assert.equal(app.getClientModsConfig().hudPositions.fpsX, 333);
    assert.equal(app.getClientModsConfig().hudPositions.fpsY, 0);
    app.saveClientModsConfig({ fps: { enabled: false } });
    assert.equal(JSON.parse(fs.readFileSync(modern)).fpsX, 333);
    assert.equal(JSON.parse(fs.readFileSync(legacy)).fpsX, 333);
    // Modern client saves next; its positions must also be retained.
    fs.writeFileSync(modern, JSON.stringify({ fpsX: 444 }));
    fs.utimesSync(legacy, 1000, 1000);
    fs.utimesSync(modern, 2000, 2000);
    assert.equal(boot().getClientModsConfig().hudPositions.fpsX, 444);
    app.saveClientModsConfig({ hudPositions: { fpsX: 0, fpsY: 12 } });
    // Persisted launcher coordinates survive removal of the game config files.
    fs.unlinkSync(modern);
    fs.unlinkSync(legacy);
    assert.equal(boot().getClientModsConfig().hudPositions.fpsY, 12);
    fs.writeFileSync(modern, '{broken');
    fs.writeFileSync(legacy, JSON.stringify({ fpsX: 77 }));
    assert.equal(boot().getClientModsConfig().hudPositions.fpsX, 77);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
