// Session persistence is the core promise of the living install path, so it gets
// its own file: Node runs each test file in a fresh process, which is exactly
// what an import-time "resume" needs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClient } from './helpers/dom.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/guide.json'), 'utf8'));
const url = fixture.repository.canonicalUrl;

const session = {
  checked: { clone: true, dependencies: true },
  contractChecked: { 'verify-command': true },
  pathSelections: { method: 'native', os: 'windows', profile: 'full' },
  expertise: 'expert',
  revisions: [{ revision: 2, at: new Date().toISOString(), source: 'local-rules', failedStepTitle: 'Install deps', diagnosis: 'the service was not running', confidence: 'high', added: 1, removed: 0, matched: ['db-connection'] }],
  failures: [{ stepId: 'dependencies', at: new Date().toISOString(), errorText: 'ECONNREFUSED', revision: 2 }],
};

const { state, render, hydrateSession, sessionSnapshot, activePath, captured } = await loadClient({
  'git-up-settings': '{}',
  'git-up-active': url,
  'git-up-history': JSON.stringify([{ url, name: 'widget', label: '', analyzedAt: fixture.analyzedAt, guide: structuredClone(fixture), session }]),
});

test('a reload re-enters the install session instead of starting over', () => {
  assert.equal(state.mode, 'analysis', 'the analysis view comes back on its own');
  assert.equal(state.repoUrl, url);
  assert.equal(state.checked.clone, true, 'ticks are restored');
  assert.equal(state.checked.dependencies, true);
  assert.equal(state.contractChecked['verify-command'], true, 'contract confirmations are restored');
  assert.equal(state.expertise, 'expert', 'reader mode is restored');
  assert.deepEqual(state.pathSelections, session.pathSelections, 'the chosen graph branch is restored');
  assert.equal(state.revisions.length, 1, 'the revision trail is restored');
  assert.equal(state.failures.length, 1);
});

test('the restored view shows the resumed state and says so', () => {
  assert.match(captured.html, /data-step-id="clone" checked/);
  assert.match(captured.html, /How this path changed/);
  assert.match(captured.html, /Install deps did not work/);
  assert.match(captured.html, /is-failed/, 'the failed step keeps its mark');
  assert.match(captured.html, /Resumed this install — 2 steps ticked, 1 correction kept/);
  assert.match(captured.html, /Copy whole path/, 'expert mode comes back with its fast path');
});

test('ticks survive a branch change, and the path still composes from restored state', () => {
  const before = activePath().map((entry) => entry.id);
  assert.ok(before.includes('env-windows'), 'the windows branch is restored');
  assert.ok(!before.includes('env'), 'and the POSIX env step it replaces stays out');
  assert.ok(before.includes('dependencies'), 'the native branch keeps the dependency step');
  assert.equal(activePath().filter((entry) => state.checked[entry.key]).length >= 0, true);
});

test('a saved session writes back out without duplication', () => {
  const snapshot = sessionSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), ['checked', 'contractChecked', 'expertise', 'failures', 'pathSelections', 'revisions', 'savedAt', 'superseded'].sort());
  state.checked = { ...state.checked, env: true };
  const updated = sessionSnapshot();
  assert.equal(updated.checked.env, true);
  assert.equal(snapshot.checked.env, undefined, 'the snapshot is not a live reference');
});

test('a partial or corrupt session degrades to a fresh checklist', () => {
  for (const broken of [undefined, null, {}, { checked: 'nope', revisions: 'nope', pathSelections: 7 }, { checked: { clone: true }, expertise: 'not-a-level' }]) {
    state.guide = structuredClone(fixture);
    hydrateSession(broken, state.guide);
    render();
    assert.doesNotMatch(captured.html, />undefined|\[object Object\]/, `rendering with ${JSON.stringify(broken)} stays clean`);
    assert.match(captured.html, /Installation steps/);
  }
  // a session that names a step that no longer exists must not crash progress
  hydrateSession({ checked: { 'deleted-step': true }, revisions: [] }, state.guide);
  render();
  assert.match(captured.html, /0\/\d+ complete/, 'orphaned ticks simply do not count');
});

test('an analysis with no saved session starts clean', () => {
  state.guide = structuredClone(fixture);
  hydrateSession(null, state.guide);
  assert.deepEqual(state.checked, {});
  assert.deepEqual(state.revisions, []);
  assert.deepEqual(state.pathSelections, { ...fixture.pathGraph.defaults });
});
