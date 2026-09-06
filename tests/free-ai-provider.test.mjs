import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AI_CONNECTION,
  AI_PROVIDER,
  activeConnectionState,
  connectionPresentation,
  normaliseAiProvider,
} from '../public/ai/ai-provider.js';
import { createAiService } from '../public/ai/ai-service.js';
import {
  FreeAIError,
  POLLINATIONS_API_BASE_URL,
  POLLINATIONS_AUTH_BASE_URL,
  POLLINATIONS_DEFAULT_MODEL,
  POLLINATIONS_SESSION_KEY,
  createPollinationsProvider,
  extractPollinationsText,
  freeAiMessage,
} from '../public/ai/pollinations-provider.js';
import { buildRecoveryAiRequest, recoverPath } from '../server/recovery.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function response(payload, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => payload };
}

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = value; },
    removeItem: (key) => { delete values[key]; },
  };
}

test('provider state defaults unknown settings to Custom API and exposes explicit Free AI states', () => {
  assert.equal(normaliseAiProvider(undefined), AI_PROVIDER.CUSTOM);
  assert.equal(normaliseAiProvider('unknown'), AI_PROVIDER.CUSTOM);
  assert.equal(normaliseAiProvider('pollinations'), AI_PROVIDER.POLLINATIONS);
  assert.equal(activeConnectionState({ activeProvider: 'custom', customReady: true }), AI_CONNECTION.CUSTOM_CONNECTED);
  assert.equal(activeConnectionState({ activeProvider: 'custom', customReady: false }), AI_CONNECTION.NO_PROVIDER);
  assert.equal(activeConnectionState({ activeProvider: 'custom', customReady: true, customError: true }), AI_CONNECTION.CUSTOM_ERROR);
  assert.equal(activeConnectionState({ activeProvider: 'pollinations', pollinationsStatus: AI_CONNECTION.POLLINATIONS_CONNECTED }), AI_CONNECTION.POLLINATIONS_CONNECTED);
  assert.equal(activeConnectionState({ activeProvider: 'pollinations', pollinationsStatus: AI_CONNECTION.POLLINATIONS_CONNECTING }), AI_CONNECTION.POLLINATIONS_CONNECTING);
  assert.equal(connectionPresentation(AI_CONNECTION.CUSTOM_CONNECTED).label, 'Custom API Connected');
  assert.equal(connectionPresentation(AI_CONNECTION.POLLINATIONS_CONNECTED).label, 'Free AI Connected');
  assert.equal(connectionPresentation(AI_CONNECTION.POLLINATIONS_CONNECTING).tone, 'pending');
  assert.equal(connectionPresentation(AI_CONNECTION.NO_PROVIDER).label, 'AI Not Connected');
});

test('the central AI service routes only to the user-selected adapter', async () => {
  const calls = [];
  const custom = {
    generate: async (request) => { calls.push(['custom', request.operation]); return 'custom-result'; },
    fetchModels: async () => ['custom-model'],
  };
  const pollinations = {
    generate: async (request) => { calls.push(['pollinations', request.operation]); return 'free-result'; },
    isConnected: async () => true,
    connect: async () => true,
    cancelConnection: () => true,
    disconnect: async () => true,
    testConnection: async () => true,
  };
  const service = createAiService({ custom, pollinations });
  assert.equal(await service.generate({ provider: 'custom', operation: 'insight', payload: {} }), 'custom-result');
  assert.equal(await service.generate({ provider: 'pollinations', operation: 'recover', payload: {} }), 'free-result');
  assert.deepEqual(calls, [['custom', 'insight'], ['pollinations', 'recover']], 'there is no silent fallback to the other provider');
  assert.deepEqual(await service.fetchCustomModels({}), ['custom-model']);
  assert.equal(service.cancelFreeAiConnection(), true);
});

test('device authorization is deduplicated, session-only, and powers a browser-side request', async () => {
  const storage = memoryStorage();
  const requests = [];
  const waits = [];
  let tokenPolls = 0;
  const delegatedToken = 'delegated-session-value';
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url: String(url), method: options.method || 'GET', headers: { ...(options.headers || {}) }, body });
    if (url === `${POLLINATIONS_AUTH_BASE_URL}/api/device/code`) {
      return response({
        device_code: 'temporary-device-code',
        user_code: 'ABCD1234',
        verification_uri_complete: `${POLLINATIONS_AUTH_BASE_URL}/device?user_code=ABCD1234`,
        expires_in: 1800,
        interval: 5,
      });
    }
    if (url === `${POLLINATIONS_AUTH_BASE_URL}/api/device/token`) {
      tokenPolls += 1;
      return tokenPolls === 1
        ? response({ error: 'authorization_pending' }, false, 400)
        : response({ access_token: delegatedToken });
    }
    if (url === `${POLLINATIONS_AUTH_BASE_URL}/api/device/userinfo`) return response({ sub: 'account-1' });
    if (url === `${POLLINATIONS_API_BASE_URL}/chat/completions`) {
      const prompt = body?.messages?.[0]?.content || '';
      const content = prompt.includes('Reply with exactly')
        ? 'Git-Up connection successful.'
        : '{"provider":"pollinations"}';
      return response({ choices: [{ message: { content } }] });
    }
    if (url === '/api/ai/prepare') {
      return response({ ok: true, request: { messages: [{ role: 'user', content: 'Prepared public repository context' }], options: { temperature: 0.2, max_tokens: 80 } } });
    }
    if (url === '/api/insight') return response({ ok: true, insight: { title: 'Pollinations result', bullets: [] } });
    return response({ ok: false, error: 'unexpected route' }, false, 404);
  };
  const provider = createPollinationsProvider({
    storage,
    fetchImpl,
    wait: async (ms) => { waits.push(ms); },
  });

  const authorizations = [];
  const firstConnect = provider.connect({ onAuthorization: (value) => authorizations.push(value) });
  const secondConnect = provider.connect();
  assert.strictEqual(firstConnect, secondConnect, 'rapid Connect actions share one device flow');
  assert.equal(await firstConnect, true);
  assert.equal(authorizations.length, 1);
  assert.deepEqual(Object.keys(authorizations[0]).sort(), ['expiresAt', 'userCode', 'verificationUri']);
  assert.equal(authorizations[0].userCode, 'ABCD1234');
  assert.match(authorizations[0].verificationUri, /^https:\/\/enter\.pollinations\.ai\/device/);
  assert.deepEqual(waits, [5000, 5000], 'polling honors the provider interval');
  const codeRequest = requests.find((entry) => entry.url.endsWith('/api/device/code'));
  assert.deepEqual(codeRequest.body, { scope: 'generate' }, 'authorization requests only generation scope and no app secret');
  const tokenRequests = requests.filter((entry) => entry.url.endsWith('/api/device/token'));
  assert.equal(tokenRequests.every((entry) => entry.body.grant_type === 'urn:ietf:params:oauth:grant-type:device_code'), true);
  assert.equal(tokenRequests.some((entry) => 'client_secret' in entry.body), false);
  assert.equal(storage.values[POLLINATIONS_SESSION_KEY], delegatedToken, 'delegated authorization is kept in session storage');

  assert.equal(await provider.testConnection(), true);
  const insight = await provider.generate({ operation: 'insight', payload: { repoUrl: 'https://github.com/acme/widget' }, fetchImpl });
  assert.equal(insight.title, 'Pollinations result');

  const chatRequests = requests.filter((entry) => entry.url === `${POLLINATIONS_API_BASE_URL}/chat/completions`);
  assert.equal(chatRequests.length, 2, 'the explicit test and repository review each use Pollinations');
  assert.equal(chatRequests[0].body.max_tokens, 24, 'the connection test is deliberately small');
  const chatRequest = chatRequests.at(-1);
  assert.equal(chatRequest.body.model, POLLINATIONS_DEFAULT_MODEL);
  assert.equal(chatRequest.body.stream, false);
  assert.equal(chatRequests.every((entry) => entry.headers.Authorization === `Bearer ${delegatedToken}`), true);
  const finalRequest = requests.find((entry) => entry.url === '/api/insight');
  assert.equal(finalRequest.body.provider, 'pollinations');
  assert.equal(finalRequest.body.providerResult, '{"provider":"pollinations"}');
  assert.equal('apiKey' in finalRequest.body, false, 'Custom credentials are never mixed into the free-provider request');
  assert.equal('access_token' in finalRequest.body, false, 'the delegated token never reaches the Git-Up server');
  assert.equal(requests.some((entry) => entry.url.includes(delegatedToken)), false, 'the delegated token is never placed in a URL');

  await provider.disconnect();
  assert.equal(storage.values[POLLINATIONS_SESSION_KEY], undefined);
  await assert.rejects(
    provider.generate({ operation: 'insight', payload: {}, fetchImpl }),
    (error) => error?.code === 'auth-required',
    'a disconnected provider fails explicitly instead of silently using Custom API',
  );
});

test('device authorization supports cancellation, denial, and bounded expiry', async () => {
  const codePayload = {
    device_code: 'temporary-device-code',
    user_code: 'ZXCV5678',
    verification_uri_complete: `${POLLINATIONS_AUTH_BASE_URL}/device?user_code=ZXCV5678`,
    expires_in: 1800,
    interval: 5,
  };

  let releaseAuthorization;
  const authorizationReady = new Promise((resolve) => { releaseAuthorization = resolve; });
  const cancelled = createPollinationsProvider({
    storage: memoryStorage(),
    fetchImpl: async () => response(codePayload),
    wait: (_ms, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new FreeAIError('authorization-cancelled', 'cancelled')), { once: true });
    }),
  });
  const cancelledConnection = cancelled.connect({ onAuthorization: releaseAuthorization });
  await authorizationReady;
  assert.equal(cancelled.cancelConnection(), true);
  await assert.rejects(cancelledConnection, (error) => error?.code === 'authorization-cancelled');

  const denied = createPollinationsProvider({
    storage: memoryStorage(),
    fetchImpl: async (url) => url.endsWith('/api/device/code')
      ? response(codePayload)
      : response({ error: 'access_denied' }, false, 400),
    wait: async () => {},
  });
  await assert.rejects(denied.connect(), (error) => error?.code === 'authorization-denied');

  let nowMs = 0;
  let expiryPolls = 0;
  const expiring = createPollinationsProvider({
    storage: memoryStorage(),
    now: () => nowMs,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/device/code')) return response({ ...codePayload, expires_in: 1 });
      expiryPolls += 1;
      return response({ error: 'authorization_pending' }, false, 400);
    },
    wait: async (ms) => { nowMs += ms; },
  });
  await assert.rejects(expiring.connect(), (error) => error?.code === 'authorization-expired');
  assert.equal(expiryPolls, 0, 'polling stops when the bounded code lifetime elapses');
});

test('expired sessions, balance limits, rate limits, and network failures remain recoverable', async () => {
  const expiredStorage = memoryStorage({ [POLLINATIONS_SESSION_KEY]: 'expired-session-value' });
  const expired = createPollinationsProvider({
    storage: expiredStorage,
    fetchImpl: async () => response({ error: 'invalid_token' }, false, 401),
  });
  await assert.rejects(expired.testConnection(), (error) => error?.code === 'auth-expired');
  assert.equal(expiredStorage.values[POLLINATIONS_SESSION_KEY], undefined, 'an invalid delegated session is removed');

  const generationFailure = async (status, payload) => {
    const provider = createPollinationsProvider({
      storage: memoryStorage({ [POLLINATIONS_SESSION_KEY]: 'active-session-value' }),
      fetchImpl: async (url) => {
        if (url === '/api/ai/prepare') return response({ ok: true, request: { messages: [{ role: 'user', content: 'review' }], options: {} } });
        if (url === `${POLLINATIONS_API_BASE_URL}/chat/completions`) return response(payload, false, status);
        throw new Error('the selected provider must not fall back to another endpoint');
      },
    });
    return provider.generate({ operation: 'insight', payload: {} });
  };
  await assert.rejects(generationFailure(402, { error: { code: 'insufficient_balance' } }), (error) => error?.code === 'insufficient-balance');
  await assert.rejects(generationFailure(429, { error: { code: 'rate_limit' } }), (error) => error?.code === 'rate-limited');

  const offline = createPollinationsProvider({
    storage: memoryStorage({ [POLLINATIONS_SESSION_KEY]: 'active-session-value' }),
    fetchImpl: async () => { throw new TypeError('simulated network outage'); },
  });
  await assert.rejects(offline.testConnection(), (error) => error?.code === 'network-error');
  assert.match(freeAiMessage({ code: 'network-error' }), /network/i);
});

test('Pollinations response extraction handles OpenAI-compatible content shapes', () => {
  assert.equal(extractPollinationsText('plain'), 'plain');
  assert.equal(extractPollinationsText({ choices: [{ message: { content: 'normalized' } }] }), 'normalized');
  assert.equal(extractPollinationsText({ choices: [{ message: { content: [{ type: 'text', text: 'block one' }, { type: 'text', text: ' block two' }] } }] }), 'block one block two');
  assert.equal(extractPollinationsText({}), '');
});

test('browser-provided recovery uses the same normalized request and result layer', async () => {
  const input = {
    repo: { canonicalUrl: 'https://github.com/acme/widget' },
    metadata: { language: 'JavaScript', default_branch: 'main' },
    files: [{ path: 'package.json', content: '{"scripts":{"start":"node index.js"}}' }],
    failedStep: { id: 'dependencies', title: 'Install', command: 'npm install', detail: '' },
    errorText: 'ERESOLVE dependency tree',
    remainingSteps: [{ id: 'dependencies', title: 'Install', command: 'npm install' }],
    completedSteps: [{ id: 'clone', title: 'Clone', command: 'git clone x' }],
    requirements: [], expertise: 'some', failureScan: { patterns: [] },
  };
  const request = buildRecoveryAiRequest(input);
  assert.equal(request.messages.length, 1);
  assert.match(request.messages[0].content, /ERESOLVE dependency tree/);
  const result = await recoverPath({
    ...input,
    providerResult: JSON.stringify({
      diagnosis: 'The package ranges conflict.',
      correctedSteps: [{ id: 'dependencies', title: 'Install compatible packages', command: 'npm install --legacy-peer-deps', detail: 'Accept the older peer range.', confidence: 'high' }],
      checks: ['npm ls'], followUps: ['Did it install?'], confidence: 'high',
    }),
  });
  assert.equal(result.source, 'ai');
  assert.equal(result.correctedSteps[0].id, 'dependencies');
  assert.equal(result.correctedSteps[0].keptFromPath, true);
});

test('the key-free browser integration has no external AI SDK and keeps responsive provider styles', () => {
  const html = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(here, '..', 'public', 'styles.css'), 'utf8');
  const adapter = fs.readFileSync(path.join(here, '..', 'public', 'ai', 'pollinations-provider.js'), 'utf8');
  const server = fs.readFileSync(path.join(here, '..', 'server.js'), 'utf8');
  const aiFiles = fs.readdirSync(path.join(here, '..', 'public', 'ai')).sort();
  assert.deepEqual(aiFiles, ['ai-http.js', 'ai-provider.js', 'ai-service.js', 'custom-api-provider.js', 'pollinations-provider.js']);
  assert.doesNotMatch(html, /<script[^>]+id="[^"]*sdk/i);
  assert.equal((server.match(/body\.provider === 'pollinations'/g) || []).length, 4, 'all browser-result server paths recognize Pollinations');
  assert.match(adapter, /https:\/\/enter\.pollinations\.ai/);
  assert.match(adapter, /https:\/\/gen\.pollinations\.ai\/v1/);
  assert.doesNotMatch(adapter, /\blocalStorage\b/);
  assert.doesNotMatch(adapter, /console\./);
  assert.match(css, /\.provider-options\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.free-ai-authorization/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.model-row, \.provider-options\s*\{\s*grid-template-columns:\s*1fr/);
});
