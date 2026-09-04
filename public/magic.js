// Git-Up — Magic UI ports (vanilla JS, no dependencies).
// Techniques adapted from skills/magicui: magic-card spotlight (cursor-tracked
// radial glow via CSS vars) and number-ticker (rAF count-up on visibility).
// No top-level DOM access: safe to import in Node tests. Call both from
// bindEvents() after every render, since render() replaces innerHTML.

const SPOTLIGHT_SELECTOR = '.panel, .seg-option, .explorer-btn, .route-preview, .route-status';

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
