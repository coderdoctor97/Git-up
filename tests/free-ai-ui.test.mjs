import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClient } from './helpers/dom.mjs';
import { AI_CONNECTION, AI_PROVIDER } from '../public/ai/ai-provider.js';

const legacySettings = {
  baseUrl: 'https://provider.example/v1',
  endpoint: '/chat/completions',
  model: 'existing-model',
  modelOptions: ['existing-model'],
};
const { state, render, captured, store, switchAiProvider, aiConnection, disconnectFreeAi } = await loadClient({
  'git-up-settings': JSON.stringify(legacySettings),
  'git-up-history': '[]',
});
state.settings.apiKey = 'session-only-existing-key';

function showSettings() {
  state.modal = 'settings';
  render();
  return captured.html;
}

test('legacy Custom API config remains the default and keeps its recognizable form', () => {
  assert.equal(state.ai.activeProvider, AI_PROVIDER.CUSTOM, 'old settings migrate without changing provider');
  assert.equal(aiConnection(), AI_CONNECTION.CUSTOM_CONNECTED);
  const html = showSettings();
  assert.match(html, /name="ai-provider" value="custom" checked/);
  assert.match(html, /name="ai-provider" value="pollinations"/);
  assert.match(html, /id="base-url" value="https:\/\/provider\.example\/v1"/);
  assert.match(html, /id="api-key" type="password" value="session-only-existing-key"/);
  assert.match(html, /id="model"/);
  assert.match(html, /existing-model/);
  assert.match(html, /Don’t have your own API\?/);
  assert.match(html, /No problem — Git-Up has a free AI option/);
  assert.match(html, /data-action="use-free-ai"/);
  assert.match(html, /Custom API Connected/, 'topbar identifies the active custom provider');
});

test('switching to Free AI preserves every Custom API value and persists only the route choice', async () => {
  showSettings();
  switchAiProvider(AI_PROVIDER.POLLINATIONS);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.ai.activeProvider, AI_PROVIDER.POLLINATIONS);
  assert.equal(state.settings.baseUrl, legacySettings.baseUrl);
  assert.equal(state.settings.endpoint, legacySettings.endpoint);
  assert.equal(state.settings.model, legacySettings.model);
  assert.equal(state.settings.apiKey, 'session-only-existing-key');

  const saved = JSON.parse(store['git-up-settings']);
  assert.equal(saved.activeProvider, AI_PROVIDER.POLLINATIONS);
  assert.equal(saved.baseUrl, legacySettings.baseUrl);
  assert.equal(saved.model, legacySettings.model);
  assert.equal('apiKey' in saved, false, 'the existing key remains session-only');

  const html = captured.html;
  assert.match(html, /Git-Up Free AI/);
  assert.match(html, /No key to paste/);
  assert.match(html, /Powered by Pollinations/);
  assert.match(html, /Pollinations model/);
  assert.match(html, />openai</);
  assert.match(html, /data-action="connect-free-ai"/);
  assert.match(html, /Authorize Pollinations/);
  assert.doesNotMatch(html, /id="api-key"/, 'Free AI never presents a credential field');
  assert.match(html, /Free AI — Authorization Required/);
});

test('pending device authorization shows a code, safe link, and cancellation control', () => {
  state.ai.activeProvider = AI_PROVIDER.POLLINATIONS;
  state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTING;
  state.ai.busy = 'connect';
  state.ai.authorization = {
    userCode: 'ABCD1234',
    verificationUri: 'https://enter.pollinations.ai/device?user_code=ABCD1234',
    expiresAt: Date.now() + 60_000,
  };
  const html = showSettings();
  assert.match(html, /Authorization code/);
  assert.match(html, /ABCD1234/);
  assert.match(html, /href="https:\/\/enter\.pollinations\.ai\/device\?user_code=ABCD1234"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /data-copy="ABCD1234"/);
  assert.match(html, /data-action="cancel-free-ai-connect"/);
  assert.match(html, /Waiting for Pollinations approval/);
  state.ai.busy = '';
  state.ai.authorization = null;
});

test('connected Free AI has meaningful status, testing, and disconnect controls', () => {
  state.ai.activeProvider = AI_PROVIDER.POLLINATIONS;
  state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTED;
  state.ai.message = '';
  showSettings();
  const html = captured.html;
  assert.match(html, /Free AI Connected/);
  assert.match(html, /data-action="test-free-ai"/);
  assert.match(html, /Test AI/);
  assert.match(html, /data-action="disconnect-free-ai"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /aria-label="AI status: Free AI Connected\. Open AI settings"/);
});

test('disconnecting Free AI does not alter Custom API configuration', async () => {
  state.ai.activeProvider = AI_PROVIDER.POLLINATIONS;
  state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTED;
  await disconnectFreeAi();
  assert.equal(state.ai.pollinationsStatus, AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED);
  assert.equal(state.settings.baseUrl, legacySettings.baseUrl);
  assert.equal(state.settings.model, legacySettings.model);
  assert.equal(state.settings.apiKey, 'session-only-existing-key');
});

test('provider failures give specific recoverable status without changing providers', () => {
  state.ai.activeProvider = AI_PROVIDER.POLLINATIONS;
  state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_ERROR;
  state.ai.message = 'Your Pollinations account does not have enough Pollen. Add or earn Pollen, then retry.';
  const html = showSettings();
  assert.match(html, /does not have enough Pollen/);
  assert.match(html, /Retry Free AI/);
  assert.match(html, /data-action="disconnect-free-ai"/);
  assert.equal(state.ai.activeProvider, AI_PROVIDER.POLLINATIONS, 'an error never silently selects Custom API');
  switchAiProvider(AI_PROVIDER.CUSTOM);
  switchAiProvider(AI_PROVIDER.POLLINATIONS);
  assert.match(showSettings(), /does not have enough Pollen/, 'switching away and back does not erase the recoverable error');
});

test('switching back restores the original Custom API form without data loss', () => {
  switchAiProvider(AI_PROVIDER.CUSTOM);
  assert.equal(state.ai.activeProvider, AI_PROVIDER.CUSTOM);
  assert.equal(state.settings.apiKey, 'session-only-existing-key');
  const html = showSettings();
  assert.match(html, /value="https:\/\/provider\.example\/v1"/);
  assert.match(html, /value="session-only-existing-key"/);
  assert.match(html, /<option value="existing-model" selected>/);
  const saved = JSON.parse(store['git-up-settings']);
  assert.equal(saved.activeProvider, AI_PROVIDER.CUSTOM);
  assert.equal(saved.baseUrl, legacySettings.baseUrl);
});

test('rapid provider changes leave the final user choice active', async () => {
  switchAiProvider(AI_PROVIDER.POLLINATIONS);
  switchAiProvider(AI_PROVIDER.CUSTOM);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.ai.activeProvider, AI_PROVIDER.CUSTOM);
  assert.equal(state.settings.apiKey, 'session-only-existing-key');
});

test('provider controls are native keyboard controls with visible labels', () => {
  const html = showSettings();
  assert.match(html, /<fieldset class="provider-picker"><legend>AI provider<\/legend>/);
  assert.equal((html.match(/type="radio" name="ai-provider"/g) || []).length, 2);
  assert.match(html, /<strong>Custom API<\/strong>/);
  assert.match(html, /<strong>Git-Up Free<\/strong>/);
});
