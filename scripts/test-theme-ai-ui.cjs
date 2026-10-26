const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 20000, args: ['--disable-gpu'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => console.error('Page:', error.message));
    console.log('Browser ready');
    await page.route('**/*', route => /\.(js)(\?|$)/.test(route.request().url()) || /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.resolve(__dirname, '../src/index.html')).href, { waitUntil: 'domcontentloaded' });
    console.log('Form loaded');
    await page.locator('#boot-overlay').evaluate(el => el.remove());
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer.js'), 'utf8');
    const start = source.indexOf('function initCustomThemeModal()');
    const end = source.indexOf('  // Visual Editor Live Preview & Controls', start);
    const installHandlers = persistedKey => page.evaluate(({ code, persistedKey }) => {
      window.soundPlayer = { stop() {} };
      window.updateCustomThemesManageList = window.updateVisualEditorPreview = window.showToast = () => {};
      window.saved = [];
      window.saveCustomTheme = theme => window.saved.push(theme);
      window.loadThemeIntoVisualEditor = () => {};
      window.escapeHtml = text => text;
      window.parseThemeJson = raw => ({ id: 'custom-test', ...JSON.parse(raw) });
      window.calls = [];
      window.persistedKey = persistedKey;
      window.keyWrites = [];
      window.launcher = {
        getThemeAiApiKey: async () => ({ success: true, apiKey: window.persistedKey }),
        saveThemeAiApiKey: async apiKey => {
          window.keyWrites.push(apiKey);
          if (window.failKeySave) return { success: false, error: 'Stockage sécurisé indisponible' };
          window.persistedKey = apiKey;
          return { success: true };
        },
        generateThemeAi: async payload => {
        window.calls.push(payload);
        if (window.failGeneration) return { success: false, error: 'Clé NVIDIA refusée' };
        return { success: true, content: JSON.stringify({ id: 'custom-new', name: 'Violet', styleMode: 'cyber', colors: { primary: '#a855f7', bgDark: '#101014' } }) };
      }};
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } });
      (0, eval)(`const AI_PROMPT_TEMPLATE = 'SCHEMA JSON'; ${code}\nlet audioEditRevision = 0; } initCustomThemeModal();`);
    }, { code: source.slice(start, end), persistedKey });
    await installHandlers('');
    console.log('Handlers ready');
    const manual = page.locator('#theme-ai-manual-import');
    await page.locator('#btn-open-custom-theme-modal').evaluate(el => el.click());
    console.log('Modal opened');
    assert.equal(await manual.isVisible(), false);
    assert.equal(await page.locator('#tab-ai-import').isVisible(), true);
    const supportedModels = require('../src/theme-ai.cjs').NVIDIA_MODELS;
    const selectableModels = await page.locator('#theme-ai-model option').evaluateAll(options => options.map(option => option.value).filter(value => value !== 'auto'));
    assert.deepEqual(selectableModels, supportedModels);
    for (const model of selectableModels) {
      await page.locator('#theme-ai-model').selectOption(model);
      assert.equal(await page.locator('#theme-ai-model').inputValue(), model);
    }
    await page.locator('#theme-ai-model').selectOption('auto');
    await page.screenshot({ path: path.resolve(__dirname, '../scratch/theme-ai-generator-desktop.png') });
    for (const width of [760, 480]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.locator('#tab-ai-import').evaluate(el => el.scrollWidth <= el.clientWidth), true, `No horizontal overflow at ${width}px`);
      await page.screenshot({ path: path.resolve(__dirname, `../scratch/theme-ai-generator-${width}.png`) });
    }
    await page.setViewportSize({ width: 1100, height: 750 });
    const primaryBounds = await page.locator('#btn-theme-ai-generate').boundingBox();
    const copyBounds = await page.locator('#btn-modal-copy-ai-prompt').boundingBox();
    assert.equal(primaryBounds.y, copyBounds.y, 'Desktop actions align on one row');
    await page.locator('[data-theme-idea]').first().click();
    assert.match(await page.locator('#theme-ai-request').inputValue(), /lapin/);
    await page.locator('#theme-ai-request').fill('');
    await page.locator('#btn-theme-ai-generate').click();
    assert.match(await page.locator('#theme-ai-status').innerText(), /Décrivez/);
    await page.locator('#theme-ai-request').fill('Un thème violet');
    await page.locator('#btn-theme-ai-generate').click();
    assert.match(await page.locator('#theme-ai-status').innerText(), /clé API/);
    await page.locator('#btn-modal-copy-ai-prompt').click();
    assert.equal(await manual.isVisible(), true);
    assert.match(await page.evaluate(() => window.copied), /Un thème violet/);
    await page.locator('#theme-ai-manual-import').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve(__dirname, '../scratch/theme-ai-manual-import.png') });
    await page.locator('#btn-close-custom-theme-modal').click();
    await page.locator('#btn-open-custom-theme-modal').evaluate(el => el.click());
    assert.equal(await manual.isVisible(), false);
    await page.locator('#theme-ai-api-key').fill('nvapi-test');
    await page.locator('#btn-theme-ai-toggle-key').click();
    assert.equal(await page.locator('#theme-ai-api-key').getAttribute('type'), 'text');
    await page.locator('#btn-theme-ai-toggle-key').click();
    assert.equal(await page.locator('#theme-ai-api-key').getAttribute('type'), 'password');
    await page.locator('#theme-ai-model').selectOption('openai/gpt-oss-20b');
    await page.locator('#btn-theme-ai-generate').click();
    await page.waitForFunction(() => window.saved.length === 1);
    assert.equal(await page.evaluate(() => window.persistedKey), 'nvapi-test');
    assert.match(await page.locator('#theme-ai-status').innerText(), /enregistré et activé/);
    assert.equal(await page.locator('#theme-ai-status').getAttribute('data-state'), 'success');
    assert.equal(await page.evaluate(() => window.calls[0].model), 'openai/gpt-oss-20b');
    await page.locator('#theme-ai-request').fill('Des boutons arrondis');
    await page.locator('#btn-theme-ai-generate').click();
    await page.waitForFunction(() => window.saved.length === 2);
    assert.match(await page.evaluate(() => window.calls[1].prompt), /Thème précédent à modifier/);
    assert.equal(await page.evaluate(() => window.saved[0].id === window.saved[1].id), true);
    await page.evaluate(() => { window.failGeneration = true; });
    await page.locator('#btn-theme-ai-generate').click();
    await page.waitForFunction(() => document.getElementById('theme-ai-status').textContent.includes('refusée'));
    assert.equal(await page.locator('#btn-theme-ai-generate').isEnabled(), true);
    assert.equal(await page.locator('#theme-ai-status').getAttribute('data-state'), 'error');
    assert.equal(await page.evaluate(() => window.saved.length), 2);
    await page.locator('.modal-tab-btn[data-tab="tab-visual-editor"]').click();
    await page.locator('#btn-close-custom-theme-modal').click();
    await page.locator('#btn-open-custom-theme-modal').evaluate(el => el.click());
    assert.equal(await page.locator('#tab-ai-import').isVisible(), true);
    await page.locator('#btn-theme-ai-forget-key').click();
    await page.waitForFunction(() => window.persistedKey === '');
    assert.equal(await page.locator('#theme-ai-api-key').inputValue(), '');
    await page.locator('#theme-ai-api-key').fill('nvapi-persisted');
    await page.waitForFunction(() => window.persistedKey === 'nvapi-persisted');
    assert.match(await page.locator('#theme-ai-key-hint').innerText(), /sauvegardée/);
    const persistedKey = await page.evaluate(() => window.persistedKey);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#boot-overlay').evaluate(el => el.remove());
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await installHandlers(persistedKey);
    await page.locator('#btn-open-custom-theme-modal').evaluate(el => el.click());
    await page.waitForFunction(() => document.getElementById('theme-ai-api-key').value === 'nvapi-persisted');
    assert.equal(await page.locator('#theme-ai-api-key').getAttribute('type'), 'password');
    await page.evaluate(() => { window.failKeySave = true; });
    await page.locator('#theme-ai-api-key').fill('nvapi-unsaved');
    await page.waitForFunction(() => document.getElementById('theme-ai-key-hint').dataset.state === 'error');
    assert.equal(await page.evaluate(() => window.persistedKey), persistedKey);
    await page.evaluate(() => { window.failKeySave = false; });
    await page.locator('#btn-theme-ai-forget-key').click();
    await page.waitForFunction(() => window.persistedKey === '');
    assert.equal(await page.locator('#theme-ai-api-key').inputValue(), '');
    await page.screenshot({ path: path.resolve(__dirname, '../scratch/theme-ai-generator.png') });
    console.log('Theme AI UI: default tab, optional key, copy/paste, generation, refinement, errors and reopening passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
