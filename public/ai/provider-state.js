// Provider state model - single source of truth for AI provider selection
// Persists activeProvider and puter connection without touching custom API data

export const AIProvider = {
  CUSTOM: 'custom',
  PUTER: 'puter',
};

const STORAGE_KEY = 'git-up-ai-provider';
const LEGACY_SETTINGS_KEY = 'git-up-settings';

function loadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadProviderState() {
  const raw = loadJson(STORAGE_KEY, null);
  if (raw && typeof raw === 'object') {
    // Validate
    const activeProvider = raw.activeProvider === AIProvider.PUTER ? AIProvider.PUTER : AIProvider.CUSTOM;
    const puter = raw.puter && typeof raw.puter === 'object' ? raw.puter : { connected: false };
    return {
      activeProvider,
      puter: { connected: Boolean(puter.connected) },
    };
  }
  // Migration: if legacy settings exist with baseUrl/model, default to custom, else custom as well
  // We don't auto-select puter - user must explicitly choose it
  return {
    activeProvider: AIProvider.CUSTOM,
    puter: { connected: false },
  };
}

export function saveProviderState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeProvider: state.activeProvider,
      puter: state.puter || { connected: false },
    }));
  } catch {}
}

export function getActiveProvider() {
  const state = loadProviderState();
  return state.activeProvider;
}

export function setActiveProvider(provider) {
  const current = loadProviderState();
  const next = {
    activeProvider: provider === AIProvider.PUTER ? AIProvider.PUTER : AIProvider.CUSTOM,
    puter: current.puter,
  };
  saveProviderState(next);
  return next;
}

export function setPuterConnected(connected) {
  const current = loadProviderState();
  const next = {
    activeProvider: current.activeProvider,
    puter: { connected: Boolean(connected) },
  };
  saveProviderState(next);
  return next;
}

// Status state machine for topbar and UI
// Spec requires topbar to show exactly: Custom API Connected / Free AI Connected / Not Connected
export function getConnectionStatus({ activeProvider, hasCustomConfig, puterConnected, puterSignedIn, error }) {
  if (error) {
    return { state: 'ERROR', label: 'AI Connection Error', dot: 'error', icon: 'warning' };
  }
  if (activeProvider === AIProvider.PUTER) {
    if (puterConnected) {
      // Even if signedIn false, we show Free AI Connected if persisted - but UI elsewhere will prompt sign-in
      // For stricter spec, show Not Connected when not signed in
      if (puterSignedIn === false && puterConnected) {
        // Check if we have explicit signedIn false - then require sign-in, but still show as Free AI Connected? Spec says only 3 states.
        // We'll show Free AI Connected when connected, Not Connected otherwise, to match spec.
        return { state: 'PUTER_CONNECTED', label: 'Free AI Connected', dot: 'online', icon: 'check' };
      }
      return { state: 'PUTER_CONNECTED', label: 'Free AI Connected', dot: 'online', icon: 'check' };
    }
    return { state: 'NO_PROVIDER', label: 'Not Connected', dot: 'offline', icon: 'info' };
  }
  if (activeProvider === AIProvider.CUSTOM) {
    if (hasCustomConfig) {
      return { state: 'CUSTOM_CONNECTED', label: 'Custom API Connected', dot: 'online', icon: 'check' };
    }
    return { state: 'NO_PROVIDER', label: 'Not Connected', dot: 'offline', icon: 'info' };
  }
  // Fallback
  if (hasCustomConfig) return { state: 'CUSTOM_CONNECTED', label: 'Custom API Connected', dot: 'online', icon: 'check' };
  if (puterConnected) return { state: 'PUTER_CONNECTED', label: 'Free AI Connected', dot: 'online', icon: 'check' };
  return { state: 'NO_PROVIDER', label: 'Not Connected', dot: 'offline', icon: 'info' };
}
