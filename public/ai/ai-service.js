import { AI_PROVIDER, normaliseAiProvider } from './ai-provider.js';
import { customApiProvider } from './custom-api-provider.js';
import { freeAiMessage, pollinationsProvider } from './pollinations-provider.js';

/**
 * Central provider router. The application asks for a logical operation and
 * never calls an OpenAI-compatible or Pollinations endpoint directly.
 */
export function createAiService({ custom = customApiProvider, pollinations = pollinationsProvider } = {}) {
  const adapters = {
    [AI_PROVIDER.CUSTOM]: custom,
    [AI_PROVIDER.POLLINATIONS]: pollinations,
  };
  return Object.freeze({
    async generate({ provider, operation, payload, config, onProgress, fetchImpl }) {
      const active = normaliseAiProvider(provider);
      return adapters[active].generate({ operation, payload, config, onProgress, fetchImpl });
    },

    fetchCustomModels(values) {
      return custom.fetchModels(values);
    },

    isFreeAiConnected(options) {
      return pollinations.isConnected(options);
    },

    connectFreeAi(options) {
      return pollinations.connect(options);
    },

    cancelFreeAiConnection() {
      return pollinations.cancelConnection();
    },

    disconnectFreeAi() {
      return pollinations.disconnect();
    },

    testFreeAi(options) {
      return pollinations.testConnection(options);
    },

    freeAiMessage,
  });
}

export const aiService = createAiService();
