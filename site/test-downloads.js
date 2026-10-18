import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSystem, selectDownload, initDownloads } from './downloads.js';

test('detects desktop and mobile systems without confusing Linux and Android', () => {
  for (const [userAgent, os, arch] of [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows', 'x64'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 'chromeos', 'x64'],
    ['Mozilla/5.0 (X11; CrOS aarch64 14541.0.0)', 'chromeos', 'arm'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'linux', 'x64'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'android', 'unknown'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'macos', 'unknown'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'ios', 'unknown'],
    ['unknown browser', '', 'unknown'],
  ]) assert.deepEqual(detectSystem({ userAgent }), { os, arch });
  assert.equal(detectSystem({ userAgent: 'Macintosh', maxTouchPoints: 5 }).os, 'ios');
});

test('uses browser hints when available, including ARM Chromebook hints', () => {
  assert.deepEqual(detectSystem({ userAgent: '' }, { platform: 'Chrome OS', architecture: 'arm', bitness: '64' }), { os: 'chromeos', arch: 'arm' });
  assert.deepEqual(detectSystem({ userAgent: '', userAgentData: { platform: 'Linux' } }, { architecture: 'x86', bitness: '64' }), { os: 'linux', arch: 'x64' });
});

const base = 'https://github.com/YapapouaiyeDev/YapapouaiyeLauncher/releases/download/v1.2.3/';
const catalog = {
  windows: { version: '1.2.3', url: base + 'Setup.exe', prerelease: false },
  chromeos: { version: '1.2.3-beta.1', url: base + 'ChromeOS-x64.deb', prerelease: true },
  linux: { version: '1.2.3-beta.1', url: base + 'ChromeOS-x64.deb', prerelease: true },
};

test('offers the actual platform package and marks beta downloads', () => {
  assert.equal(selectDownload(catalog, { os: 'windows', arch: 'x64' }).url, catalog.windows.url);
  for (const os of ['chromeos', 'linux']) {
    const selected = selectDownload(catalog, { os, arch: 'x64' });
    assert.equal(selected.url, catalog[os].url);
    assert.match(selected.note, /Bêta/);
  }
});

test('unavailable or incompatible systems never get the Windows installer', () => {
  for (const system of [
    { os: 'chromeos', arch: 'arm' }, { os: 'linux', arch: 'unknown' },
    { os: 'windows', arch: 'ia32' }, { os: 'android' }, { os: 'macos' }, { os: '' },
  ]) assert.equal(selectDownload(catalog, system).url.endsWith('/releases'), true);
  assert.match(selectDownload(catalog, { os: 'chromeos', arch: 'arm' }).note, /ARM/);
});

test('rejects wrong-platform files and external download URLs', () => {
  assert.equal(selectDownload({ chromeos: catalog.windows }, { os: 'chromeos', arch: 'x64' }).url.endsWith('/releases'), true);
  assert.equal(selectDownload({ windows: { url: 'https://example.com/Setup.exe' } }, { os: 'windows' }).url.endsWith('/releases'), true);
});

test('manual selection survives late browser hints and updates the download link', async t => {
  const ids = ['download-button', 'download-label', 'download-note', 'download-platform', 'chromeos-package-status', 'chromeos-download'];
  const elements = Object.fromEntries(ids.map(id => [id, { hidden: true, addEventListener(_name, handler) { this.change = handler; } }]));
  let resolveHints;
  const hints = new Promise(resolve => { resolveHints = resolve; });
  const previous = Object.fromEntries(['navigator', 'document', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)',
    userAgentData: { platform: 'Chrome OS', getHighEntropyValues: () => hints },
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: id => elements[id] } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => ({ ok: true, json: async () => catalog }) });
  const ready = initDownloads();
  const selector = elements['download-platform'];
  assert.equal(selector.value, 'chromeos');
  selector.value = 'windows';
  selector.change();
  resolveHints({ platform: 'Chrome OS', architecture: 'arm', bitness: '64' });
  await ready;
  assert.equal(selector.value, 'windows');
  assert.equal(elements['download-button'].href, catalog.windows.url);
  assert.equal(elements['chromeos-download'].href, catalog.chromeos.url);
  assert.equal(elements['chromeos-download'].hidden, false);
});
