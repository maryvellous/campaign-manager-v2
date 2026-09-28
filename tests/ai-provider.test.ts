import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AiProviderError, AnthropicProvider, DeepSeekProvider, GoogleProvider, OpenAiProvider, type AiCompletionRequest, type AiProvider } from '../packages/ai/src/index';
import { AiService, type AiSecretCodec } from '../apps/desktop/application/ai-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';

test('OpenAI adapter sends fixed Responses API request and extracts output text', async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const provider = new OpenAiProvider(async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Risposta utile' }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const answer = await provider.complete('secret-key', {
    model: 'gpt-5.6-luna',
    messages: [{ id: 'm1', role: 'user', content: 'Ciao', createdAt: new Date(0).toISOString() }],
  });
  assert.equal(answer, 'Risposta utile');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal((request.init?.headers as Record<string, string>).authorization, 'Bearer secret-key');
  const body = JSON.parse(String(request.init?.body));
  assert.equal(body.model, 'gpt-5.6-luna');
  assert.equal(body.store, false);
  assert.deepEqual(body.input, [{ role: 'user', content: 'Ciao' }]);
});

test('OpenAI adapter maps credential and rate-limit failures without exposing the key', async () => {
  const auth = new OpenAiProvider(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
  await assert.rejects(
    auth.complete('private-value', { model: 'gpt-5.6-luna', messages: [] }),
    (error: unknown) => error instanceof AiProviderError && error.code === 'auth/provider_key_invalid' && !error.message.includes('private-value')
  );

  const limited = new OpenAiProvider(async () => new Response(JSON.stringify({ error: { message: 'slow down' } }), { status: 429 }));
  await assert.rejects(
    limited.complete('private-value', { model: 'gpt-5.6-luna', messages: [] }),
    (error: unknown) => error instanceof AiProviderError && error.code === 'rate_limited'
  );
});

test('AI service keeps encrypted provider settings and thread outside the campaign vault', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-ai-'));
  const local = path.join(dir, 'local');
  const vault = path.join(dir, 'vault');
  await fs.mkdir(vault);
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));

  let seenKey = '';
  let seenRequest: AiCompletionRequest | undefined;
  const provider: AiProvider = {
    async complete(key, request) {
      seenKey = key;
      seenRequest = request;
      return 'Va bene.';
    }
  };
  const codec: AiSecretCodec = {
    available: () => true,
    encrypt: value => Buffer.from('encrypted:' + value).toString('base64'),
    decrypt: value => Buffer.from(value, 'base64').toString('utf8').replace(/^encrypted:/u, ''),
  };
  const store = new LocalStore(local);
  const service = new AiService(store, codec, provider);
  await service.initialize();
  assert.equal(service.state.status, 'not_configured');

  const campaignId = '11111111-1111-4111-8111-111111111111';
  await service.bindCampaign(campaignId);
  await service.configure('openai', 'sk-example-secret', 'gpt-5.6-terra');
  assert.equal(service.state.configured, true);
  assert.equal(service.state.model, 'gpt-5.6-terra');

  const savedSettings = await fs.readFile(path.join(local, 'ai', 'preferences.json'), 'utf8');
  assert.equal(savedSettings.includes('sk-example-secret'), false);
  assert.equal(savedSettings.includes('encryptedKey'), true);
  assert.deepEqual(await fs.readdir(vault), []);

  await service.acceptPrivacy();
  await service.send('Dimmi qualcosa', { label: 'Campagna intera', text: '', sources: [] });
  assert.equal(seenKey, 'sk-example-secret');
  assert.equal(seenRequest?.model, 'gpt-5.6-terra');
  assert.equal(seenRequest?.messages.at(-1)?.content, 'Dimmi qualcosa');
  assert.equal(service.state.messages.length, 2);
  assert.equal(service.state.messages[1].content, 'Va bene.');

  const threadPath = path.join(local, 'campaigns', campaignId, 'ai', 'thread.json');
  const storedThread = JSON.parse(await fs.readFile(threadPath, 'utf8'));
  assert.equal(storedThread.messages.length, 2);
  assert.deepEqual(await fs.readdir(vault), []);

  await service.newConversation();
  await assert.rejects(fs.stat(threadPath), { code: 'ENOENT' });
});

test('AI service requires privacy acknowledgement before the first remote request', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-ai-privacy-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const provider: AiProvider = { async complete() { calls++; return 'no'; } };
  const codec: AiSecretCodec = { available: () => true, encrypt: value => value, decrypt: value => value };
  const service = new AiService(new LocalStore(path.join(dir, 'local')), codec, provider);
  await service.initialize();
  await service.bindCampaign('22222222-2222-4222-8222-222222222222');
  await service.configure('openai', 'key', 'gpt-5.6-luna');
  await assert.rejects(service.send('test', { label: 'Campagna intera', text: '', sources: [] }), { code: 'permission_denied' });
  assert.equal(calls, 0);
  assert.equal(service.state.messages.length, 0);
});


test('AI service sends prepared retrieval instructions and records only verified sources on the answer', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-ai-context-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  let request: AiCompletionRequest | undefined;
  const provider: AiProvider = { async complete(_key, value) { request = value; return 'Da campagna.'; } };
  const codec: AiSecretCodec = { available: () => true, encrypt: value => value, decrypt: value => value };
  const service = new AiService(new LocalStore(path.join(dir, 'local')), codec, provider);
  await service.initialize();
  await service.bindCampaign('33333333-3333-4333-8333-333333333333');
  await service.configure('openai', 'key', 'gpt-5.6-luna');
  await service.acceptPrivacy();
  const source = { noteId: 'NPC/Maya.md', title: 'Maya', relativePath: 'NPC/Maya.md' };
  await service.send('Chi è Maya?', { label: 'Nota · Maya', text: '=== NOTA: NPC/Maya.md ===\nMaya è la regina.', sources: [source] });
  assert.match(request?.instructions ?? '', /Maya è la regina/u);
  assert.deepEqual(service.state.messages.at(-1)?.sources, [source]);
});


test('Anthropic adapter uses Messages API and extracts text blocks', async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const provider = new AnthropicProvider(async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Risposta Claude' }] }), { status: 200 });
  });
  const answer = await provider.complete('anthropic-secret', {
    model: 'claude-sonnet-5',
    instructions: 'Istruzioni',
    messages: [{ id: 'm1', role: 'user', content: 'Ciao', createdAt: new Date(0).toISOString() }],
  });
  assert.equal(answer, 'Risposta Claude');
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer anthropic-secret');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(String(request.init?.body));
  assert.equal(body.model, 'claude-sonnet-5');
  assert.equal(body.system, 'Istruzioni');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Ciao' }]);
});

test('Google adapter uses Gemini generateContent and maps assistant turns to model', async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const provider = new GoogleProvider(async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Risposta Gemini' }] } }],
    }), { status: 200 });
  });
  const answer = await provider.complete('google-secret', {
    model: 'gemini-3.8-flash',
    instructions: 'Istruzioni',
    messages: [
      { id: 'm1', role: 'user', content: 'Ciao', createdAt: new Date(0).toISOString() },
      { id: 'm2', role: 'assistant', content: 'Salve', createdAt: new Date(1).toISOString() },
    ],
  });
  assert.equal(answer, 'Risposta Gemini');
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal((request.init?.headers as Record<string, string>)['x-goog-api-key'], 'google-secret');
  const body = JSON.parse(String(request.init?.body));
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Istruzioni' }] });
  assert.deepEqual(body.contents, [
    { role: 'user', parts: [{ text: 'Ciao' }] },
    { role: 'model', parts: [{ text: 'Salve' }] },
  ]);
});

test('DeepSeek adapter uses Chat Completions and extracts final answer', async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const provider = new DeepSeekProvider(async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', reasoning_content: 'interno', content: 'Risposta DeepSeek' } }],
    }), { status: 200 });
  });
  const answer = await provider.complete('deepseek-secret', {
    model: 'deepseek-flash',
    instructions: 'Istruzioni',
    messages: [{ id: 'm1', role: 'user', content: 'Ciao', createdAt: new Date(0).toISOString() }],
  });
  assert.equal(answer, 'Risposta DeepSeek');
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.equal((request.init?.headers as Record<string, string>).authorization, 'Bearer deepseek-secret');
  const body = JSON.parse(String(request.init?.body));
  assert.equal(body.model, 'deepseek-flash');
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Istruzioni' },
    { role: 'user', content: 'Ciao' },
  ]);
});

test('AI service switches provider, persists it and requires fresh privacy consent', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-ai-provider-switch-'));
  t.after(async () => fs.rm(dir, { recursive: true, force: true }));
  const calls: string[] = [];
  const fake = (name: string): AiProvider => ({ async complete() { calls.push(name); return name; } });
  const codec: AiSecretCodec = { available: () => true, encrypt: value => value, decrypt: value => value };
  const store = new LocalStore(path.join(dir, 'local'));
  const service = new AiService(store, codec, {
    openai: fake('openai'),
    anthropic: fake('anthropic'),
    google: fake('google'),
    deepseek: fake('deepseek'),
  });
  await service.initialize();
  await service.bindCampaign('44444444-4444-4444-8444-444444444444');
  await service.configure('openai', 'openai-key', 'gpt-5.6-luna');
  await service.acceptPrivacy();
  assert.equal(service.state.privacyAccepted, true);

  await service.configure('anthropic', 'anthropic-key', 'claude-sonnet-5');
  assert.equal(service.state.provider, 'anthropic');
  assert.equal(service.state.model, 'claude-sonnet-5');
  assert.equal(service.state.privacyAccepted, false);
  await assert.rejects(service.send('test', { label: 'Campagna intera', text: '', sources: [] }), { code: 'permission_denied' });
  await service.acceptPrivacy();
  await service.send('test', { label: 'Campagna intera', text: '', sources: [] });
  assert.deepEqual(calls, ['anthropic']);

  const saved = JSON.parse(await fs.readFile(path.join(dir, 'local', 'ai', 'preferences.json'), 'utf8'));
  assert.equal(saved.provider, 'anthropic');
  assert.equal(saved.model, 'claude-sonnet-5');
});
