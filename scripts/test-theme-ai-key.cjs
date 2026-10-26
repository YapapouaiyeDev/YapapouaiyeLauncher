const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createThemeAiKeyStore } = require('../src/theme-ai-key-store.cjs');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-theme-key-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('launcher-theme-key-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('a saved key is encrypted by the platform provider and survives a new store', t => {
  const directory = temporaryDirectory(t);
  const provider = {
    isEncryptionAvailable: () => true,
    encryptString: key => { assert.equal(key, 'nvapi-test'); return Buffer.from('platform-ciphertext'); },
    decryptString: value => { assert.equal(value.toString(), 'platform-ciphertext'); return 'nvapi-test'; }
  };
  const store = createThemeAiKeyStore(directory, provider);
  assert.deepEqual(store.get(), { success: true, apiKey: '' });
  assert.equal(store.save('nvapi-test').success, true);
  assert.equal(fs.readFileSync(path.join(directory, 'theme-ai-key.enc')).includes('nvapi-test'), false);
  const restarted = createThemeAiKeyStore(directory, provider);
  assert.deepEqual(restarted.get(), { success: true, apiKey: 'nvapi-test' });
  assert.equal(restarted.save('').success, true);
  assert.deepEqual(createThemeAiKeyStore(directory, provider).get(), { success: true, apiKey: '' });
});

test('unavailable or plaintext providers never save the key', t => {
  const directory = temporaryDirectory(t);
  for (const provider of [
    { isEncryptionAvailable: () => false },
    { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' }
  ]) {
    const store = createThemeAiKeyStore(directory, provider);
    assert.equal(store.save('nvapi-test').success, false);
    assert.deepEqual(fs.readdirSync(directory), []);
  }
});

test('save failures preserve the old key and corrupt storage can be forgotten', t => {
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'theme-ai-key.enc');
  fs.writeFileSync(file, 'old-ciphertext');
  const provider = {
    isEncryptionAvailable: () => true,
    encryptString: () => { throw Error('private details'); },
    decryptString: () => { throw Error('private details'); }
  };
  const store = createThemeAiKeyStore(directory, provider);
  assert.equal(store.save('nvapi-new-key').success, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old-ciphertext');
  assert.equal(store.get().success, false);
  assert.equal(store.get().error.includes('private details'), false);
  assert.equal(store.save('').success, true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(store.save('nvapi-\nbad').success, false);
});
