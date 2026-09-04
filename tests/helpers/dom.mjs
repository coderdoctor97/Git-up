// Minimal DOM stub: enough for app.js to mount and render into a string.
export function mount(store) {
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
  globalThis.localStorage = { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
  globalThis.setTimeout = () => 0;
  return captured;
}

export async function loadClient(store) {
  const captured = mount(store);
  const mod = await import('../../public/app.js');
  return { ...mod, captured, store };
}
