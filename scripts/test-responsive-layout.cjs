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
  const themeLocation = await win.webContents.executeJavaScript(`({
    nav: document.querySelector('[data-page="themes"]').textContent.trim(),
    gallery: document.getElementById('theme-cards-grid').closest('.page').id,
    selector: document.getElementById('settings-theme').closest('.page').id,
    editor: document.getElementById('btn-open-custom-theme-modal').closest('.page').id,
    count: document.querySelectorAll('#theme-cards-grid').length
  })`);
  assert.deepEqual(themeLocation, { nav: 'Thème', gallery: 'page-themes', selector: 'page-themes', editor: 'page-themes', count: 1 });
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
    document.getElementById('ram-value').textContent = '20 Go';
    document.getElementById('server-ip-text').textContent = 'un-serveur-avec-une-adresse-tres-longue.yapapouaiye.example:25565';
    document.querySelector('.play-welcome-title').textContent = 'Bienvenue sur le serveur, UnPseudoMinecraftTrèsLong !';
    const tabs = document.getElementById('server-tabs-group');
    for (let i = 0; i < 10; i++) tabs.append(tabs.firstElementChild.cloneNode(true));
  `);
  assert.equal(await win.webContents.executeJavaScript(`Boolean(document.getElementById('topbar-server-badge'))`), false);
  for (const online of [true, false]) {
    const status = await win.webContents.executeJavaScript(`paintHomeServerStatus(${online}); document.getElementById('home-server-badge').textContent.trim()`);
    assert.equal(status, online ? 'EN LIGNE' : 'HORS LIGNE');
  }

  for (const layout of ['top', 'right', 'bottom']) {
    for (const [width, height, zoom] of [[1920, 1080, 1], [1366, 768, 1], [1200, 800, 1], [1100, 700, 1], [1020, 600, 1], [900, 600, 1], [900, 600, 2]]) {
      win.setContentSize(width, height);
      win.webContents.setZoomFactor(zoom);
      await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const check = () => {
          if (Math.abs(innerWidth - ${width / zoom}) <= 1 && Math.abs(innerHeight - ${height / zoom}) <= 1) return resolve();
          if (Date.now() > deadline) return reject(new Error('Viewport resize did not settle'));
          setTimeout(check, 16);
        };
        check();
      })`);
      for (const direction of ['ltr', 'rtl']) {
        await win.webContents.executeJavaScript(`document.body.dataset.navLayout = '${layout}'; document.documentElement.dir = '${direction}'; new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        const result = await win.webContents.executeJavaScript(`(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
          const overflow = [...document.querySelectorAll('.topbar, .main-content, #play-section, .play-hero-container, .server-tabs, .news-cards-grid, .server-ip-banner, .launcher-footer, .quick-ram-widget')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className);
          const ram = document.querySelector('.ram-value-tag');
          const range = document.createRange(); range.selectNodeContents(ram);
          return { width: innerWidth, overflow, ramLines: new Set([...range.getClientRects()].map(r => Math.round(r.y))).size, profile: rect('.footer-profile-widget'), action: rect('.footer-center-action'), ram: rect('.footer-right-widget'), selector: rect('.server-selector-card'), hero: rect('.play-hero-container'), play: rect('#play-section'), footer: rect('.launcher-footer'), main: rect('.main-content'), controls: [...document.querySelectorAll('.topbar button')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; }) };
        })()`);
        const label = JSON.stringify({ layout, width, height, zoom, direction, result });
        assert.deepEqual(result.overflow, [], label);
        assert.ok(result.controls.every(r => r.left >= -1 && r.right <= result.width + 1), label);
        assert.ok(result.main.bottom <= result.footer.y + 1, label);
        assert.equal(result.ramLines, 1, label);
        const sides = [result.profile, result.ram].sort((a, b) => a.x - b.x);
        assert.ok(sides[0].right <= result.action.x && result.action.right <= sides[1].x, label);
        assert.ok(result.ram.right <= result.width && result.profile.x >= 0, label);
        if (result.play.width <= 900) {
          assert.ok(result.hero.y >= result.selector.bottom, label);
        } else {
          assert.ok(Math.abs(result.hero.y - result.selector.y) < 1, label);
        }
        if (layout === 'right' && direction === 'ltr' && zoom === 1 && [1920, 1100, 900].includes(width)) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const image = await win.webContents.capturePage();
          const output = path.join(__dirname, '../scratch/responsive-preview');
          fs.mkdirSync(output, { recursive: true });
          fs.writeFileSync(path.join(output, `home-${width}.png`), image.toPNG());
        }
      }
    }
  }
  console.log('Responsive layout passed: 7 size/zoom combinations, 3 navigation layouts, LTR/RTL, long text, 13 servers, footer without overlap and RAM on one line.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
