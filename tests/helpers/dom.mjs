// Minimal DOM stub: enough for app.js to mount and render into a string.
export function mount(store, { sessionStore = {}, fetchImpl } = {}) {
  const captured = { html: '' };
  globalThis.document = {
    querySelector: (selector) => (selector === '#app'
      ? {
        set innerHTML(value) { captured.html = value; },
        get innerHTML() { return captured.html; },
        querySelector: () => null,
        querySelectorAll: () => [],
      }
      : null),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  globalThis.window = { clearTimeout: () => 0, setTimeout: () => 0, innerHeight: 0 };
  globalThis.localStorage = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  };
  globalThis.sessionStorage = {
    getItem: (key) => sessionStore[key] ?? null,
    setItem: (key, value) => { sessionStore[key] = value; },
    removeItem: (key) => { delete sessionStore[key]; },
  };
  if (fetchImpl) globalThis.fetch = fetchImpl;
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};
  return captured;
}

export async function loadClient(store, options = {}) {
  const sessionStore = options.sessionStore || {};
  const captured = mount(store, { ...options, sessionStore });
  const mod = await import('../../public/app.js');
  return { ...mod, captured, store, sessionStore };
}
