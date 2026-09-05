// Puter SDK loader - ensures https://js.puter.com/v2/ is loaded exactly once
let loadPromise = null;
let puterInstance = null;

export function isPuterSdkLoaded() {
  return typeof window !== 'undefined' && !!window.puter && !!window.puter.ai;
}

export function getPuter() {
  if (typeof window !== 'undefined' && window.puter) return window.puter;
  return puterInstance || null;
}

export async function loadPuterSdk() {
  if (typeof window === 'undefined') return null;
  if (window.puter && window.puter.ai) {
    puterInstance = window.puter;
    return window.puter;
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // If script already in DOM, wait for it
    const existing = document.querySelector('script[src=\"https://js.puter.com/v2/\"]');
    if (existing) {
      if (window.puter) {
        puterInstance = window.puter;
        resolve(window.puter);
        return;
      }
      existing.addEventListener('load', () => {
        puterInstance = window.puter;
        resolve(window.puter);
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load Puter SDK')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.async = true;
    script.onload = () => {
      puterInstance = window.puter;
      resolve(window.puter);
    };
    script.onerror = () => reject(new Error('Failed to load Puter SDK'));
    document.head.appendChild(script);
  });

  try {
    const p = await loadPromise;
    return p;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

export async function ensurePuter() {
  if (isPuterSdkLoaded()) return getPuter();
  return await loadPuterSdk();
}
