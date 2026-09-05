// Custom API provider - preserves existing OpenAI-compatible logic
// This provider uses server-side proxying with user-supplied baseUrl, apiKey, model

export function hasCustomConfig(settings) {
  return Boolean(settings && settings.baseUrl && settings.apiKey && settings.model);
}

export function getCustomConfig(settings) {
  if (!hasCustomConfig(settings)) return null;
  return { ...settings };
}

// Test connection for custom API - uses /api/models endpoint
export async function testCustomConnection(settings) {
  if (!settings.baseUrl || !settings.apiKey) throw new Error('Base URL and API key required');
  const response = await fetch('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: settings.baseUrl, apiKey: settings.apiKey }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not fetch models');
  return payload.models || [];
}

// Generate is handled server-side via /api/analyze, /api/insight, /api/recover with config
// This file provides helpers for validation and status
export function validateCustomSettings(settings) {
  const errors = [];
  if (!settings.baseUrl) errors.push('Base URL required');
  if (!settings.apiKey) errors.push('API key required');
  if (!settings.model) errors.push('Model required');
  try {
    if (settings.baseUrl) new URL(settings.baseUrl);
  } catch {
    errors.push('Base URL must be valid URL');
  }
  return errors;
}
