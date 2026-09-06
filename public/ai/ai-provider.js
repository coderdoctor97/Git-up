export const AI_PROVIDER = Object.freeze({
  CUSTOM: 'custom',
  POLLINATIONS: 'pollinations',
});

export const AI_CONNECTION = Object.freeze({
  NO_PROVIDER: 'NO_PROVIDER',
  CUSTOM_CONNECTED: 'CUSTOM_CONNECTED',
  CUSTOM_ERROR: 'CUSTOM_ERROR',
  POLLINATIONS_CONNECTED: 'POLLINATIONS_CONNECTED',
  POLLINATIONS_ERROR: 'POLLINATIONS_ERROR',
  POLLINATIONS_AUTH_REQUIRED: 'POLLINATIONS_AUTH_REQUIRED',
  POLLINATIONS_CONNECTING: 'POLLINATIONS_CONNECTING',
});

export function normaliseAiProvider(value) {
  return value === AI_PROVIDER.POLLINATIONS ? AI_PROVIDER.POLLINATIONS : AI_PROVIDER.CUSTOM;
}

export function customConfigReady(config) {
  return Boolean(config?.baseUrl && config?.apiKey && config?.model);
}

/**
 * One source of truth for the status shown in the topbar and settings modal.
 * Pollinations authorization is kept separately because switching providers
 * must never destroy either provider's configuration or browser session.
 */
export function activeConnectionState({ activeProvider, customReady, customError = false, pollinationsStatus }) {
  if (normaliseAiProvider(activeProvider) === AI_PROVIDER.POLLINATIONS) {
    if (pollinationsStatus === AI_CONNECTION.POLLINATIONS_CONNECTED) return AI_CONNECTION.POLLINATIONS_CONNECTED;
    if (pollinationsStatus === AI_CONNECTION.POLLINATIONS_CONNECTING) return AI_CONNECTION.POLLINATIONS_CONNECTING;
    if (pollinationsStatus === AI_CONNECTION.POLLINATIONS_ERROR) return AI_CONNECTION.POLLINATIONS_ERROR;
    return AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED;
  }
  if (customError) return AI_CONNECTION.CUSTOM_ERROR;
  return customReady ? AI_CONNECTION.CUSTOM_CONNECTED : AI_CONNECTION.NO_PROVIDER;
}

export function connectionPresentation(connection) {
  switch (connection) {
    case AI_CONNECTION.CUSTOM_CONNECTED:
      return { label: 'Custom API Connected', tone: 'online' };
    case AI_CONNECTION.POLLINATIONS_CONNECTED:
      return { label: 'Free AI Connected', tone: 'online' };
    case AI_CONNECTION.POLLINATIONS_CONNECTING:
      return { label: 'Free AI Awaiting Approval…', tone: 'pending' };
    case AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED:
      return { label: 'Free AI — Authorization Required', tone: 'offline' };
    case AI_CONNECTION.CUSTOM_ERROR:
    case AI_CONNECTION.POLLINATIONS_ERROR:
      return { label: 'AI Connection Error', tone: 'warning' };
    default:
      return { label: 'AI Not Connected', tone: 'offline' };
  }
}
