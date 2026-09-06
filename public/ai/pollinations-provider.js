import { postJson, runAnalysis } from './ai-http.js';

export const POLLINATIONS_DEFAULT_MODEL = 'openai';
export const POLLINATIONS_AUTH_BASE_URL = 'https://enter.pollinations.ai';
export const POLLINATIONS_API_BASE_URL = 'https://gen.pollinations.ai/v1';
export const POLLINATIONS_SESSION_KEY = 'git-up-pollinations-token';

const DEVICE_SCOPE = 'generate';
const MAX_DEVICE_LIFETIME_SECONDS = 30 * 60;
const MIN_POLL_INTERVAL_MS = 5_000;

export class FreeAIError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'FreeAIError';
    this.code = code;
    this.cause = cause;
  }
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => typeof part === 'string' ? part : (part?.text || part?.content || ''))
    .filter(Boolean)
    .join('');
}

export function extractPollinationsText(response) {
  if (typeof response === 'string') return response;
  const candidates = [
    response?.choices?.[0]?.message?.content,
    response?.choices?.[0]?.text,
    response?.output_text,
    response?.text,
    response?.content,
  ];
  for (const candidate of candidates) {
    const text = contentText(candidate);
    if (text.trim()) return text;
  }
  return '';
}

function defaultStorage() {
  try { return globalThis.sessionStorage || null; }
  catch { return null; }
}

function abortableWait(ms, signal, setTimer, clearTimer) {
  if (signal?.aborted) return Promise.reject(new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimer(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.'));
    };
    const timer = setTimer(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function asSeconds(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function authorizationError(error) {
  if (error instanceof FreeAIError) return error;
  if (error?.name === 'AbortError') return new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.', error);
  return new FreeAIError('network-error', 'Pollinations could not be reached. Check your network and try again.', error);
}

async function readJson(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function trustedVerificationUri(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol === 'https:' && parsed.hostname === 'enter.pollinations.ai') return parsed.href;
  } catch { /* use the known authorization page below */ }
  return `${POLLINATIONS_AUTH_BASE_URL}/device`;
}

/**
 * Browser-side Pollinations adapter. Device authorization needs no developer
 * secret or pasted key. Its delegated token is held in memory and, when
 * available, sessionStorage only; it is sent solely in Pollinations request
 * headers and never to Git-Up's server.
 */
export function createPollinationsProvider({
  fetchImpl = (url, options) => globalThis.fetch(url, options),
  storage = defaultStorage(),
  now = () => Date.now(),
  wait,
  setTimer = (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  let token = '';
  let connectPromise = null;
  let connectController = null;

  try {
    const saved = storage?.getItem?.(POLLINATIONS_SESSION_KEY);
    if (typeof saved === 'string' && saved.length <= 16_384) token = saved.trim();
  } catch { /* memory-only authorization still works */ }

  const removeToken = () => {
    token = '';
    try { storage?.removeItem?.(POLLINATIONS_SESSION_KEY); } catch { /* ignore disabled storage */ }
  };
  const saveToken = (value) => {
    const nextToken = String(value || '').trim();
    if (!nextToken || nextToken.length > 16_384) {
      throw new FreeAIError('invalid-response', 'Pollinations returned an invalid authorization response.');
    }
    token = nextToken;
    try { storage?.setItem?.(POLLINATIONS_SESSION_KEY, token); } catch { /* keep it in memory for this page */ }
  };
  const selectedFetch = (override) => override || fetchImpl;
  const pause = wait || ((ms, signal) => abortableWait(ms, signal, setTimer, clearTimer));

  const request = async (url, options, { signal, timeoutMs = 20_000, overrideFetch } = {}) => {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimer(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      return await selectedFetch(overrideFetch)(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.', error);
      if (timedOut || error?.name === 'AbortError') throw new FreeAIError('network-error', 'Pollinations took too long to respond. Please try again.', error);
      throw new FreeAIError('network-error', 'Pollinations could not be reached. Check your network and try again.', error);
    } finally {
      clearTimer(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }
  };

  const responseError = (status, payload, fallbackCode = 'request-failed') => {
    const remoteCode = String(payload?.error?.code || payload?.error || payload?.code || '').toLowerCase();
    if (status === 401 || status === 403 || /invalid_token|expired_token/.test(remoteCode)) {
      const hadToken = Boolean(token);
      removeToken();
      return hadToken
        ? new FreeAIError('auth-expired', 'Your Pollinations authorization has expired. Reconnect Free AI and try again.')
        : new FreeAIError(fallbackCode, 'Pollinations could not authorize this browser session. Please try again.');
    }
    if (status === 402 || /insufficient|balance|budget/.test(remoteCode)) {
      return new FreeAIError('insufficient-balance', 'Your Pollinations account does not have enough Pollen for this request. Add or earn Pollen, then retry.');
    }
    if (status === 429 || /rate.limit|too_many/.test(remoteCode)) {
      return new FreeAIError('rate-limited', 'Pollinations is receiving too many requests. Wait a moment, then retry.');
    }
    if (status >= 500) return new FreeAIError('request-failed', 'Pollinations is temporarily unavailable. Please retry shortly.');
    return new FreeAIError(fallbackCode, 'Pollinations could not complete the request. Please retry.');
  };

  const verifySession = async (overrideFetch) => {
    if (!token) return false;
    const response = await request(`${POLLINATIONS_AUTH_BASE_URL}/api/device/userinfo`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, { overrideFetch });
    if (response.ok) return true;
    throw responseError(response.status, await readJson(response), 'test-failed');
  };

  const chat = async (messages, options = {}, overrideFetch) => {
    if (!token) throw new FreeAIError('auth-required', 'Free AI is not connected.');
    const body = {
      model: POLLINATIONS_DEFAULT_MODEL,
      messages,
      stream: false,
      ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
      ...(Number.isFinite(options.max_tokens) ? { max_tokens: options.max_tokens } : {}),
    };
    const response = await request(`${POLLINATIONS_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }, { timeoutMs: 90_000, overrideFetch });
    const payload = await readJson(response);
    if (!response.ok) throw responseError(response.status, payload);
    const text = extractPollinationsText(payload);
    if (!text.trim()) throw new FreeAIError('invalid-response', 'Pollinations returned an empty response. Please retry.');
    return text;
  };

  const prepare = async (operation, payload, overrideFetch) => {
    const result = await postJson('/api/ai/prepare', { operation, payload }, overrideFetch || fetchImpl);
    if (!Array.isArray(result.request?.messages) || !result.request.messages.length) {
      throw new FreeAIError('prepare-failed', 'Git-Up could not prepare the Free AI request.');
    }
    return result.request;
  };

  const provider = {
    id: 'pollinations',

    async isConnected({ fetchImpl: overrideFetch } = {}) {
      return verifySession(overrideFetch);
    },

    connect({ onAuthorization, signal: externalSignal, fetchImpl: overrideFetch } = {}) {
      if (token) return Promise.resolve(true);
      if (connectPromise) return connectPromise;

      const controller = new AbortController();
      connectController = controller;
      const forwardAbort = () => controller.abort();
      externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
      if (externalSignal?.aborted) controller.abort();

      const task = (async () => {
        let codeResponse;
        try {
          codeResponse = await request(`${POLLINATIONS_AUTH_BASE_URL}/api/device/code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: DEVICE_SCOPE }),
          }, { signal: controller.signal, overrideFetch });
        } catch (error) {
          throw authorizationError(error);
        }
        const code = await readJson(codeResponse);
        if (controller.signal.aborted) throw new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.');
        if (!codeResponse.ok) throw responseError(codeResponse.status, code, 'authorization-failed');
        const deviceCode = typeof code.device_code === 'string' ? code.device_code.trim() : '';
        const userCode = typeof code.user_code === 'string' ? code.user_code.trim() : '';
        if (!deviceCode || deviceCode.length > 4_096 || !userCode || userCode.length > 64) {
          throw new FreeAIError('invalid-response', 'Pollinations returned an invalid authorization response.');
        }

        const lifetimeSeconds = Math.min(asSeconds(code.expires_in, MAX_DEVICE_LIFETIME_SECONDS), MAX_DEVICE_LIFETIME_SECONDS);
        const expiresAt = now() + (lifetimeSeconds * 1_000);
        let pollInterval = Math.max(asSeconds(code.interval, 5) * 1_000, MIN_POLL_INTERVAL_MS);
        const authorization = Object.freeze({
          userCode,
          verificationUri: trustedVerificationUri(code.verification_uri_complete || code.verification_uri),
          expiresAt,
        });
        try { onAuthorization?.(authorization); } catch { /* UI callbacks cannot interrupt authorization */ }

        const maxPolls = Math.ceil((lifetimeSeconds * 1_000) / MIN_POLL_INTERVAL_MS) + 1;
        for (let attempts = 0; attempts < maxPolls && now() < expiresAt; attempts += 1) {
          const waitMs = Math.min(pollInterval, Math.max(0, expiresAt - now()));
          await pause(waitMs, controller.signal);
          if (controller.signal.aborted) throw new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.');
          if (now() >= expiresAt) break;

          let tokenResponse;
          try {
            tokenResponse = await request(`${POLLINATIONS_AUTH_BASE_URL}/api/device/token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              }),
            }, { signal: controller.signal, overrideFetch });
          } catch (error) {
            throw authorizationError(error);
          }
          const result = await readJson(tokenResponse);
          if (controller.signal.aborted) throw new FreeAIError('authorization-cancelled', 'Pollinations authorization was cancelled.');
          if (tokenResponse.ok && typeof result.access_token === 'string') {
            saveToken(result.access_token);
            return true;
          }

          const pollError = String(result.error || result.code || '').toLowerCase();
          if (pollError === 'authorization_pending') continue;
          if (pollError === 'slow_down') {
            pollInterval += MIN_POLL_INTERVAL_MS;
            continue;
          }
          if (pollError === 'access_denied' || pollError === 'authorization_declined') {
            throw new FreeAIError('authorization-denied', 'Pollinations authorization was denied. You can reconnect whenever you are ready.');
          }
          if (pollError === 'expired_token' || pollError === 'device_code_expired') {
            throw new FreeAIError('authorization-expired', 'The Pollinations authorization code expired. Start a new connection.');
          }
          throw responseError(tokenResponse.status, result, 'authorization-failed');
        }
        throw new FreeAIError('authorization-expired', 'The Pollinations authorization code expired. Start a new connection.');
      })();

      connectPromise = task.finally(() => {
        externalSignal?.removeEventListener?.('abort', forwardAbort);
        if (connectController === controller) connectController = null;
        connectPromise = null;
      });
      return connectPromise;
    },

    cancelConnection() {
      if (!connectController) return false;
      connectController.abort();
      return true;
    },

    async disconnect() {
      this.cancelConnection();
      removeToken();
      return true;
    },

    async testConnection({ fetchImpl: overrideFetch } = {}) {
      if (!token) throw new FreeAIError('auth-required', 'Free AI is not connected.');
      const connected = await verifySession(overrideFetch);
      if (!connected) throw new FreeAIError('auth-required', 'Free AI is not connected.');
      const text = await chat([
        { role: 'user', content: 'Reply with exactly: Git-Up connection successful.' },
      ], { temperature: 0, max_tokens: 24 }, overrideFetch);
      if (!/Git-Up connection successful\./i.test(text)) {
        throw new FreeAIError('test-failed', 'Pollinations answered, but the connection check was incomplete.');
      }
      return true;
    },

    async generate({ operation, payload, onProgress = () => {}, fetchImpl: overrideFetch }) {
      if (!token) throw new FreeAIError('auth-required', 'Free AI is not connected.');
      onProgress({ phase: 'ai', label: 'Preparing Free AI review…', percent: 8, error: '' });
      const prepared = await prepare(operation, payload, overrideFetch);
      onProgress({ phase: 'ai', label: 'Reviewing with Free AI…', percent: 28, error: '' });
      const providerResult = await chat(prepared.messages, prepared.options || {}, overrideFetch);
      onProgress({ phase: 'ai', label: 'Free AI review complete…', percent: 44, error: '' });
      const body = { ...payload, provider: 'pollinations', providerResult };

      if (operation === 'analyze') {
        const afterAiProgress = (progress) => onProgress({
          ...progress,
          percent: Math.max(45, 45 + Math.round((Number(progress.percent) || 0) * 0.55)),
        });
        return runAnalysis(body, { onProgress: afterAiProgress, fetchImpl: overrideFetch, aiReady: true });
      }
      if (operation === 'insight') return (await postJson('/api/insight', body, overrideFetch || fetchImpl)).insight;
      if (operation === 'recover') return (await postJson('/api/recover', body, overrideFetch || fetchImpl)).recovery;
      throw new Error(`Unsupported AI operation: ${operation}`);
    },
  };

  return Object.freeze(provider);
}

export const pollinationsProvider = createPollinationsProvider();

export function freeAiMessage(error) {
  switch (error?.code) {
    case 'auth-required': return 'Free AI is not connected. Authorize Pollinations and try again.';
    case 'auth-expired': return 'Your Pollinations authorization expired. Reconnect Free AI and try again.';
    case 'authorization-cancelled': return 'Pollinations authorization was cancelled. You can reconnect whenever you’re ready.';
    case 'authorization-denied': return 'Pollinations authorization was denied. Start a new connection when you’re ready.';
    case 'authorization-expired': return 'The Pollinations authorization code expired. Start a new connection.';
    case 'insufficient-balance': return 'Your Pollinations account does not have enough Pollen. Add or earn Pollen, then retry.';
    case 'rate-limited': return 'Pollinations is receiving too many requests. Wait a moment, then retry.';
    case 'network-error': return 'Pollinations could not be reached. Check your network and try again.';
    case 'test-failed': return 'Pollinations could not verify this browser session. Reconnect and try again.';
    default: return 'Free AI is temporarily unavailable. Retry or reconnect; Git-Up will not switch providers automatically.';
  }
}
