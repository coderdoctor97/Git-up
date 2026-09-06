// Git-Up supporting presentation binders (vanilla JS, no dependencies).
// The value ticker counts once on visibility; reveal hooks use a short
// opacity/translate entrance and a reveal-done seal so rerenders never flicker.
// There is no top-level DOM access, keeping this module safe in Node tests.

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
 * Brief transform-and-opacity reveal for [data-reveal] and [data-reveal-stagger].
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
      entry.target.style.setProperty('--reveal-delay', `${index * 42}ms`);
      entry.target.classList.add('revealed');
      io.unobserve(entry.target);
    });
    if (!pending.size) seal();
  }, { threshold: 0.06, rootMargin: '0px 0px -36px 0px' });
  offscreen.forEach((el) => io.observe(el));
  // Failsafe: even a stuck observation can never leave content hidden.
  timer = setTimeout(seal, SEAL_AFTER_MS);
}
