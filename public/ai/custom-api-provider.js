import { customConfigReady } from './ai-provider.js';
import { postJson, runAnalysis } from './ai-http.js';

/** Adapter for the pre-existing OpenAI-compatible server proxy. */
export const customApiProvider = Object.freeze({
  id: 'custom',

  isConnected(config) {
    return customConfigReady(config);
  },

  async generate({ operation, payload, config, onProgress, fetchImpl }) {
    const body = { ...payload, config: customConfigReady(config) ? { ...config } : null };
    if (operation === 'analyze') {
      return runAnalysis(body, {
        onProgress,
        fetchImpl,
        aiReady: customConfigReady(config),
      });
    }
    if (operation === 'insight') return (await postJson('/api/insight', body, fetchImpl)).insight;
    if (operation === 'recover') return (await postJson('/api/recover', body, fetchImpl)).recovery;
    throw new Error(`Unsupported AI operation: ${operation}`);
  },

  async fetchModels({ baseUrl, apiKey, fetchImpl }) {
    return (await postJson('/api/models', { baseUrl, apiKey }, fetchImpl)).models || [];
  },
});
