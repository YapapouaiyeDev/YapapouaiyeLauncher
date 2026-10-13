const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { LauncherUpdateProvider, installRequestedUpdate } = require('../src/launcher-update-provider');
const source = fs.readFileSync(require.resolve('../src/main.js'), 'utf8');
const versions = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function getVersionChannel('), source.indexOf('function isBetaTesterEnabled(')), versions);

const stable = '1.6.0-2';
const beta = '1.6.0-2-1-beta';
function release(version, prerelease = false) {
  return { tag_name: `v${version}`, prerelease, assets: [{ name: 'latest.yml' }, { name: `Setup-${version}.exe` }] };
}
function provider({ requested = null, enabled = false, releases = [release(beta), release(stable)], manifestVersion } = {}) {
  const instance = new LauncherUpdateProvider({
    owner: 'YapapouaiyeDev', repo: 'YapapouaiyeLauncher',
    loadReleases: async () => releases, getRequestedVersion: () => requested,
    isPrerelease: versions.isPrereleaseVersion, isNewer: versions.isLauncherVersionNewer,
    getChannel: versions.getVersionChannel,
  }, { allowPrerelease: enabled }, { platform: 'win32', executor: {} });
  instance.httpRequest = async url => {
    const version = manifestVersion || decodeURIComponent(url.pathname.split('/').at(-2)).replace(/^v/, '');
    return JSON.stringify({ version, files: [{ url: `Setup-${version}.exe`, sha512: Buffer.alloc(64).toString('base64') }] });
  };
  return instance;
}

test('historical build revisions sort numerically', () => {
  assert.equal(versions.isLauncherVersionNewer(beta, stable), true);
  assert.equal(versions.isLauncherVersionNewer('1.6.0-2-10-beta', '1.6.0-2-9-beta'), true);
  assert.equal(versions.isLauncherVersionNewer('1.7.0-beta.2', '1.7.0-beta.1'), true);
  assert.equal(versions.isSameNumericDifferentChannel('1.6.0-2-beta', stable), true);
  assert.equal(versions.isSameNumericDifferentChannel('v1.6.0-2', stable), false);
});
test('stable checks exclude a beta incorrectly marked stable on GitHub', async () => {
  assert.equal((await provider().getLatestVersion()).version, stable);
});
test('beta channel reads latest.yml and resolves the correct installer URL', async () => {
  const client = provider({ enabled: true });
  const info = await client.getLatestVersion();
  assert.equal(info.version, beta);
  assert.equal(client.resolveFiles(info)[0].url.href, `https://github.com/YapapouaiyeDev/YapapouaiyeLauncher/releases/download/v${beta}/Setup-${beta}.exe`);
});
test('explicit selection overrides channel preference for beta and stable return', async () => {
  assert.equal((await provider({ requested: beta }).getLatestVersion()).version, beta);
  assert.equal((await provider({ requested: stable, enabled: true }).getLatestVersion()).version, stable);
});
test('missing release, mismatched manifest and missing installer fail clearly', async () => {
  await assert.rejects(provider({ requested: '9.0.0' }).getLatestVersion(), /plus disponible/);
  await assert.rejects(provider({ requested: beta, manifestVersion: stable }).getLatestVersion(), /autre version/);
  const incomplete = release(beta); incomplete.assets.pop();
  await assert.rejects(provider({ requested: beta, releases: [incomplete] }).getLatestVersion(), /Installateur Windows absent/);
  incomplete.assets = [];
  await assert.rejects(provider({ requested: beta, releases: [incomplete] }).getLatestVersion(), /incomplète/);
});
test('installation waits for download and clears requested target afterward', async () => {
  let target, downloaded = false;
  const updater = { autoDownload: true,
    checkForUpdates: async () => { assert.equal(target, beta); assert.equal(updater.autoDownload, false); return { isUpdateAvailable: true, updateInfo: { version: beta } }; },
    downloadUpdate: async () => { downloaded = true; },
  };
  assert.equal((await installRequestedUpdate(updater, beta, value => { target = value; })).success, true);
  assert.equal(downloaded, true); assert.equal(target, null); assert.equal(updater.autoDownload, true);
});
test('no download of an unexpected target, download errors propagate, busy updater rejected', async () => {
  let target, downloaded = false;
  const updater = { autoDownload: true, checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: stable } }), downloadUpdate: async () => { downloaded = true; } };
  await assert.rejects(installRequestedUpdate(updater, beta, value => { target = value; }), /sélectionnée/);
  assert.equal(downloaded, false); assert.equal(target, null); assert.equal(updater.autoDownload, true);
  updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo: { version: beta } });
  updater.downloadUpdate = async () => { throw new Error('network failure'); };
  await assert.rejects(installRequestedUpdate(updater, beta, value => { target = value; }), /network failure/);
  assert.equal(target, null); assert.equal(updater.autoDownload, true);
  updater.downloadPromise = Promise.resolve();
  await assert.rejects(installRequestedUpdate(updater, beta, () => {}), /déjà en cours/);
});
