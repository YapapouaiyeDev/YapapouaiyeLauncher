const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
function definition(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

test('recovered and newly launched games keep a disabled En jeu button through theme application', () => {
  const button = { innerHTML: '', disabled: false };
  const context = vm.createContext({
    selectedAccountUuid: 'AB-CD', gameSessions: [], launchInProgress: false,
    document: { getElementById: id => id === 'btn-play' ? button : null,
      documentElement: { style: { setProperty() {}, removeProperty() {} } } },
    applyGoogleFont() {}, getButtonIconSvg: () => '<svg></svg>', escapeHtml: value => value,
  });
  vm.runInContext(['sessionForAccount', 'updatePlayButtonContent', 'applyThemeMediaAndCustomization'].map(definition).join('\n'), context);
  const theme = { id: 'custom', images: { playButtonText: 'DÉMARRER' } };
  context.applyThemeMediaAndCustomization(theme);
  assert.match(button.innerHTML, /DÉMARRER/);
  assert.equal(button.disabled, false);

  for (const mode of ['game', 'relay']) {
    context.gameSessions = [{ accountUuid: 'abcd', state: 'running', mode }];
    context.applyThemeMediaAndCustomization(theme);
    assert.match(button.innerHTML, /EN JEU/);
    assert.equal(button.disabled, true);
    // Reapplying another theme after restoring a session must not overwrite its state.
    context.applyThemeMediaAndCustomization({ id: 'vanilla' });
    assert.match(button.innerHTML, /EN JEU/);
    assert.equal(button.disabled, true);
  }
  context.gameSessions = [{ accountUuid: 'abcd', state: 'preparing' }];
  context.applyThemeMediaAndCustomization(theme);
  assert.match(button.innerHTML, /PRÉPARATION…/);
  assert.equal(button.disabled, true);
  context.gameSessions = [];
  context.applyThemeMediaAndCustomization(theme);
  assert.match(button.innerHTML, /DÉMARRER/);
  assert.equal(button.disabled, false);
  context.gameSessions = [{ accountUuid: 'different-account', state: 'running' }];
  context.applyThemeMediaAndCustomization(theme);
  assert.equal(button.disabled, false, 'another account can still be launched');
});
