const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Windows encryption restores a key after a complete Electron restart', { skip: process.platform !== 'win32' }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-theme-key-os-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('launcher-theme-key-os-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const mode of ['write', 'read']) {
    const result = spawnSync(require('electron'), [path.join(__dirname, 'test-theme-ai-key-electron.cjs'), mode, directory], {
      env, windowsHide: true, timeout: 30000, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(`${mode} passed`));
    if (mode === 'write') {
      assert.equal(fs.readFileSync(path.join(directory, 'theme-ai-key.enc')).includes('nvapi-persistence-test'), false);
    }
  }
});
