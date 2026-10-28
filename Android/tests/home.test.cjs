/* SPDX-License-Identifier: GPL-3.0-or-later */
// Run with Playwright installed in NODE_PATH. The native bridge is simulated here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
test('mobile home: catalog, account selection, access, updates and layout', async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!['index.html', 'home.css', 'home.js', 'logo.png', 'background.png'].includes(name)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', ({html:'text/html', css:'text/css', js:'text/javascript', png:'image/png'})[name.split('.').pop()]);
    res.end(fs.readFileSync(path.join(root, name.endsWith('.png') ? '../assets' : 'ui', name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge'});
    const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.calls = [];
      window.mockState = {phase:'idle', busy:false, selectedId:'one', serverName:'AdoServ SE', username:'TestPlayer', authMode:'offline', preset:'custom',
        version:'1.6.1-4',minecraft:'1.21.1',loader:'neoforge',address:'serveur.example:25565',message:'Choisis ton compte puis appuie sur Jouer.',
        servers:[{id:'one',name:'AdoServ SE'},{id:'two',name:'AdoServ LXVII'},{id:'three',name:'AdoServ II'},{id:'four',name:'YapapouaiyeSMP'}]};
      window.YapaNative = new Proxy({}, {get: (_, method) => (...args) => {
        window.calls.push([method, ...args]);
        if (method === 'ready') window.launcherState(window.mockState);
        if (method === 'auth') { window.mockState.authMode = args[0]; window.launcherState(window.mockState); }
        if (method === 'preferences') { Object.assign(window.mockState, {preset:args[0],hideCursor:args[1],autoUpdates:args[2]}); window.launcherState(window.mockState); }
      }});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.locator('#server-select option').count(), 4);
    await page.fill('#username', 'ab'); await page.click('#play-button');
    assert.equal(await page.locator('#username-error').isVisible(), true);
    assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'play')), false);
    await page.fill('#username', 'TestPlayer'); await page.click('#play-button');
    assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), ['play', 'TestPlayer', 0]);
    await page.selectOption('#auth-mode', 'microsoft');
    assert.equal(await page.locator('#offline-profile').isVisible(), false);
    assert.equal(await page.locator('#play-button').isDisabled(), true);
    await page.click('#microsoft-button');
    assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), 'microsoft');
    await page.evaluate(() => { Object.assign(window.mockState, {microsoftConfigured:false}); window.launcherState(window.mockState); });
    assert.equal(await page.locator('#microsoft-button').textContent(), 'Se connecter avec Microsoft');
    assert.match(await page.locator('#microsoft-status').textContent(), /pas encore activée/);
    assert.equal(await page.locator('#microsoft-button').isDisabled(), true);
    assert.equal(await page.locator('#microsoft-settings').count(), 0);
    await page.evaluate(() => { Object.assign(window.mockState, {microsoftName:'OfficialPlayer'}); window.launcherState(window.mockState); });
    assert.equal(await page.locator('#play-button').isDisabled(), true);
    await page.evaluate(() => { Object.assign(window.mockState, {microsoftConfigured:true}); window.launcherState(window.mockState); });
    await page.evaluate(() => { Object.assign(window.mockState, {microsoftName:'OfficialPlayer'}); window.launcherState(window.mockState); });
    await page.click('#play-button');
    assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), 'play');
    await page.evaluate(() => { Object.assign(window.mockState, {phase:'access',codesRequired:true,codesCount:2}); window.launcherState(window.mockState); });
    assert.equal(await page.locator('#access-inputs input').count(), 2);
    await page.fill('#access-0', 'code-one'); await page.fill('#access-1', 'code-two'); await page.click('#access-button');
    assert.deepEqual(await page.evaluate(() => JSON.parse(window.calls.at(-1)[1])), ['code-one','code-two']);
    await page.evaluate(() => { Object.assign(window.mockState, {phase:'downloading', busy:true, queued:true}); window.launcherState(window.mockState); });
    assert.equal(await page.locator('#server-select').isDisabled(), true);
    assert.equal(await page.locator('#auth-mode').isDisabled(), true);
    await page.click('[data-page="parametres"]');
    assert.equal(await page.locator('#graphics-preset').isDisabled(), true);
    await page.evaluate(() => { Object.assign(window.mockState, {phase:'idle', busy:false, queued:false, updateAvailable:true, updateReady:true}); window.launcherState(window.mockState); });
    assert.equal(await page.locator('#update-notice').isVisible(), true);
    await page.click('#update-settings-button');
    assert.equal(await page.locator('#parametres').isVisible(), true);
    await page.selectOption('#graphics-preset', 'performance');
    assert.equal(await page.evaluate(() => window.calls.at(-1)[1]), 'performance');
    await page.click('#update-button');
    assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), 'update');
    for (const width of [320, 390, 844]) {
      await page.setViewportSize({width, height:width === 844 ? 390 : 844});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal scroll at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(root, 'dist/interface-parametres.png'),fullPage:true});
    await page.click('[data-page="accueil"]');
    await page.evaluate(() => { Object.assign(window.mockState, {phase:'idle',codesRequired:false}); window.launcherState(window.mockState); });
    await page.screenshot({path:path.join(root, 'dist/interface-yapapouaiye.png'),fullPage:true});
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
