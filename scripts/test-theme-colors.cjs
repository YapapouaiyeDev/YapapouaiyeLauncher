// Run with: node_modules/.bin/electron scripts/test-theme-colors.cjs
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
function section(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
const helpers = section('function hexToRgb(', 'function getLuminance(')
  + section('function getLuminance(', 'function getContrastingTextColor(');
const cssGenerator = section('function generateThemeCss(', 'function updateDynamicThemeStyles(');
const hsv = section('  function rgbToHsv(', '  // --- CUSTOM DARK THEME COLOR PICKER CONTROLLER (');
const colors = vm.runInNewContext(`${hsv}; ({ hsvToHex, hexToHsv })`);
assert.equal(colors.hsvToHex(360, 1, 1), '#ff0000');
assert.equal(colors.hsvToHex(0, 1, 1), '#ff0000');
for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#38bdf8']) {
  const { h, s, v } = colors.hexToHsv(hex);
  assert.equal(colors.hsvToHex(h, s, v), hex);
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^https?:/.test(details.url) || /\/(renderer|sounds|tauri-bridge)\.js$/.test(details.url) });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../src/index.html'));
  await win.webContents.insertCSS('*, *::before, *::after { transition: none !important; animation: none !important; }', { cssOrigin: 'user' });
  await win.webContents.executeJavaScript(`${helpers}\n${cssGenerator}
    function escapeHtml(s) { return s; }
    document.body.innerHTML = '<button class="btn-primary" id="primary">Action</button><div class="play-button-box"><button class="btn-mc-play-huge" id="play">Jouer</button></div>';
    const dynamic = document.createElement('style'); document.head.appendChild(dynamic);
    const p = document.getElementById('primary');
    const play = document.getElementById('play');
  `);
  win.webContents.debugger.attach('1.3');
  for (const id of ['classic', 'sidebar', 'dock', 'custom-test']) {
    for (const mode of ['classic', 'cyber', 'forged', 'rounded', 'glass']) {
      await win.webContents.executeJavaScript(`
        document.body.dataset.theme = ${JSON.stringify(id)};
        dynamic.textContent = generateThemeCss({ id: ${JSON.stringify(id)}, styleMode: ${JSON.stringify(mode)}, colors: {
          primary: '#ff0000', primaryDark: '#800000', playGradientA: '#00ff00', playGradientB: '#008000',
          playText: '#090d14', validateText: '#ffffff'
        }});
      `);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 500 });
      const normal = await win.webContents.executeJavaScript(`({ primary: getComputedStyle(p).backgroundImage, playText: getComputedStyle(play).color, play: getComputedStyle(play).backgroundImage, playBg: getComputedStyle(play).backgroundColor })`);
      assert.ok(normal.primary.includes('rgb(255, 0, 0)'), `${id}/${mode}: primary`);
      assert.equal(normal.playText, 'rgb(9, 13, 20)', `${id}/${mode}: independent play text`);
      if (mode === 'forged') assert.ok(normal.play.includes('rgb(0, 255, 0)'), `${id}: forged palette`);
      if (mode === 'glass') {
        assert.equal(normal.playBg, 'rgba(0, 255, 0, 0.35)', `${id}: glass play color`);
      }
      const rect = await win.webContents.executeJavaScript(`(() => { const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rect });
      const hover = await win.webContents.executeJavaScript(`getComputedStyle(p).backgroundImage`);
      assert.equal(hover, normal.primary, `${id}/${mode}: hover keeps selected palette`);
    }
  }
  const normalized = await win.webContents.executeJavaScript(`[
    normalizeEditorColor(' f00 ', null), normalizeEditorColor('#12ab34', null), normalizeEditorColor('invalid', null)
  ]`);
  assert.deepEqual(normalized, ['#ff0000', '#12ab34', null]);
  console.log('Theme colors: HSV round trips, hex input, and normal/hover CSS passed for 4 theme IDs × 5 button styles.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
