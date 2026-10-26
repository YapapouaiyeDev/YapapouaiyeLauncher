const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateThemeAi, NVIDIA_MODELS } = require('../src/theme-ai.cjs');
const fs = require('node:fs');
const path = require('node:path');

const payload = { apiKey: 'nvapi-test', prompt: 'Un thème violet' };
test('NVIDIA receives the request and returns theme JSON', async () => {
  const result = await generateThemeAi(payload, async (url, options) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer nvapi-test');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.messages[0].content, payload.prompt);
    assert.equal(body.stream, false);
    assert.equal(body.chat_template_kwargs.enable_thinking, false);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"name":"Violet"}' } }] }) };
  });
  assert.equal(result.content, '{"name":"Violet"}');
});
test('missing credentials and oversized prompts never contact NVIDIA', async () => {
  const unexpectedFetch = () => { throw new Error('Unexpected request'); };
  assert.equal((await generateThemeAi({ ...payload, apiKey: '' }, unexpectedFetch)).success, false);
  assert.equal((await generateThemeAi({ ...payload, prompt: 'a'.repeat(100001) }, unexpectedFetch)).success, false);
});
test('authentication, rate limits, incomplete output and network failures are recoverable', async () => {
  for (const status of [401, 403, 429, 500]) {
    const result = await generateThemeAi(payload, async () => ({ ok: false, status }));
    assert.equal(result.success, false);
    assert.ok(!result.error.includes(payload.apiKey));
  }
  for (const choice of [{ message: { content: '' } }, { finish_reason: 'length', message: { content: '{}' } }]) {
    assert.equal((await generateThemeAi(payload, async () => ({ ok: true, json: async () => ({ choices: [choice] }) }))).success, false);
  }
  const timeout = await generateThemeAi(payload, async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); });
  assert.match(timeout.error, /trop de temps/);
});

test('automatic mode skips a missing NVIDIA model after a 404', async () => {
  const models = [];
  const result = await generateThemeAi(payload, async (_, options) => {
    models.push(JSON.parse(options.body).model);
    if (models.length === 1) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"name":"Lapin"}' } }] }) };
  });
  assert.equal(result.success, true);
  assert.equal(models.length, 2);
  assert.notEqual(models[0], models[1]);
  assert.equal(result.model, models[1]);
});

test('explicit models never switch silently and 404 errors provide a next step', async () => {
  let requests = 0;
  const result = await generateThemeAi({ ...payload, model: 'nvidia/llama-3.1-nemotron-70b-instruct' }, async (_, options) => {
    requests++;
    assert.equal(JSON.parse(options.body).model, 'nvidia/llama-3.1-nemotron-70b-instruct');
    return { ok: false, status: 404 };
  });
  assert.equal(requests, 1);
  assert.equal(result.success, false);
  assert.match(result.error, /Automatique/);
  const missing = await generateThemeAi(payload, async () => ({ ok: false, status: 404 }));
  assert.equal(missing.success, false);
  assert.match(missing.error, /accès de votre compte/);
  assert.equal((await generateThemeAi({ ...payload, model: 'unknown' }, () => assert.fail('Unexpected request'))).success, false);
});

test('automatic mode does not retry a rejected key', async () => {
  let requests = 0;
  await generateThemeAi(payload, async () => { requests++; return { ok: false, status: 401 }; });
  assert.equal(requests, 1);
});

test('every selectable model is accepted by Electron and Tauri', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
  const select = html.match(/<select id="theme-ai-model"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]).filter(id => id !== 'auto');
  assert.deepEqual(options, NVIDIA_MODELS);
  const rust = fs.readFileSync(path.join(__dirname, '../src-tauri/src/commands.rs'), 'utf8');
  const rustModels = [...rust.match(/let supported_models = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(rustModels, NVIDIA_MODELS);
  for (const model of options) {
    let requests = 0;
    const result = await generateThemeAi({ ...payload, model }, async (_, options) => {
      requests++;
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      if (model === 'openai/gpt-oss-20b') {
        assert.equal(body.max_tokens, 4096);
        assert.equal(body.reasoning_effort, 'low');
      }
      if (model === 'moonshotai/kimi-k2.6') assert.equal(body.chat_template_kwargs.thinking, false);
      if (model === 'google/gemma-4-31b-it') assert.equal(body.chat_template_kwargs.enable_thinking, false);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"name":"Test"}' } }] }) };
    });
    assert.equal(requests, 1);
    assert.equal(result.success, true, model);
    assert.equal(result.model, model);
  }
});
