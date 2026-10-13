const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const declarations = ['AZERTY_DEFAULT_KEYS', 'QWERTY_DEFAULT_KEYS'].map(name => {
  const start = source.indexOf(`const ${name} =`);
  return source.slice(start, source.indexOf('\n};', start) + 3);
}).join('\n');
const start = source.indexOf('function applyKeyboardLayoutToOptionsTxt(');
const implementation = source.slice(start, source.indexOf('\n}', start) + 2);

test('custom bindings survive automatic layout sync and a launcher restart', () => {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-keys-'));
  const file = path.join(gameDir, 'options.txt');
  const boot = () => {
    const context = vm.createContext({ fs, path, gameDir, console });
    vm.runInContext(declarations + '\n' + implementation, context);
    return context.applyKeyboardLayoutToOptionsTxt;
  };
  const custom = [
    'key_key.forward:key.keyboard.w', 'key_key.left:key.keyboard.a',
    'key_key.hotbar.6:key.keyboard.g', 'key_key.hotbar.9:key.keyboard.f',
    'key_key.sprint:key.mouse.4', 'key_key.drop:key.keyboard.unknown',
    'key_mod.custom:key.keyboard.h', 'renderDistance:17',
  ];
  try {
    fs.writeFileSync(file, custom.join('\r\n') + '\r\n');
    boot()('azerty', false);
    const saved = fs.readFileSync(file, 'utf8');
    for (const line of custom) assert.ok(saved.split(/\r?\n/).includes(line), line);
    assert.ok(saved.includes('key_key.jump:key.keyboard.space'));
    assert.equal(boot()('azerty', false).applied, false);
    assert.equal(fs.readFileSync(file, 'utf8'), saved);

    // Explicit layout selection still resets vanilla keys, leaving mod keys intact.
    assert.equal(boot()('azerty', true).applied, true);
    const reset = fs.readFileSync(file, 'utf8');
    assert.ok(reset.includes('key_key.forward:key.keyboard.z'));
    assert.ok(reset.includes('key_key.hotbar.6:key.keyboard.6'));
    assert.ok(reset.includes('key_mod.custom:key.keyboard.h'));
    assert.ok(reset.includes('renderDistance:17'));
    assert.equal(boot()('qwerty', false).applied, false);
    assert.equal(fs.readFileSync(file, 'utf8'), reset);
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
});
