// SPDX-License-Identifier: GPL-3.0-or-later
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateFirebaseConfig } = require('../firebase-config.cjs');

function config(packageName = 'com.example.launcher') {
  return { project_info: { project_id: 'launcher-test', project_number: '123456' }, client: [{
    client_info: { mobilesdk_app_id: '1:123456:android:abcdef123456', android_client_info: { package_name: packageName } },
    api_key: [{ current_key: 'public-test-configuration' }]
  }] };
}

test('selects the exact Android client among multiple registered apps', () => {
  const value = config('com.example.other');
  value.client.push(config().client[0]);
  assert.equal(validateFirebaseConfig(value, 'com.example.launcher').appId, '1:123456:android:abcdef123456');
});
test('rejects a missing package and never rewrites the supplied Firebase registration', () => {
  const value = config(); const original = JSON.stringify(value);
  assert.throws(() => validateFirebaseConfig(value, 'com.example.launcher.debug'), /exactement un client/);
  assert.equal(JSON.stringify(value), original);
});
test('rejects ambiguous registrations and mismatched project/app IDs', () => {
  const value = config(); value.client.push(value.client[0]);
  assert.throws(() => validateFirebaseConfig(value, 'com.example.launcher'), /exactement un client/);
  const mismatch = config(); mismatch.project_info.project_number = '654321';
  assert.throws(() => validateFirebaseConfig(mismatch, 'com.example.launcher'), /incohérente/);
});
