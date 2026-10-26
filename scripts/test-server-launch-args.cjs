const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getServerLaunchArgs } = require('../src/server-launch-args');

test('modern Minecraft joins the selected server through Quick Play, including custom ports', () => {
  for (const version of ['1.20', '1.21.1', '26.2']) {
    assert.deepEqual(getServerLaunchArgs(version, { host: 'play.example.org', gamePort: 22583 }),
      ['--quickPlayMultiplayer', 'play.example.org:22583']);
  }
  assert.deepEqual(getServerLaunchArgs('26.2', { host: '::1', gamePort: 25566 }),
    ['--quickPlayMultiplayer', '[::1]:25566']);
  assert.deepEqual(getServerLaunchArgs('26.2', { host: '[::1]' }),
    ['--quickPlayMultiplayer', '[::1]:25565']);
});

test('older Minecraft retains its supported automatic connection arguments', () => {
  assert.deepEqual(getServerLaunchArgs('1.19.4', { host: 'localhost', gamePort: 25565 }),
    ['--server', 'localhost', '--port', '25565']);
});

test('a host containing the manual connection port is not treated as IPv6 or given a second port', () => {
  for (const host of ['135.181.238.19:42534', 'play.example.org:42534', ' 135.181.238.19:42534 ']) {
    const address = host.trim();
    assert.deepEqual(getServerLaunchArgs('26.2', { host, gamePort: 42534 }),
      ['--quickPlayMultiplayer', address]);
    assert.deepEqual(getServerLaunchArgs('1.19.4', { host, gamePort: 25565 }),
      ['--server', address.split(':')[0], '--port', '42534']);
    assert.deepEqual(getServerLaunchArgs('1.21.1', { host }),
      ['--quickPlayMultiplayer', address]);
  }
  assert.deepEqual(getServerLaunchArgs('26.2', { host: '[2001:db8::1]:42534', gamePort: 25565 }),
    ['--quickPlayMultiplayer', '[2001:db8::1]:42534']);
  assert.deepEqual(getServerLaunchArgs('1.19.4', { host: '[::1]:42534' }),
    ['--server', '::1', '--port', '42534']);
});

test('invalid destinations fail before starting Minecraft', () => {
  for (const server of [{ host: '' }, { host: 'localhost', gamePort: 0 }, { host: 'localhost', gamePort: 65536 },
    { host: 'localhost:65536' }, { host: 'localhost:0' }, { host: 'localhost:abc' },
    { host: '[localhost]:25565' }, { host: 'https://localhost:25565' }]) {
    assert.throws(() => getServerLaunchArgs('26.2', server), /invalide/);
  }
});

test('the installed launch library forwards the automatic connection arguments', async () => {
  const MinecraftArguments = require('../node_modules/minecraft-java-core/build/Minecraft/Minecraft-Arguments').default;
  const extra = getServerLaunchArgs('26.2', { host: 'play.example.org:22583', gamePort: 22583 });
  const builder = new MinecraftArguments({
    path: 'minecraft', GAME_ARGS: [...extra, '--fullscreen'],
    authenticator: { name: 'Test', uuid: 'test', access_token: 'test', meta: { type: 'msa' } },
  });
  const args = await builder.GetGameArguments({ id: '26.2', assetIndex: { id: '32' }, arguments: { game: ['--username', '${auth_player_name}'] } });
  assert.deepEqual(args.slice(-3), [...extra, '--fullscreen']);
  assert.equal(args.includes('--server'), false);
});
