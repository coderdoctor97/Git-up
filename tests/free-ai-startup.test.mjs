import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClient } from './helpers/dom.mjs';
import { AI_CONNECTION, AI_PROVIDER } from '../public/ai/ai-provider.js';

const POLLINATIONS_AUTH_BASE_URL = 'https://enter.pollinations.ai';
const POLLINATIONS_SESSION_KEY = 'git-up-pollinations-token';
const saved = {
  activeProvider: 'pollinations',
  baseUrl: 'https://custom.example/v1',
  endpoint: '/chat/completions',
  model: 'custom-model',
  modelOptions: ['custom-model'],
};
const delegatedToken = 'restored-session-value';
const requests = [];
const fetchImpl = async (url, options = {}) => {
  requests.push({ url: String(url), headers: { ...(options.headers || {}) } });
  if (url === `${POLLINATIONS_AUTH_BASE_URL}/api/device/userinfo`) {
    return { ok: true, status: 200, json: async () => ({ sub: 'account-1' }) };
  }
  throw new Error(`unexpected startup request: ${url}`);
};
const { state, render, captured, store, sessionStore } = await loadClient({
  'git-up-settings': JSON.stringify(saved),
  'git-up-history': '[]',
}, {
  sessionStore: { [POLLINATIONS_SESSION_KEY]: delegatedToken },
  fetchImpl,
});
await new Promise((resolve) => setImmediate(resolve));

test('startup restores Pollinations as active and verifies the delegated browser session', () => {
  assert.equal(state.ai.activeProvider, AI_PROVIDER.POLLINATIONS);
  assert.equal(state.ai.pollinationsStatus, AI_CONNECTION.POLLINATIONS_CONNECTED);
  assert.equal(state.settings.baseUrl, saved.baseUrl, 'inactive Custom API metadata remains loaded');
  assert.equal(state.settings.model, saved.model);
  assert.match(captured.html, /Free AI Connected/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${POLLINATIONS_AUTH_BASE_URL}/api/device/userinfo`);
  assert.equal(requests[0].headers.Authorization, `Bearer ${delegatedToken}`);
  assert.equal(requests[0].url.includes(delegatedToken), false);
});

test('startup keeps delegated authorization session-only and never renders a credential field', () => {
  state.modal = 'settings';
  render();
  assert.match(captured.html, /Git-Up Free AI/);
  assert.doesNotMatch(captured.html, /id="api-key"/);
  assert.doesNotMatch(captured.html, new RegExp(delegatedToken));
  assert.match(captured.html, /delegated authorization stays in this browser session/);
  assert.equal(sessionStore[POLLINATIONS_SESSION_KEY], delegatedToken);
  assert.equal(JSON.stringify(store).includes(delegatedToken), false, 'local settings never receive the delegated value');
});
