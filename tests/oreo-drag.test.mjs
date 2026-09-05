// Oreo drag-vs-tap regression tests. The bug: the drag-vs-tap split relied on
// a shared boolean flag + threshold plus button-level move/up listeners, so
// any re-render between pointerup and click (toast timer, analysis stream,
// typing state) left the flag stale and a drag could randomly pop the chat
// open (or swallow a real tap).
//
// The fix under test: whole-bot dragging with window-level tracking, anchored
// grab offset, no re-render mid-gesture, and a self-expiring timestamp guard
// for the post-drag synthetic click. The chat panel itself docks in the blank
// left gutter, fixed to the viewport so it stays nearby after scrolling.
// The robot stays wherever you dragged him.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClient } from './helpers/dom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, '..', 'public', 'styles.css'), 'utf8');

const { state, render, captured, oreoHtml, toggleOreo, oreoClampPos, oreoShouldSuppressClick, oreoSpringStep, oreoPanelPositionStyle } = await loadClient({ 'git-up-settings': '{}', 'git-up-history': '[]' });

test('clamp keeps the bot inside the viewport', () => {
  assert.deepEqual(oreoClampPos(500, 300, 1024, 768), { x: 500, y: 300 });
  assert.deepEqual(oreoClampPos(-50, -20, 1024, 768), { x: 4, y: 4 }, 'negative goes to the margin');
  assert.deepEqual(oreoClampPos(5000, 5000, 1024, 768), { x: 940, y: 684 }, 'overflow is pulled back inside');
  assert.deepEqual(oreoClampPos(10.6, 20.4, 1024, 768), { x: 11, y: 20 }, 'position rounds to whole pixels');
  assert.deepEqual(oreoClampPos(10, 10, 0, 0), { x: 10, y: 10 }, 'a broken viewport falls back instead of NaN');
});

test('click suppression is timestamp-based and self-expiring', () => {
  globalThis.window.__oreoSuppressClickUntil = Date.now() + 10_000;
  assert.equal(oreoShouldSuppressClick(), true, 'fresh drag suppresses the trailing click');
  globalThis.window.__oreoSuppressClickUntil = Date.now() - 1;
  assert.equal(oreoShouldSuppressClick(), false, 'an expired window can never swallow a later tap');
  delete globalThis.window.__oreoSuppressClickUntil;
  assert.equal(oreoShouldSuppressClick(), false, 'unset guard never blocks');
});

test('a suppressed trailing click cannot open the chat', () => {
  state.chat.open = false;
  globalThis.window.__oreoSuppressClickUntil = Date.now() + 10_000;
  toggleOreo();
  assert.equal(state.chat.open, false, 'drag-trailing click is swallowed');
  globalThis.window.__oreoSuppressClickUntil = Date.now() - 1;
  toggleOreo();
  assert.equal(state.chat.open, true, 'a real tap still opens');
  state.chat.open = false;
  render();
});

test('the robot is directly draggable and the panel docks left', () => {
  state.chat.open = false;
  state.chat.hidden = false;
  render();
  const html = captured.html;
  assert.match(html, /data-action="oreo-toggle"/, 'robot button toggles the chat');
  assert.match(html, /drag Oreo to move him/, 'the robot itself is the drag surface again');
  assert.doesNotMatch(html, /id="oreo-drag"/, 'no separate drag handle needed anymore');
  assert.match(css, /\.oreo-panel\s*\{[^}]*position:\s*fixed[^}]*left:\s*264px/, 'panel is fixed in the blank left gutter');
});

test('spring step trails without overshooting and snaps when close', () => {
  assert.equal(oreoSpringStep(0, 100), 20, 'moves a fifth of the way by default');
  assert.equal(oreoSpringStep(99.7, 100), 100, 'snaps when already close');
  assert.equal(oreoSpringStep(100, 100), 100, 'rests exactly on target');
  let pos = 0;
  for (let i = 0; i < 60; i += 1) pos = oreoSpringStep(pos, 100);
  assert.equal(pos, 100, 'converges to the target instead of orbiting it');
  assert.ok(oreoSpringStep(0, 100) > 0 && oreoSpringStep(0, 100) < 100, 'never overshoots on the first step');
  assert.equal(oreoSpringStep(NaN, 50), 50, 'bad input falls back to the target');
});

test('clamp supports per-axis sizes for the chat panel', () => {
  assert.deepEqual(
    oreoClampPos(2000, 2000, 1024, 768, 4, 320, 440),
    { x: 704, y: 328 },
    'panel edges stay inside on both axes',
  );
  assert.deepEqual(
    oreoClampPos(500, 300, 1024, 768, 4, 320, 440),
    { x: 500, y: 300 },
    'a fitting panel keeps its position',
  );
});

test('the chat box is draggable and remembers its spot', () => {
  state.chat.open = true;
  state.chat.hidden = false;
  state.chat.panelPos = null;
  render();
  let html = captured.html;
  assert.match(html, /class="oreo-head" title="Drag to move this chat box/, 'header advertises dragging');
  assert.doesNotMatch(html, /<section class="oreo-panel"[^>]*style="left:/, 'docked panel carries no inline position');
  state.chat.panelPos = { x: 120, y: 140 };
  assert.equal(oreoPanelPositionStyle(), ' style="left:120px;top:140px;right:auto;bottom:auto;"', 'position style pins the panel');
  render();
  html = captured.html;
  assert.match(html, /<section class="oreo-panel"[^>]*style="left:120px;top:140px;right:auto;bottom:auto;"/, 'dragged panel renders where it was dropped');
  state.chat.open = false;
  state.chat.panelPos = null;
  render();
});

test('the messenger uses the local handwriting font and nothing else does', () => {
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*'Excalifont'[^}]*\/assets\/fonts\/Excalifont-Regular\.woff2/, 'Excalifont loads from the local assets folder');
  assert.match(css, /\.oreo-bubble-msg[^{]*\{[^}]*font-family:\s*var\(--oreo-hand\)/, 'message bubbles use the hand font');
  assert.match(css, /\.oreo-pre[^{]*\{[^}]*font-family:\s*var\(--mono\)/, 'code blocks stay monospace');
  const siteFont = css.split('Oreo the cat bot')[0];
  assert.doesNotMatch(siteFont, /Excalifont/, 'no site-wide font leaking before the messenger styles');
});
