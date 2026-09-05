// Git-Up — Magic UI ports (vanilla JS, no dependencies).
// Techniques adapted from skills/magicui: magic-card spotlight (cursor-tracked
// radial glow via CSS vars), number-ticker (rAF count-up on visibility), and
// blur-fade scroll reveal (IntersectionObserver + a reveal-done seal so the
// app's constant re-renders never flicker). No top-level DOM access: safe to
// import in Node tests. Call all three from bindEvents() after every render,
// since render() replaces innerHTML.

const SPOTLIGHT_SELECTOR = '.panel, .seg-option, .oreo-panel, .oreo-chip, .route-preview, .route-status';

/** Track the cursor per card so magic.css can paint the glow at --mx/--my. */
export function bindSpotlight(scope) {
  const root = scope || (typeof document !== 'undefined' ? document : null);
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll(SPOTLIGHT_SELECTOR).forEach((el) => {
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      el.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  });
}

/** Count [data-ticker] elements up to data-ticker-to when scrolled into view. */
export function bindTickers(scope) {
  const root = scope || (typeof document !== 'undefined' ? document : null);
  if (!root || !root.querySelectorAll) return;
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = typeof requestAnimationFrame !== 'undefined'
    && typeof IntersectionObserver !== 'undefined' && !reduce;
  root.querySelectorAll('[data-ticker]').forEach((el) => {
    const to = Number(el.getAttribute('data-ticker-to') || el.textContent) || 0;
    if (!canAnimate) {
      el.textContent = String(to);
      return;
    }
    el.textContent = '0';
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const duration = 1100;
        const start = performance.now();
        const step = (now) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = String(Math.round(to * eased));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    io.observe(el);
  });
}

const SEAL_AFTER_MS = 4000;

/**
 * Initialise Lenis smooth scroll once. Falls back silently when the CDN
 * script is absent or the user prefers reduced motion.
 */
export function bindLenis() {
  if (typeof window === 'undefined') return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  if (typeof window.Lenis !== 'function') return;
  if (window.__lenis) return;
  const lenis = new window.Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  window.__lenis = lenis;
  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

/**
 * Blur-fade scroll reveal for [data-reveal] and [data-reveal-stagger].
 *
 * Contract with magic.css:
 *   - `reveal-armed` on <html> switches the hidden pre-reveal state on, so a
 *     no-JS environment never hides content.
 *   - every observed element gets `.revealed` when it enters the viewport;
 *     elements entering in the same batch are staggered via --reveal-delay.
 *   - once all targets are revealed (or the seal timer fires), `reveal-done`
 *     is set so later re-renders (checkbox ticks replace innerHTML) render
 *     fully visible with no flicker. Switching major views clears the seal.
 * Reduced motion or a missing IntersectionObserver seals immediately.
 */
export function bindReveals(scope) {
  const doc = typeof document !== 'undefined' ? document : null;
  const html = doc?.documentElement;
  if (!html || !html.classList) return;
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof IntersectionObserver === 'undefined') {
    html.classList.add('reveal-armed', 'reveal-done');
    return;
  }
  const root = scope || doc;
  if (!root || !root.querySelectorAll) return;
  const targets = Array.from(root.querySelectorAll('[data-reveal], [data-reveal-stagger]'));
  if (!targets.length) return;
  html.classList.add('reveal-armed');
  // Set --reveal-from for directional/scale reveal variants.
  targets.forEach((el) => {
    const v = el.getAttribute('data-reveal');
    if (v === 'left') el.style.setProperty('--reveal-from', 'rise-left');
    else if (v === 'right') el.style.setProperty('--reveal-from', 'rise-right');
    else if (v === 'scale') el.style.setProperty('--reveal-from', 'scale-in');
  });
  // Later renders in the same view: keep everything visible, never re-animate.
  if (html.classList.contains('reveal-done')) return;
  const pending = new Set(targets);
  let timer = null;
  const seal = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    pending.forEach((el) => el.classList.add('revealed'));
    pending.clear();
    html.classList.add('reveal-done');
  };
  // Anything already on screen reveals synchronously, so an unrelated
  // re-render mid-reveal (a checkbox tick rebuilds innerHTML) cannot flicker.
  const viewportHeight = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 0;
  const offscreen = targets.filter((el) => {
    let onScreen = true;
    try {
      const rect = el.getBoundingClientRect();
      onScreen = viewportHeight > 0 && rect.top < viewportHeight && rect.bottom > 0;
    } catch { onScreen = true; }
    if (onScreen) {
      el.classList.add('revealed');
      pending.delete(el);
    }
    return !onScreen;
  });
  if (!pending.size) { seal(); return; }
  const io = new IntersectionObserver((entries) => {
    const batch = entries.filter((entry) => entry.isIntersecting && pending.has(entry.target));
    batch.forEach((entry, index) => {
      pending.delete(entry.target);
      entry.target.style.setProperty('--reveal-delay', `${index * 70}ms`);
      entry.target.classList.add('revealed');
      io.unobserve(entry.target);
    });
    if (!pending.size) seal();
  }, { threshold: 0.06, rootMargin: '0px 0px -36px 0px' });
  offscreen.forEach((el) => io.observe(el));
  // Failsafe: even a stuck observation can never leave content hidden.
  timer = setTimeout(seal, SEAL_AFTER_MS);
}
