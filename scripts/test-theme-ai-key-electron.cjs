const { app, safeStorage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createThemeAiKeyStore } = require('../src/theme-ai-key-store.cjs');
const [mode, directory] = process.argv.slice(2);
fs.mkdirSync(path.join(directory, 'profile'), { recursive: true });
app.setPath('userData', path.join(directory, 'profile'));

// Invoked twice with the same temporary directory to verify persistence across
// independent Electron processes using real OS encryption.
app.whenReady().then(() => {
  const store = createThemeAiKeyStore(directory, safeStorage);
  if (mode === 'write') {
    assert.deepEqual(store.save('nvapi-persistence-test'), { success: true });
  } else {
    assert.deepEqual(store.get(), { success: true, apiKey: 'nvapi-persistence-test' });
    assert.deepEqual(store.save(''), { success: true });
    assert.deepEqual(store.get(), { success: true, apiKey: '' });
  }
  console.log(`Encrypted key persistence: ${mode} passed`);
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
