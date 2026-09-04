// UI system smoke tests for the Magic-layer upgrade. These run the real client
// module against the DOM stub and assert that the new additive patterns render
// correct, accessible markup: bento overview, signature strip, blur-fade reveal
// attributes, and the command palette. No network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClient } from './helpers/dom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/guide.json'), 'utf8'));

const { state, render, captured } = await loadClient({ 'git-up-settings': '{}', 'git-up-history': '[]' });

function show(overrides = {}) {
  Object.assign(state, {
    mode: 'analysis',
    repoUrl: fixture.repository.canonicalUrl,
    guide: structuredClone(fixture),
    checked: {}, contractChecked: {}, failures: [], revisions: [], superseded: [],
    pathSelections: { ...fixture.pathGraph.defaults },
    expertise: 'some',
    modal: null, error: '', toast: null,
    palette: { query: '', index: 0 },
  }, overrides);
  render();
  return captured.html;
}

test('the empty view arms the staggered reveal and keeps the hero intact', () => {
  const html = show({ mode: 'empty', guide: null });
  assert.match(html, /data-reveal-stagger/, 'the how-it-works list staggers in');
  assert.match(html, /Make any repo/);
  assert.doesNotMatch(html, />undefined|\[object Object\]/);
});

test('the analysis view marks its panels for scroll reveal', () => {
  const html = show();
  const reveals = (html.match(/data-reveal[ >]/g) || []).length;
  assert.ok(reveals >= 5, `major panels carry data-reveal (found ${reveals})`);
  assert.match(html, /class="install-list" data-reveal-stagger/, 'steps stagger in');
  assert.match(html, /class="fail-list" data-reveal-stagger/, 'failure rows stagger in');
});

test('the overview strip is a bento grid with distinct weights', () => {
  const html = show();
  assert.match(html, /class="overview-cell summary"/);
  assert.match(html, /class="overview-cell branch"/);
  assert.match(html, /class="overview-cell language"/);
  assert.match(html, /class="overview-cell files"/);
});

test('the signature strip renders a seamless marquee with a screen-reader source', () => {
  const html = show();
  assert.match(html, /class="sig-marquee"/, 'the strip exists');
  assert.equal((html.match(/class="sig-marquee-group"/g) || []).length, 2, 'two identical groups make the loop seamless');
  assert.match(html, /<span class="sr-only">01 /, 'a text alternative exists for assistive tech');
});

test('the command palette opens with grouped, keyboard-navigable actions', () => {
  state.history = [{ id: 'h-test-1', url: 'https://github.com/acme/widget', name: 'widget', label: '', analyzedAt: '2026-01-01T00:00:00Z', guide: { repository: { name: 'widget' } } }];
  const html = show({ modal: 'palette' });
  assert.match(html, /id="palette-input"/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-activedescendant="palette-opt-/);
  assert.match(html, /Go to installation steps/);
  assert.match(html, /Generate install script/);
  assert.match(html, /AI provider settings/);
  assert.match(html, /Recent repositories/, 'history is reachable from the palette');
});

test('palette filtering narrows to matching actions', () => {
  show({ modal: 'palette', palette: { query: 'contract', index: 0 } });
  const html = captured.html;
  assert.match(html, /Go to install contract/);
  assert.doesNotMatch(html, /Go to installation steps/);
});
