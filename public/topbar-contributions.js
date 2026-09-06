// Git-Up — top bar "GitHub activity" contribution squares (vanilla canvas).
//
// A full-height wall of contribution-style squares that lives ONLY inside
// <header class="topbar"> (see topbar() in app.js): the brand, route crumb
// and round controls are siblings painted above it (z-index 1). Scoped
// nowhere else — the rest of the page is untouched. aria-hidden +
// pointer-events:none keep it decorative and non-interactive.
//
// The grid never moves. Individual squares gently BLINK: each cell breathes
// between a near-invisible floor and its own small peak on its own slow,
// randomized cycle (3.8–7.2s), with a rare slightly stronger pulse on a few
// cells — calm repository activity, not a marquee.
//
// Light mode uses a dark green (not mint) at DECREASED opacity so the header
// stays clean and readable on the light background.
//
// Lifecycle: initTopbarContributions() is safe after every render(). The
// engine starts exactly ONCE — render() preserves the live container across
// innerHTML rebuilds and this module no-ops once a canvas exists. The host
// is the <div id="topbar-contrib"> rendered by topbar(); the canvas is
// created inside it (matching #topbar-contrib canvas in magic.css).
//
// Node-safe: no top-level DOM access, so tests can import app.js against the
// DOM stub.

// Square size × pitch (px). Rows are computed from the header height so the
// field fills the whole bar (~7 rows at 72px) instead of floating as a thin
// strip — a compact contribution-graph wall behind the header content.
const CELL = 6;
const GAP = 4;
const PITCH = CELL + GAP; // 10
const FRAME_MS = 1000 / 24; // calm 24fps is plenty for slow blinks

function themeOf(doc) {
  try {
    return doc?.documentElement?.getAttribute?.('data-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function paletteFor(theme) {
  return theme === 'light'
    ? {
        // Dark green on light paper, opacity DECREASED vs dark mode so the
        // brand, crumb and controls stay clearly readable.
        base: [15, 157, 108],
        bright: [11, 122, 85],
        maxAlpha: 0.27,
        floorAlpha: 0.035,
      }
    : {
        base: [127, 224, 178],
        bright: [169, 242, 205],
        maxAlpha: 0.38,
        floorAlpha: 0.05,
      };
}

function css(rgb, alpha) {
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${alpha.toFixed(3)})`;
}

// One temperament per cell, assigned once (stable until resize): most cells
// blink faintly, a few reach mid strength, ~4% may pulse near the max.
function makeCells(count, rand = Math.random) {
  const cells = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const roll = rand();
    const peak = roll < 0.6
      ? 0.16 + rand() * 0.22 // quiet contribution
      : roll < 0.96
        ? 0.38 + rand() * 0.24 // readable mid blink
        : 0.68 + rand() * 0.2; // rare high-activity cell
    cells[i] = {
      peak,
      period: 3.8 + rand() * 3.4, // 3.8–7.2s blink cycle
      phase: rand() * Math.PI * 2, // desynchronized start
    };
  }
  return cells;
}

function alphaFor(cell, time, palette) {
  // Raised-cosine blink: floor → peak → floor, no hard edges, no sync.
  const wave = 0.5 - 0.5 * Math.cos(((time / cell.period) + cell.phase / (Math.PI * 2)) * Math.PI * 2);
  const eased = wave * wave; // dwell longer near the floor: calmer
  return palette.floorAlpha + (palette.maxAlpha * cell.peak - palette.floorAlpha) * eased;
}

function paintCells(ctx, cells, cols, rows, startX, startY, palette, time) {
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const c = cells[row * cols + col];
      const alpha = alphaFor(c, time, palette);
      const rgb = alpha > palette.maxAlpha * 0.62 ? palette.bright : palette.base;
      ctx.fillStyle = css(rgb, alpha);
      ctx.fillRect(startX + col * PITCH, startY + row * PITCH, CELL, CELL);
    }
  }
}

let live = null; // running handle { raf, ro, onVisibility }

function destroy(running) {
  if (!running) return;
  try {
    running.raf && cancelAnimationFrame(running.raf);
  } catch { /* ignore */ }
  try {
    running.ro && running.ro.disconnect();
  } catch { /* ignore */ }
  try {
    if (running.onVisibility) document.removeEventListener('visibilitychange', running.onVisibility);
  } catch { /* ignore */ }
}

export function initTopbarContributions() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const host = document.querySelector ? document.querySelector('#topbar-contrib') : null;
  if (!host) return;
  // Already running (node preserved across a re-render): nothing to do.
  if (host.querySelector && host.querySelector('canvas')) return;
  if (typeof requestAnimationFrame === 'undefined') return;
  if (typeof document.createElement !== 'function') return;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  const parent = host.parentElement || host; // .topbar
  const box = { w: 0, h: 0, cols: 0, rows: 0, theme: '', cells: [] };

  function resize() {
    const rect = parent?.getBoundingClientRect ? parent.getBoundingClientRect() : null;
    const w = Math.max(1, Math.floor(rect?.width || parent?.clientWidth || 900));
    const h = Math.max(1, Math.floor(rect?.height || parent?.clientHeight || 70));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    box.w = w;
    box.h = h;
    box.cols = Math.max(1, Math.floor(w / PITCH));
    box.rows = Math.max(1, Math.floor(h / PITCH));
    box.theme = themeOf(document);
    box.cells = makeCells(box.cols * box.rows);
  }

  function geometry() {
    const bandW = box.cols * PITCH - GAP;
    const bandH = box.rows * PITCH - GAP;
    return {
      startX: Math.max(0, Math.round((box.w - bandW) / 2)),
      startY: Math.round((box.h - bandH) / 2),
    };
  }

  resize();
  const palette0 = paletteFor(box.theme);

  // Reduced motion: one static faint speckle, then stop. No loop, no timers.
  if (reduced) {
    const { startX, startY } = geometry();
    ctx.clearRect(0, 0, box.w, box.h);
    paintCells(ctx, box.cells, box.cols, box.rows, startX, startY, palette0, 1.7);
    return;
  }

  const running = { raf: 0, ro: null, onVisibility: null };
  live = running;
  let last = performance.now();
  let lastFrame = 0;
  let visible = !document.hidden;
  let themeCheck = 0;

  const loop = (now) => {
    if (live !== running) return;
    running.raf = requestAnimationFrame(loop);
    if (!visible) {
      last = now; // reset the clock so blinks never jump after a pause
      return;
    }
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    last = now;
    const t = now / 1000;

    // Rebuild once if the theme flipped under a preserved canvas.
    if (t - themeCheck > 1) {
      themeCheck = t;
      const theme = themeOf(document);
      if (theme !== box.theme) {
        box.theme = theme;
        box.cells = makeCells(box.cols * box.rows);
      }
    }

    const palette = paletteFor(box.theme);
    const { startX, startY } = geometry();
    ctx.clearRect(0, 0, box.w, box.h);
    paintCells(ctx, box.cells, box.cols, box.rows, startX, startY, palette, t);
  };

  if (typeof ResizeObserver !== 'undefined') {
    try {
      const ro = new ResizeObserver(() => {
        if (live !== running) return;
        resize();
      });
      ro.observe(parent);
      running.ro = ro;
    } catch { /* ignore */ }
  }

  const onVisibility = () => {
    visible = !document.hidden;
  };
  try {
    document.addEventListener('visibilitychange', onVisibility);
  } catch { /* ignore */ }
  running.onVisibility = onVisibility;

  running.raf = requestAnimationFrame(loop);
}

// Testable pure helpers (no DOM): temperament + blink curve + palettes.
export const __topbarTest = { makeCells, alphaFor, paletteFor, PITCH, CELL };
