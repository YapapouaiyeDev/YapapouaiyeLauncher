const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

for (const [version, filename] of [['26.2', 'nexlux-26.2.jar'], ['1.21.1', 'nexlux-1.1.0.jar']]) test('NexLux ' + version + ' replaces staged copies without touching the cache', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexlux-upgrade-'));
  try {
    const modsDir = path.join(root, 'game-mods');
    fs.mkdirSync(modsDir);
    const cached = path.join(root, 'cached-old.jar');
    fs.writeFileSync(cached, 'old companion');
    fs.linkSync(cached, path.join(modsDir, 'nexlux-1.1.0.jar'));
    fs.writeFileSync(path.join(modsDir, 'backpacks.jar'), 'other mod');
    const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    const start = source.indexOf('function injectClientCompanionMod(');
    const code = source.slice(start, source.indexOf('\n}', start) + 2);
    const context = vm.createContext({ fs, path, console, modsDir, launcherDir: root,
      __dirname: path.resolve(__dirname, '../src'), process: { resourcesPath: root } });
    vm.runInContext(code + '\ninjectClientCompanionMod(' + JSON.stringify(version) + ', \"neoforge\", modsDir);', context);
    assert.deepEqual(fs.readFileSync(path.join(modsDir, filename)),
      fs.readFileSync(path.join(__dirname, '../mods', filename)));
    assert.equal(fs.readdirSync(modsDir).filter(name => name.startsWith('nexlux-')).length, 1);
    assert.equal(fs.readFileSync(cached, 'utf8'), 'old companion');
    assert.equal(fs.readFileSync(path.join(modsDir, 'backpacks.jar'), 'utf8'), 'other mod');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
