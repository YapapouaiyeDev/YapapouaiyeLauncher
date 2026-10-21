const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPlayer, profiles } = require('../src/sounds');

function player() {
  const sounds = [];
  class Audio {
    constructor(src) { this.src = src; this.paused = true; this.ended = false; this.plays = 0; sounds.push(this); }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  return { ...createPlayer(Audio), sounds };
}

test('every saved profile has a packaged Ogg recording', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  for (const id of Object.values(profiles).flat()) {
    const file = fs.readFileSync(path.join(__dirname, '../src/assets/sounds', `${id}.ogg`));
    assert.equal(file.subarray(0, 4).toString(), 'OggS');
    assert.ok(file.length > 1000);
    assert.ok(html.includes(`value="${id}"`), id);
  }
});

test('preview replaces the current sound and prevents an additional UI click', async () => {
  const p = player();
  await p.play('click', 'minecraft_stone');
  const click = p.sounds.find(a => a.src.endsWith('minecraft_stone.ogg'));
  assert.equal(click.paused, false);
  await p.play('launch', 'portal_warp', '', true);
  assert.equal(click.paused, true);
  assert.equal(await p.play('click', 'minecraft_stone'), false);
  const portal = p.sounds.find(a => a.src.endsWith('portal_warp.ogg'));
  await p.play('click', 'magic_chime', '', true);
  assert.equal(portal.paused, true);
  p.stop('preview');
  assert.ok(p.sounds.every(a => a.paused));
});

test('custom click and launch files are independent; silence does not play a fallback', async () => {
  const p = player();
  await p.play('click', 'custom', 'data:audio/ogg;base64,click', true);
  await p.play('launch', 'custom', 'data:audio/ogg;base64,launch', true);
  assert.equal(p.sounds.at(-2).paused, true);
  assert.equal(p.sounds.at(-1).src, 'data:audio/ogg;base64,launch');
  const count = p.sounds.reduce((n, a) => n + a.plays, 0);
  assert.equal(await p.play('launch', 'none', '', true), true);
  assert.equal(await p.play('launch', 'custom', '', true), false);
  assert.equal(p.sounds.reduce((n, a) => n + a.plays, 0), count);
});

test('duplicate handlers produce a single click; unknown legacy profiles use a real recording', async () => {
  const p = player();
  await Promise.all([p.play('click', 'old-profile'), p.play('click', 'old-profile')]);
  assert.equal(p.sounds.reduce((n, a) => n + a.plays, 0), 1);
  assert.equal(p.sounds.find(a => a.plays).src, 'assets/sounds/minecraft_stone.ogg');
});

test('a superseded playback rejection does not clear the replacement', async () => {
  const sounds = [];
  let rejectFirst;
  class Audio {
    constructor(src) { this.src = src; this.paused = true; this.calls = 0; sounds.push(this); }
    play() {
      this.paused = false;
      return ++this.calls === 1 ? new Promise((_, reject) => { rejectFirst = reject; }) : Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const p = createPlayer(Audio);
  const first = p.play('click', 'magic_chime', '', true);
  await p.play('click', 'magic_chime', '', true);
  rejectFirst(Object.assign(new Error('Interrupted'), { name: 'AbortError' }));
  assert.equal(await first, true);
  p.stop('preview');
  assert.equal(sounds.find(a => a.calls).paused, true);
});
