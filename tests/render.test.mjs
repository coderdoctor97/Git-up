// Client render tests. The real browser module is loaded in Node against a
// stubbed DOM so a whole view can be rendered and asserted — this is what catches
// template mistakes (a swallowed render() call, a field the loader drops) that
// pure logic tests cannot see. Node caches the module per file, so each test
// resets the state it cares about instead of re-importing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClient } from './helpers/dom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/guide.json'), 'utf8'));

const { state, render, activePath, installScript, setPathOption, setExpertise, captured } = await loadClient({ 'git-up-settings': '{}', 'git-up-history': '[]' });

function show(overrides = {}) {
  Object.assign(state, {
    mode: 'analysis',
    repoUrl: fixture.repository.canonicalUrl,
    guide: structuredClone(fixture),
    checked: {}, contractChecked: {}, failures: [], revisions: [], superseded: [],
    pathSelections: { ...fixture.pathGraph.defaults },
    expertise: 'some',
    modal: null, error: '', toast: null,
  }, overrides);
  render();
  return captured.html;
}

test('the empty view keeps its hero and gains the reader picker', () => {
  const html = show({ mode: 'empty', guide: null });
  assert.match(html, /Make any repo/);
  assert.match(html, /Start from/);
  assert.match(html, /data-expertise="novice"/);
  assert.match(html, /How Git-Up works/);
  assert.doesNotMatch(html, />undefined|\[object Object\]/);
});

test('a full guide renders every v2 panel', async () => {
  const html = show();

  assert.match(html, /Install health/);
  assert.match(html, /class="ring-fill tone-amber"/, 'the score ring adopts the band tone');
  assert.equal((html.match(/class="factor"/g) || []).length, fixture.health.factors.length, 'one bar per factor');
  assert.match(html, /Default branch checks are failing/, 'caps are surfaced');

  assert.match(html, /How this install usually breaks/);
  assert.match(html, /#7427 npm install fails behind proxy/, 'real thread evidence is linked');
  assert.match(html, /Registry \/ proxy \/ TLS unreachable/);
  assert.match(html, /inferred from files/, 'inferred items are labelled, not passed off as reported');
  assert.match(html, /pre-empted in step/, 'the patched step is named');

  assert.match(html, /class="graph-svg"/);
  assert.equal((html.match(/class="graph-hit"/g) || []).length, fixture.pathGraph.axes.reduce((sum, axis) => sum + axis.options.length, 0), 'every option is clickable');
  assert.ok((html.match(/graph-edge/g) || []).length > 4, 'edges connect the columns');
  assert.match(html, /class="graph-edge on-path/, 'the chosen branch is highlighted');
  assert.ok((html.match(/graph-edge on-path/g) || []).length >= 3, 'each hop of the chosen chain lights up');

  assert.match(html, /Install contract/);
  assert.match(html, /GITUP-ABC1234/);
  assert.match(html, /sealed by/, 'the signature block renders');
  assert.match(html, /What this contract could not determine/, 'gaps are disclosed');
  assert.equal((html.match(/data-contract-id="/g) || []).length, fixture.contract.checklist.length);

  assert.match(html, /data-action="step-failed"/, 'each step can fail');
  assert.equal((html.match(/data-action="step-failed"/g) || []).length, activePath().length);
  assert.match(html, /Seen in 3 reported threads/, 'the guard text explains itself');
  assert.match(html, /In plain English/, 'pre-existing panels survive');
  assert.doesNotMatch(html, /Curious Explorer/, 'the old inline explorer is removed');
  assert.match(html, /oreo-float/, 'the floating Oreo chatbot replaces it');
  assert.match(html, /Oreo the cat bot/, 'the tooltip names Oreo');
  assert.match(html, /dotlottie-player/, 'the robot uses the dotLottie player');
  assert.match(html, /stZ4jBVCdO\.lottie/, 'the requested robot animation is used');
  assert.match(html, /data-action="oreo-toggle"/, 'the robot is wrapped in a button');
  assert.doesNotMatch(html, />undefined|\[object Object\]/);
});

test('graph clicks recompose the checklist without a request', () => {
  show();
  const native = activePath().map((entry) => entry.id);
  setPathOption('method', 'docker');
  const docker = activePath().map((entry) => entry.id);
  assert.ok(docker.includes('docker') && !docker.includes('dependencies'), 'docker swaps the dependency chain');
  assert.notDeepEqual(docker, native);
  setPathOption('os', 'windows');
  assert.ok(activePath().some((entry) => entry.id === 'env-windows'), 'windows brings its own env step');
  assert.ok(!activePath().some((entry) => entry.id === 'env'), 'and drops the POSIX one');
  render();
  assert.match(captured.html, /Copy-Item \.env\.example \.env/);
  assert.match(captured.html, /not PowerShell commands/, 'the option warning is shown');
});

test('the generated script follows the chosen branch and ends on the contract check', () => {
  show();
  const script = installScript();
  assert.ok(script.startsWith('#!/usr/bin/env bash'));
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /GITUP-ABC1234/);
  assert.match(script, /install health 62\/100/);
  assert.match(script, /path: Native · Linux · Full workspace/);
  assert.match(script, /Final check from the install contract/);
  assert.ok(script.trim().endsWith('http://localhost:3000'), 'verification is the last thing in the script');
  assert.ok(script.trim().split('\n').length > 10, 'the script is more than a stub');
});
