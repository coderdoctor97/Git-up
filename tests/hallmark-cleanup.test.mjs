// Regression gates for the strong Hallmark redesign and its field-manual
// refinement. These protect product structure, the route-ledger composition,
// contribution motion, reading rhythm, and deliberately reduced divider use.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const styles = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const support = fs.readFileSync(path.join(root, 'public', 'magic.css'), 'utf8');
const magicScript = fs.readFileSync(path.join(root, 'public', 'magic.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = `${styles}\n${support}`;

test('the stylesheet is stamped and keeps the Git-Up ledger system', () => {
  assert.match(styles, /^\/\* Hallmark · pre-emit critique: P\d H\d E\d S\d R\d V\d/);
  assert.match(styles, /theme: existing Git-Up route ledger/);
  assert.match(styles, /--route:\s*#7fe0b2/);
  assert.match(styles, /--route-ink:\s*var\(--bg-deep\)/);
  assert.match(styles, /--display:\s*'Avenir Next'/);
});

test('the strong visual composition remains unmistakably structural', () => {
  assert.match(support, /Strong visual pass — field-manual inversion/);
  assert.match(styles, /--manual:\s*#e8eee9;[\s\S]*--manual-ink:\s*#0a1511;/);
  assert.match(styles, /--radius-sm:\s*4px;[\s\S]*--radius:\s*6px;[\s\S]*--radius-lg:\s*10px;/);
  assert.match(support, /\.layout \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 304px/s);
  assert.match(support, /\.sidebar \{[^}]*grid-column:\s*2;[^}]*border-left:\s*2px solid var\(--line-strong\)/s);
  assert.match(support, /\.hero \{[^}]*background:\s*var\(--manual\);[^}]*border-top:\s*8px solid var\(--route\)/s);
  assert.match(support, /@media \(min-width: 1200px\)[\s\S]*\.hero > \.repo-form,[\s\S]*\.hero > \.error-banner \{[^}]*position:\s*absolute;/s);
  assert.match(support, /\.main-inner > \.repo-form \{[^}]*background:\s*var\(--manual\)/s);
  assert.match(support, /\.route-preview \{[^}]*display:\s*grid;[^}]*border-radius:\s*0;/s);
  assert.match(support, /\.panel \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/s);
  assert.match(support, /#particles-workspace \{[^}]*position:\s*fixed;[^}]*right:\s*304px;[^}]*opacity:\s*\.24;/s);
  assert.match(support, /#particles-workspace \{ opacity:\s*\.24; \}/);
  assert.match(support, /#topbar-contrib \{ opacity:\s*\.58; \}/);
  assert.match(support, /body::after \{[^}]*conic-gradient\([^}]*background-size:\s*32px 32px;[^}]*animation:\s*contribution-drift/s);
  assert.match(support, /h1 \{[^}]*max-width:\s*15ch;[^}]*letter-spacing:\s*-\.04em;/s);
  assert.match(support, /\.initial-content \{[^}]*border-top:\s*0;/s);
  assert.match(support, /\.analysis-head \{[^}]*border-bottom:\s*0;/s);
  assert.match(support, /\.panel-heading \{[^}]*border:\s*0;/s);
  assert.match(support, /\.step-row \{[^}]*border-bottom:\s*0;/s);
  assert.match(support, /@media \(max-width: 1399px\)[\s\S]*\.analysis-head \{ display:\s*block; \}/s);
  assert.match(support, /@media \(max-width: 1100px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 220px;/s);
  assert.match(support, /@media \(max-width: 720px\)[\s\S]*\.sidebar \{ display:\s*none; \}[\s\S]*\.mobile-nav,[\s\S]*display:\s*flex;/s);
  assert.match(support, /\.mobile-nav,[\s\S]*background:\s*var\(--manual\)/s);
});

test('hover feedback stays restrained, transform-only, and pointer-aware', () => {
  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
  assert.doesNotMatch(css, /transition[^;]*(?:width|height|padding|margin)/i);
  assert.doesNotMatch(css, /border-(?:left|right):\s*[3-9]\d*px[^;]*var\(--route\)/i);
  assert.doesNotMatch(support, /:hover[^\{]*\{[^}]*scale\(/is);
  assert.match(support, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(support, /\.analyze-button:hover:not\(:disabled\),[\s\S]*transform:\s*translateY\(-1px\)/);
  assert.match(support, /\.tree-row\.dir:hover \{ transform:\s*translateX\(2px\); \}/);
});

test('generic sheen, cursor spotlight, card glow, and blurred entrances stay retired', () => {
  for (const retired of [
    /magic-sheen/i,
    /--mx\b/,
    /--my\b/,
    /spotlight/i,
    /\.panel::before/,
    /filter\s*:\s*blur\(/i,
  ]) {
    assert.doesNotMatch(support, retired);
  }
  assert.match(support, /\[data-reveal\] \{[^}]*translate3d\(0, 12px, 0\)/s);
  assert.doesNotMatch(support, /\[data-reveal\] \{[^}]*translate(?:Y|3d)\([^}]*(?:2[0-9]|[3-9][0-9])px/is);
  assert.doesNotMatch(styles, /body::before\s*\{/);
  assert.doesNotMatch(`${app}\n${magicScript}`, /bindSpotlight|SPOTLIGHT_SELECTOR|--m[xy]\b/);
  assert.doesNotMatch(magicScript, /pointermove/);
});

test('reveals remain progressive, brief, and reduced-motion safe', () => {
  assert.match(support, /html\.reveal-armed:not\(\.reveal-done\) \[data-reveal\]/);
  assert.match(support, /transition:\s*opacity var\(--dur-major\) var\(--ease\), transform var\(--dur-major\) var\(--ease\)/);
  assert.match(support, /transition:\s*opacity var\(--dur-normal\) var\(--ease\), transform var\(--dur-normal\) var\(--ease\)/);
  assert.match(styles, /--dur-normal:\s*220ms/);
  assert.match(support, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transform:\s*none !important;[\s\S]*transition:\s*none !important/);
});

test('responsive and state gates remain explicit', () => {
  assert.match(styles, /html, body \{ overflow-x: clip; \}/);
  assert.match(styles, /h1, h2, h3, h4 \{[^}]*overflow-wrap: anywhere;[^}]*font-style: normal;/);
  assert.match(styles, /button:disabled,[\s\S]*textarea:disabled \{[^}]*opacity:[^}]*filter: saturate\(/);
  assert.match(styles, /@media \(pointer: coarse\)[\s\S]*min-width: 44px;[\s\S]*min-height: 44px;/);
  assert.match(support, /@media \(max-width: 1199px\)[\s\S]*\.hero > \.error-banner \{ order:\s*2;[^}]*max-width:\s*none;/s);
  assert.match(support, /body:has\(\.hero > \.error-banner\) \.oreo-float \{ top:\s*76px; bottom:\s*auto; \}/);
  assert.match(support, /\.palette-input:focus-visible \{[^}]*outline-color: var\(--route\)/s);
});

test('the file browser uses honest ARIA semantics', () => {
  assert.match(app, /class="file-tree" role="region" aria-label="Repository file tree"/);
  assert.doesNotMatch(app, /class="file-tree" role="tree"/);
});

test('core text and primary-action token pairs clear WCAG AA', () => {
  const rootBlock = styles.match(/:root \{([\s\S]*?)\n\}/)?.[1] || '';
  const lightBlock = styles.match(/\[data-theme="light"\] \{([\s\S]*?)\n\}/)?.[1] || '';
  const token = (block, name) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + .05) / (low + .05);
  };

  assert.ok(contrast(token(rootBlock, 'muted-2'), token(rootBlock, 'panel-raised')) >= 4.5, 'dark secondary text');
  assert.ok(contrast(token(rootBlock, 'bg-deep'), token(rootBlock, 'route')) >= 4.5, 'dark primary button');
  assert.ok(contrast(token(lightBlock, 'route'), token(lightBlock, 'panel')) >= 4.5, 'light mint text and button fill');
  assert.ok(contrast(token(lightBlock, 'route'), token(lightBlock, 'panel-raised')) >= 4.5, 'light mint on raised surface');
});

test('layering consumes the named z-index scale', () => {
  assert.match(styles, /--z-oreo:\s*40;[\s\S]*--z-oreo-panel:\s*41;[\s\S]*--z-mobile-nav:\s*50;[\s\S]*--z-modal:\s*60;/);
  const declarations = css.split('\n').filter((line) => /z-index\s*:/.test(line));
  assert.ok(declarations.length >= 10, 'expected named layers across both stylesheets');
  for (const declaration of declarations) {
    assert.match(declaration, /z-index\s*:\s*var\(--z-[\w-]+\)/, `unnamed layer: ${declaration.trim()}`);
  }
});

test('existing supporting components and their accessibility fallbacks remain', () => {
  for (const marker of [
    '.sig-marquee-track',
    '@keyframes signature-loop',
    '.palette-modal',
    '#particles-workspace',
    '#topbar-contrib',
    '.ring-value',
  ]) {
    assert.ok(support.includes(marker), `missing supporting presentation marker: ${marker}`);
  }
  assert.match(support, /\.sig-marquee:hover \.sig-marquee-track,[\s\S]*body:focus-within \.sig-marquee-track \{ animation-play-state: paused; \}/);
  assert.match(support, /\.sig-marquee-track \.sig-marquee-group:nth-child\(2\) \{ display: none; \}/);
});
