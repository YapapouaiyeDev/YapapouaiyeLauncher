// Run with: node_modules/.bin/electron scripts/test-responsive-layout.cjs
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^https?:/.test(details.url) || /\/(renderer|sounds|tauri-bridge)\.js$/.test(details.url) });
  });
  const win = new BrowserWindow({ show: false, width: 1920, height: 1080,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, '../src/index.html'));
  await win.webContents.insertCSS('*, *::before, *::after { transition: none !important; animation: none !important; }');
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
  const paintStatus = source.slice(source.indexOf('function paintHomeServerStatus('), source.indexOf('// Initializer —'));
  await win.webContents.executeJavaScript(`${paintStatus}
    document.body.classList.remove('is-booting');
    document.getElementById('boot-overlay').remove();
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('play-section').classList.remove('hidden');
    const news = document.getElementById('home-news-cards');
    news.style.display = 'grid';
    news.innerHTML = Array.from({length: 2}, (_, i) => '<article class="news-card mc-box"><h3 class="news-card-title">Actualités du serveur ' + (i + 1) + '</h3><p class="news-card-desc">Découvrez les dernières nouveautés et les informations du serveur.</p></article>').join('');
    document.querySelector('.server-tab-name').textContent = 'Un serveur avec un nom particulièrement long';
  `);
  assert.equal(await win.webContents.executeJavaScript(`Boolean(document.getElementById('topbar-server-badge'))`), false);
  for (const online of [true, false]) {
    const status = await win.webContents.executeJavaScript(`paintHomeServerStatus(${online}); document.getElementById('home-server-badge').textContent.trim()`);
    assert.equal(status, online ? 'EN LIGNE' : 'HORS LIGNE');
  }

  for (const layout of ['top', 'right', 'bottom']) {
    for (const [width, height, zoom] of [[1920, 1080, 1], [1200, 800, 1], [1020, 600, 1], [900, 600, 1], [900, 600, 2]]) {
      win.setSize(width, height);
      win.webContents.setZoomFactor(zoom);
      for (const direction of ['ltr', 'rtl']) {
        await win.webContents.executeJavaScript(`document.body.dataset.navLayout = '${layout}'; document.documentElement.dir = '${direction}'; new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        const result = await win.webContents.executeJavaScript(`(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const overflow = [...document.querySelectorAll('.topbar, .main-content, #play-section, .play-hero-container, .server-tabs, .news-cards-grid')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className);
          return { width: innerWidth, overflow, selector: rect('.server-selector-card'), hero: rect('.play-hero-container'), play: rect('#play-section'), footer: rect('.launcher-footer'), main: rect('.main-content'), controls: [...document.querySelectorAll('.topbar button')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; }) };
        })()`);
        const label = JSON.stringify({ layout, width, height, zoom, direction, result });
        assert.deepEqual(result.overflow, [], label);
        assert.ok(result.controls.every(r => r.left >= -1 && r.right <= result.width + 1), label);
        assert.ok(result.main.bottom <= result.footer.y + 1, label);
        if (result.play.width <= 800) {
          assert.ok(result.hero.y >= result.selector.bottom, label);
        } else {
          assert.ok(Math.abs(result.hero.y - result.selector.y) < 1, label);
        }
      }
    }
  }
  console.log('Responsive layout: no topbar badge, live home status, no horizontal overflow, content above footer, and adaptive server layout passed at 4 window sizes, 200% zoom, 3 navigation layouts and LTR/RTL.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
