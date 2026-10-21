const test = require('node:test');
const assert = require('node:assert/strict');
const { skinForAccount, candidates } = require('../src/account-avatars');

test('Microsoft avatars use the current cached skin without exposing the account profile', () => {
  const skin = 'data:image/png;base64,aGVsbG8=';
  assert.equal(skinForAccount({ access_token: 'secret', profile: { skins: [
    { state: 'INACTIVE', base64: 'data:image/png;base64,b2xk' },
    { state: 'ACTIVE', base64: skin },
  ] } }), skin);
  assert.equal(skinForAccount({ profile: { skins: [{ state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/abc123' }] } }), 'https://textures.minecraft.net/texture/abc123');
  assert.equal(skinForAccount({ profile: { skins: [{ state: 'ACTIVE', url: 'https://untrusted.example/skin.png' }] } }), null);
});

test('fallback services resolve a Microsoft account by UUID even when a name is present', () => {
  const urls = candidates('OldName', '12345678-abcd-4abc-abcd-123456789abc', 40);
  assert.equal(urls.length, 3);
  assert.ok(urls.every(url => url.includes('12345678abcd4abcabcd123456789abc')));
  assert.ok(urls.every(url => !url.includes('OldName')));
  assert.match(candidates('OfflineName', '12345678-abcd-3abc-abcd-123456789abc', 40)[0], /OfflineName\/40$/);
  assert.deepEqual(candidates('Non connecté', null), []);
});
