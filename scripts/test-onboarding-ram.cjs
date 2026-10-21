const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/renderer.js'), 'utf8');
function element(value = '') {
  const classes = new Set();
  return {
    value, dataset: {}, hidden: false, textContent: '', attributes: {}, listeners: {},
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
  };
}

function controls(total) {
  const cards = Array.from({ length: 3 }, () => {
    const card = element();
    card.amount = element();
    card.querySelector = () => card.amount;
    return card;
  });
  const slider = element();
  const display = element();
  const tag = element();
  const context = vm.createContext({
    systemRamGB: total, ramMin: 2, ramMax: 2,
    ramSlider: element(6), ramValue: element(), settingsRam: element(6), settingsRamValue: element(),
    window: { launcher: { getSystemRam: async () => total } },
    console: { error() {} },
    document: {
      querySelectorAll: () => cards,
      getElementById: id => ({
        'onboarding-ram-slider': slider,
        'onboarding-ram-val-display': display,
        'onboarding-system-ram-tag': tag,
      })[id],
    },
  });
  vm.runInContext(source.slice(source.indexOf('function getRamProfile('), source.indexOf('// Navigation between pages')), context);
  vm.runInContext(source.slice(source.indexOf('function initOnboardingRamControls('), source.indexOf('function initOnboardingWizard(')), context);
  return { context, cards, slider, display, tag };
}

test('RAM choices scale to each PC and reserve system memory', () => {
  for (const [total, recommended, max] of [[4, 2, 2], [8, 4, 5], [16, 8, 13], [31, 8, 28], [64, 8, 61]]) {
    const ui = controls(total);
    ui.context.initOnboardingRamControls();
    assert.equal(Number(ui.slider.value), recommended);
    assert.equal(ui.slider.max, max);
    assert.equal(ui.display.textContent, `${recommended} Go`);
    assert.equal(ui.tag.textContent, `RAM système détectée : ${total} Go`);
    const visible = ui.cards.filter(card => !card.hidden);
    const values = visible.map(card => Number(card.dataset.ram));
    assert.equal(new Set(values).size, values.length);
    assert.ok(values.every(value => value >= 2 && value <= max));
    assert.equal(visible.filter(card => card.classList.contains('active')).length, 1);
    assert.equal(ui.cards[1].attributes['aria-pressed'], 'true');
  }
});

test('preset clicks and custom slider keep labels and selection in sync', () => {
  const ui = controls(16);
  ui.context.initOnboardingRamControls();
  ui.cards[2].listeners.click();
  assert.equal(Number(ui.slider.value), 10);
  assert.equal(ui.display.textContent, '10 Go');
  assert.equal(ui.cards[2].attributes['aria-pressed'], 'true');
  ui.slider.value = 11;
  ui.slider.listeners.input();
  assert.equal(ui.display.textContent, '11 Go');
  assert.ok(ui.cards.every(card => !card.classList.contains('active')));
  ui.slider.value = 99;
  ui.slider.listeners.input();
  assert.equal(Number(ui.slider.value), 13);
  assert.equal(ui.display.textContent, '13 Go');
});

test('Welcome and settings share limits, including failed or invalid detection', async () => {
  for (const total of [4, 8, 16, 31, 64, null, NaN, Infinity, 0, -1, '16']) {
    const ui = controls(total);
    await ui.context.initRamLimits();
    ui.context.initOnboardingRamControls();
    assert.equal(ui.slider.max, ui.context.ramSlider.max);
    assert.equal(ui.slider.max, ui.context.settingsRam.max);
    assert.ok(Number(ui.context.ramSlider.value) <= ui.slider.max);
    if (!Number.isFinite(total) || total <= 0) {
      assert.equal(ui.slider.max, 2);
      assert.match(ui.tag.textContent, /indisponible/);
    }
  }
  const ui = controls(null);
  ui.context.window.launcher.getSystemRam = async () => { throw new Error('IPC unavailable'); };
  await ui.context.initRamLimits();
  ui.context.initOnboardingRamControls();
  assert.equal(ui.slider.max, 2);
  assert.match(ui.tag.textContent, /indisponible/);
});
