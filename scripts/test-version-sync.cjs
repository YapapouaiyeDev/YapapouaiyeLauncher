const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncVersion } = require('./sync-version.cjs');

test('version synchronization publishes beta and alpha as prereleases and numeric revisions as stable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-version-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'src-tauri'));
  const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
  write('package.json', JSON.stringify({ version: '1.0.0', build: { publish: [{ provider: 'github', releaseType: 'release' }] } }));
  write('package-lock.json', JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }));
  write('src/index.html', '<span id="app-version">v1.0.0</span>');
  write('src-tauri/Cargo.toml', '[package]\nversion = "1.0.0"\n');
  write('src-tauri/Cargo.lock', '[[package]]\nname = "yapapouaiye-launcher"\nversion = "1.0.0"\n');
  try {
    for (const [version, channel, releaseType] of [
      ['1.6.1-4-beta.1', 'beta', 'prerelease'],
      ['1.7.0-alpha.2', 'alpha', 'prerelease'],
      ['1.6.1-4', 'latest', 'release'],
    ]) {
      write('version.json', JSON.stringify({ version }));
      syncVersion(root);
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      assert.equal(pkg.version, version);
      assert.equal(pkg.build.publish[0].channel, channel);
      assert.equal(pkg.build.publish[0].releaseType, releaseType);
      assert.equal(syncVersion(root).changed, 0);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
