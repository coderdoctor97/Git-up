// Git-Up — workspace particle field, powered by the particles.js engine
// (public/vendor/particles.min.js — Vincent Garreau, MIT license).
//
// The animation BEHAVIOUR comes from the reference demo's particlesJS config
// (density-scaled count, edge particles, opacity/size animation, bounce drift,
// hover repulse); the VISUAL IDENTITY is Git-Up's (dark background, mint
// accent #7FE0B2, low opacity, no connecting lines — as in the reference).
//
// Mounted ONLY inside <main class="main"> (see render() in app.js): the
// navbar, sidebar, modals, toasts and mobile nav are sibling layers and stay
// clean. The layer is aria-hidden and pointer-events:none.
//
// Lifecycle: initParticles() is safe to call after every render(). The engine
// is initialized exactly ONCE — render() preserves the live container node
// across innerHTML rebuilds, and this module no-ops when a running canvas
// already exists. (Re-calling window.particlesJS on the same id would orphan
// the previous rAF loop, so init-once is load-bearing, not just tidy.)
//
// Node-safe: no top-level DOM access, so tests can import app.js (which
// imports this module) against the DOM stub.

const CONFIG = {
  particles: {
    // Reference: value 262 / value_area 2558.98. Kept the same density
    // mechanism, lowered for a restrained field: ~60 desktop, ~18 mobile
    // (count = area/1000 * value/value_area, scaled automatically).
    number: { value: 70, density: { enable: true, value_area: 1000 } },
    // Reference: solid neon green #12f200 (excluded). Git-Up palette: mint
    // accent plus muted sage tones that read on dark AND light themes.
    // The engine picks one entry per particle at random.
    color: { value: ['#7fe0b2', '#6f8580', '#48585a'] },
    // Reference: shape "edge" (small squares) — kept. At 2-3px and low
    // opacity they read as quiet infrastructure nodes, not confetti.
    shape: {
      type: 'edge',
      stroke: { width: 0, color: '#000000' },
      polygon: { nb_sides: 5 },
      image: { src: '', width: 100, height: 100 },
    },
    // Reference: value 0.576, random, animated. Lowered and slowed.
    opacity: {
      value: 0.35, random: true,
      anim: { enable: true, speed: 1, opacity_min: 0.08, sync: false },
    },
    // Reference: value ~8 with an extreme size pulse (excluded as demo
    // excess). Small, gently breathing nodes instead.
    size: {
      value: 2.6, random: true,
      anim: { enable: true, speed: 1.5, size_min: 0.8, sync: false },
    },
    // Reference: line_linked disabled — kept disabled. No web of lines.
    line_linked: { enable: false, distance: 150, color: '#7fe0b2', opacity: 0, width: 0 },
    // Reference: slow random drift, bounce keeps density constant.
    move: {
      enable: true, speed: 1.5, direction: 'none', random: true,
      straight: false, out_mode: 'bounce', bounce: false,
      attract: { enable: false, rotateX: 600, rotateY: 1200 },
    },
  },
  interactivity: {
    // Reference: detect_on "canvas". Git-Up uses "window" because the layer
    // itself is pointer-events:none (it must never intercept clicks) — the
    // engine then tracks the cursor globally and repels workspace particles.
    detect_on: 'window',
    events: {
      // Reference: hover repulse 200px (too aggressive — narrowed to 90px).
      onhover: { enable: true, mode: 'repulse' },
      // Reference: click "push" spawns particles (excluded — clicking must
      // never mutate anything near UI controls).
      onclick: { enable: false, mode: 'push' },
      resize: true,
    },
    modes: {
      grab: { distance: 100, line_linked: { opacity: 1 } },
      bubble: { distance: 200, size: 40, duration: 2, opacity: 8, speed: 3 },
      repulse: { distance: 90, duration: 0.4 },
      push: { particles_nb: 2 },
      remove: { particles_nb: 2 },
    },
  },
  // Reference: retina_detect true — kept for crisp nodes on hidpi screens.
  retina_detect: true,
};

let pauseWired = false;

/** Pause drift (not just drawing) while the workspace is offscreen/hidden. */
function wirePause(host) {
  if (pauseWired) return;
  if (typeof IntersectionObserver === 'undefined') return;
  pauseWired = true;
  const setMoving = (on) => {
    try {
      const dom = window.pJSDom || [];
      for (const entry of dom) {
        const peer = entry && entry.pJS;
        if (peer && peer.canvas && peer.canvas.el && host.contains(peer.canvas.el)) {
          if (peer.particles && peer.particles.move) peer.particles.move.enable = on;
        }
      }
    } catch { /* ignore */ }
  };
  try {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === host) setMoving(entry.isIntersecting && !document.hidden);
      }
    }, { threshold: 0 });
    io.observe(host);
  } catch { /* ignore */ }
  try {
    document.addEventListener('visibilitychange', () => setMoving(!document.hidden));
  } catch { /* ignore */ }
}

/**
 * Start the workspace particle field if (and only if) it is not already
 * running. Safe to call after every render().
 */
export function initParticles() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const host = document.querySelector ? document.querySelector('#particles-workspace') : null;
  if (!host) return;
  // Reduced motion: no animation at all. The static dot-grid foundation
  // (body::after) remains, so the workspace never looks broken.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Vendor library unavailable (offline dev, blocked script): degrade
  // silently to the static grid rather than throwing.
  if (typeof window.particlesJS !== 'function') return;
  // Already running (node preserved across a re-render): just ensure the
  // pause wiring exists.
  if (host.querySelector && host.querySelector('.particles-js-canvas-el')) {
    wirePause(host);
    return;
  }
  window.particlesJS('particles-workspace', CONFIG);
  wirePause(host);
}
