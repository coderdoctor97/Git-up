// Offline regression tests for the v2 features. No network, no AI key: every
// module is fed synthetic repository files and a fake GitHub client, so the
// logic that shapes a guide is verifiable on its own.
//
//   node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { composeSteps, keyOf, orderOf, progressOf, applyRevision, decorateSteps, selectionsLabel, EXPERTISE_LEVELS, tuneGuide } from '../public/path-engine.js';
import { computeHealth } from '../server/health.js';
import { buildContract } from '../server/contract.js';
import { buildPathGraph, patchStepsForFailures } from '../server/pathgraph.js';
import { scanInstallFailures, FAILURE_SIGNATURES } from '../server/failures.js';
import { heuristicRecover } from '../server/recovery.js';

const repo = { owner: 'acme', repo: 'widget', canonicalUrl: 'https://github.com/acme/widget', apiPath: 'acme/widget' };

const file = (path, content) => ({ path, content });
const nodeFiles = [
  file('package.json', JSON.stringify({
    name: 'widget',
    version: '2.1.0',
    engines: { node: '>=20' },
    scripts: { dev: 'vite', build: 'vite build', start: 'node server.js', test: 'vitest run' },
    dependencies: { express: '^4.19.2', zod: '^3.23.8' },
    devDependencies: { vite: '^5.2.0' },
  })),
  file('README.md', '# Widget\n\n## Getting started\n\n```bash\nnpm install\ncp .env.example .env\nnpm run dev\n```\n\nTroubleshooting: if the port is taken, set PORT=3001.\n'),
  file('package-lock.json', '{}'),
  file('.env.example', 'DATABASE_URL=\nAPI_KEY=\n'),
];
// nested package.json on purpose: the root manifest must win over a workspace one
const dockerFiles = [file('Dockerfile', 'FROM node:20-alpine\nEXPOSE 8080\nCMD ["npm","start"]'), file('docker-compose.yml', 'services:\n  web:\n    ports:\n      - "3000:8080"\n'), file('emails/package.json', '{"name":"emails","dependencies":{"nodemailer":"^6"}}')];

// --- Feature 3 + 1: path composition ---------------------------------------
test('composeSteps honours option removes, adds, and step-level when/unless', () => {
  const base = decorateSteps([
    { id: 'clone', title: 'Clone', command: 'git clone x', order: 10 },
    { id: 'dependencies', title: 'Install', command: 'npm install', order: 25 },
    { id: 'env', title: 'Copy env', command: 'cp .env.example .env', order: 35 },
    { id: 'env-windows', title: 'Copy env (PowerShell)', command: 'Copy-Item .env.example .env', order: 34, when: { os: 'windows' } },
  ]);
  const graph = {
    axes: [{
      id: 'os',
      label: 'Platform',
      options: [
        { id: 'linux', label: 'Linux', adds: [{ id: 'linux-only', title: 'Linux step', order: 40 }] },
        { id: 'windows', label: 'Windows', removes: ['env', 'linux-only'] },
      ],
    }],
    defaults: { os: 'linux' },
  };
  assert.deepEqual(composeSteps(base, graph, {}).map((entry) => entry.id), ['clone', 'dependencies', 'env', 'linux-only'], 'inserted steps land on their own order slot');
  const windows = composeSteps(base, graph, { os: 'windows' }).map((entry) => entry.id);
  assert.deepEqual(windows, ['clone', 'dependencies', 'env-windows'], 'windows swaps env step and drops the linux step');
});

test('composition orders by the order slot and renumbers positions', () => {
  const steps = composeSteps([
    { id: 'run', title: 'r', order: 65 },
    { id: 'clone', title: 'c', order: 10 },
    { id: 'mid', title: 'm' },
  ], { axes: [], defaults: {} }, {});
  assert.deepEqual(steps.map((entry) => entry.id), ['clone', 'mid', 'run']);
  assert.deepEqual(steps.map((entry) => entry.position), [1, 2, 3]);
  assert.equal(orderOf({ id: 'dependencies' }), 25);
});

test('lineage keys are stable and drive progress', () => {
  const steps = decorateSteps([{ id: 'clone' }, { id: 'run' }]);
  assert.equal(keyOf(steps[0]), 'clone');
  assert.equal(progressOf(steps, { clone: true }).percent, 50);
  assert.equal(progressOf([], {}).percent, 0);
  assert.equal(selectionsLabel([{ id: 'os', options: [{ id: 'mac', label: 'macOS' }] }], { os: 'mac' }), 'macOS');
});

test('applyRevision keeps the completed prefix and reuses ids so ticks survive', () => {
  const steps = decorateSteps([{ id: 'clone' }, { id: 'dependencies' }, { id: 'run' }]);
  const revised = applyRevision(steps, {
    revision: 2,
    correctedSteps: [{ id: 'db-up', title: 'Start db', command: 'docker compose up -d' }, { id: 'dependencies', title: 'Install again' }],
  }, 'dependencies');
  assert.equal(revised.changedFrom, 1);
  assert.deepEqual(revised.steps.map((entry) => entry.id), ['clone', 'db-up', 'dependencies']);
  assert.equal(revised.steps[2].key, 'dependencies', 'the kept step reuses its key');
  assert.deepEqual(revised.superseded.map((entry) => entry.id), ['run'], 'the dropped step is retired, not deleted');
  assert.ok(revised.steps.every((entry) => entry.revision >= 1));
});

// --- Feature 5: reader modes -----------------------------------------------
test('tuneGuide shapes depth, is idempotent, and never compounds on re-tuning', () => {
  const guide = {
    steps: [{ id: 'clone', title: 'Clone', command: 'git clone x', detail: 'First sentence. Second sentence that expert mode should drop.' }],
    explanations: [{ stepId: 'clone', body: 'Because the code has to be on your machine.' }],
    notes: ['Review project notes before production use.', 'GitHub rate limit hit; a lightweight scan was used.'],
    plainOverview: { analogy: 'a recipe box', problem: 'saves time', audience: 'everyone', howItWorks: ['one', 'two'] },
  };
  guide.tuning = { steps: guide.steps, notes: guide.notes, plainOverview: guide.plainOverview };

  const novice = tuneGuide(guide, 'novice');
  assert.match(novice.steps[0].detail, /Because the code has to be/, 'novice merges the why into the step');
  assert.equal(novice.expertise.explanation, 'full');

  const expert = tuneGuide(guide, 'expert');
  assert.ok(!/Second sentence/.test(expert.steps[0].detail), 'expert trims prose');
  assert.ok(Array.isArray(guide.plainOverview.howItWorks) && guide.plainOverview.howItWorks.length === 2, 'the source guide is never mutated');

  assert.deepEqual(JSON.stringify(tuneGuide(tuneGuide(guide, 'expert'), 'novice').steps), JSON.stringify(novice.steps), 'switching back restores the original depth');
  assert.deepEqual(tuneGuide(novice, 'novice').steps, novice.steps, 're-applying the same level changes nothing');
  assert.equal(EXPERTISE_LEVELS.length, 3);
  assert.ok(tuneGuide(guide, 'expert').hiddenNotes >= 0);
});

// --- Feature 6: health ------------------------------------------------------
test('health score is evidence based and caps on real blockers', () => {
  const healthy = computeHealth({ repo, metadata: { pushed_at: new Date().toISOString(), default_branch: 'main', stargazers_count: 10, open_issues_count: 1 }, files: nodeFiles, failureScan: { available: true, patterns: [], sampled: { issues: 10, pulls: 5 }, totalThreads: 15, installRelated: 0 }, ci: { state: 'passing', total: 4, branch: 'main' } });
  assert.ok(healthy.score >= 70, `expected a healthy score, got ${healthy.score}`);
  assert.equal(healthy.factors.length, 5);
  assert.equal(healthy.method, 'evidence-only');
  assert.ok(healthy.weights.documentation > 0);

  const noReadme = computeHealth({ repo, metadata: { default_branch: 'main' }, files: [file('index.js', 'x')], failureScan: null, ci: { state: 'no-ci' } });
  assert.ok(noReadme.caps.join(' ').includes('documentation'), 'a missing README caps the score');
  assert.ok(noReadme.score <= 58);

  const failingCi = computeHealth({ repo, metadata: { default_branch: 'main' }, files: nodeFiles, failureScan: { available: true, patterns: [], sampled: {}, totalThreads: 0 }, ci: { state: 'failing', failing: 2, failingNames: ['test'], branch: 'main' } });
  assert.ok(failingCi.score <= 64 && failingCi.caps.join(' ').includes('failing'), 'failing main branch is called out and capped');

  const archived = computeHealth({ repo, metadata: { archived: true, default_branch: 'main' }, files: nodeFiles, failureScan: { available: true, patterns: [], sampled: {}, totalThreads: 0 }, ci: { state: 'passing' } });
  assert.ok(archived.score <= 42, 'archived repositories cannot score well');
});

// --- Feature 2: failure-first analysis --------------------------------------
test('install failures are clustered from real threads and ranked by frequency', async () => {
  const issues = [
    { number: 10, title: 'Cannot install: ERESOLVE could not resolve', body: 'npm ERR! ERESOLVE while resolving react-scripts', state: 'open', comments: 12, reactions: { total_count: 30 }, updated_at: '2026-01-01T00:00:00Z' },
    { number: 11, title: 'npm install fails with peer dependency conflict', body: 'conflicting peer dependency typescript', state: 'open', comments: 4, reactions: { total_count: 8 } },
    { number: 12, title: 'EACCES permission denied writing node_modules', body: 'EACCES: permission denied, mkdir /usr/lib/node_modules', state: 'closed', comments: 1, reactions: { total_count: 2 } },
    { number: 13, title: 'Feature request: dark mode', body: 'please add a theme toggle', state: 'open', comments: 0, reactions: { total_count: 1 } },
    { number: 14, title: 'Add install docs for windows', body: 'npm install works, then the start script is not recognized as a cmdlet', state: 'open', comments: 0, reactions: { total_count: 0 } },
  ];
  const fakeGithub = async (path) => {
    if (path.includes('/issues')) return issues;
    if (path.includes('/pulls')) return [];
    return {};
  };
  const scan = await scanInstallFailures({ repo, metadata: {}, files: nodeFiles, github: fakeGithub });
  assert.equal(scan.available, true);
  assert.equal(scan.sources.issues, 'ok');
  assert.ok(scan.installRelated >= 3, `expected install-related threads, got ${scan.installRelated}`);
  const top = scan.patterns[0];
  assert.equal(top.origin, 'reported');
  assert.ok(top.count >= 2, 'the most frequent signature ranks first');
  assert.ok(top.threads.every((thread) => thread.url), 'evidence links are kept');
  assert.ok(!scan.patterns.some((pattern) => pattern.threads?.some((thread) => /dark mode/.test(thread.title))), 'unrelated feature requests are excluded');
  assert.ok(FAILURE_SIGNATURES.length >= 12);
});

test('a rate-limited scan degrades to clearly-labelled inference', async () => {
  const scan = await scanInstallFailures({ repo, metadata: { pushed_at: new Date().toISOString() }, files: [file('package.json', '{"dependencies":{"a":"1"}}')], github: async () => { throw new Error('GitHub rate limit reached.'); } });
  assert.equal(scan.available, false);
  assert.match(scan.notice, /rate limit/i);
  assert.ok(scan.patterns.length > 0 && scan.patterns.every((pattern) => pattern.origin === 'inferred'), 'inferred items are never presented as reported');
});

test('failure findings are written back into the steps they would break', () => {
  const failureScan = {
    available: true,
    patterns: [
      { id: 'network-tls', label: 'Registry unreachable', why: 'proxy', origin: 'reported', count: 4, commands: ['npm config get registry'], patchStepId: 'dependencies' },
      { id: 'database-services', label: 'Database missing', why: 'no service started', origin: 'reported', count: 2, commands: ['docker compose up -d db'], patchStepId: 'services' },
    ],
  };
  const { steps, patches } = patchStepsForFailures(
    [{ id: 'clone', title: 'Clone', order: 10 }, { id: 'dependencies', title: 'Install', command: 'npm install', order: 25 }],
    failureScan,
  );
  const dependencies = steps.find((entry) => entry.id === 'dependencies');
  assert.ok(dependencies.command.startsWith('npm config get registry'), 'the check is prepended to the vulnerable step');
  assert.deepEqual(dependencies.patchedFor, ['network-tls']);
  const guard = steps.find((entry) => entry.id === 'guard-database-services');
  assert.ok(guard, 'a missing target step becomes a guard step');
  assert.ok(guard.order > 25, 'the guard sits after the work it protects, not above the clone step');
  assert.deepEqual(patches.map((patch) => patch.mode).sort(), ['added-step', 'prepended-command']);
});

// --- Feature 4: install contract --------------------------------------------
test('the contract states versions, side effects, and a verification, and is deterministic', () => {
  const contract = buildContract({
    repo,
    metadata: { default_branch: 'main' },
    files: dockerFiles.concat(nodeFiles),
    steps: [{ id: 'run', title: 'Start the dev server', command: 'npm run dev' }],
    health: { score: 74, caps: [] },
    failureScan: { available: true, patterns: [{ origin: 'reported' }, { origin: 'reported' }] },
    source: 'local-scan',
  });
  assert.match(contract.contractId, /^GITUP-[0-9A-Z]{7}$/);
  assert.equal(buildContract({ repo, metadata: { default_branch: 'main' }, files: dockerFiles.concat(nodeFiles), steps: [{ id: 'run', title: 'Start the dev server', command: 'npm run dev' }], health: { score: 74, caps: [] }, failureScan: { available: true, patterns: [{ origin: 'reported' }, { origin: 'reported' }] }, source: 'local-scan' }).contractId, contract.contractId, 'same terms hash the same');
  const node = contract.expects.find((entry) => entry.name === 'Node.js');
  assert.equal(node.required, '>=20');
  assert.equal(node.confidence, 'declared');
  assert.ok(contract.installs.some((entry) => /3 packages/.test(entry.what)), 'dependency counts come from the manifest');
  assert.ok(contract.permissions.some((entry) => /localhost:3000/.test(entry.capability)), 'compose port mapping is read as a permission');
  assert.ok(contract.permissions.some((entry) => /Read local secrets/.test(entry.capability)), 'env keys are disclosed');
  assert.match(contract.verification.command, /localhost:3000/);
  assert.ok(contract.checklist.length >= 3);
  assert.ok(contract.guarantees.some((line) => /never runs/i.test(line)));
  assert.equal(contract.status, 'proposed');
});

test('the contract admits what it could not read instead of looking empty', () => {
  const blind = buildContract({ repo, metadata: {}, files: [file('package.json', '')], steps: [], health: null, failureScan: { available: false, patterns: [] }, source: 'local-scan' });
  assert.ok(blind.gaps.some((gap) => gap.field === 'everything'), 'unreachable file bodies are declared');
  const sparse = buildContract({ repo, metadata: {}, files: [file('index.js', 'console.log(1)')], steps: [], health: null, failureScan: { available: true, patterns: [] }, source: 'local-scan' });
  assert.ok(sparse.gaps.length > 0, 'a repo with no manifests explains itself');
});

// --- Feature 1: recovery ----------------------------------------------------
test('recovery matches a real npm failure and rebuilds only what follows the fault', () => {
  const steps = decorateSteps([{ id: 'clone', title: 'Clone' }, { id: 'dependencies', title: 'Install', command: 'npm install' }, { id: 'run', title: 'Run', command: 'npm start' }]);
  const result = heuristicRecover({
    failedStep: steps[1],
    errorText: 'npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE could not resolve\nnpm ERR! While resolving: react-scripts@5.0.1\nnpm ERR! Conflicting peer dependency: typescript@5.4.2',
    remainingSteps: steps.slice(1),
    completedSteps: [steps[0]],
  });
  assert.equal(result.source, 'local-rules');
  assert.equal(result.matched[0].id, 'eresolve-peer');
  assert.match(result.diagnosis, /incompatible versions/);
  assert.ok(result.correctedSteps.some((entry) => entry.id === 'peer-install'));
  const commands = result.correctedSteps.map((entry) => (entry.command || '').trim()).filter(Boolean);
  assert.equal(commands.length, new Set(commands).size, 'the same fix is never listed twice');
  assert.ok(result.correctedSteps.some((entry) => entry.id === 'dependencies' && entry.key === 'dependencies'), 'the failed step is retried under its original key');
  const revised = applyRevision(steps, { ...result, revision: 2 }, 'dependencies');
  assert.equal(revised.steps[0].id, 'clone', 'the completed clone step is untouched');
});

test('an unknown error still produces a usable next move, never a dead end', () => {
  const result = heuristicRecover({ failedStep: { id: 'run', title: 'Start the dev server', command: 'npm run dev' }, errorText: 'something odd happened, exit code 7', remainingSteps: [], completedSteps: [] });
  assert.equal(result.confidence, 'low');
  assert.match(result.diagnosis, /does not match/);
  assert.ok(result.correctedSteps.some((entry) => entry.id === 'repro-capture'));
  assert.ok(result.followUps.length >= 1);
});

test('each recovery rule ships commands and stays shell-shaped', () => {
  const samples = {
    EACCES: 'npm ERR! code EACCES permission denied',
    gyp: 'gyp ERR! build error node-gyp rebuild failed',
    port: 'Error: listen EADDRINUSE: address already in use :::3000',
    module: 'Error: Cannot find module "express"',
    docker: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
    pep: 'error: externally-managed-environment This environment is externally managed',
    db: 'connect ECONNREFUSED 127.0.0.1:5432',
    heap: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
    shell: '"cp" is not recognized as the name of a cmdlet',
    git: 'fatal: Permission denied (publickey)',
    script: 'npm ERR! missing script: start',
    tls: 'self-signed certificate in certificate chain',
  };
  for (const [name, text] of Object.entries(samples)) {
    const result = heuristicRecover({ failedStep: { id: 'dependencies', title: 'Install', command: 'npm install' }, errorText: text, remainingSteps: [], completedSteps: [] });
    assert.notEqual(result.confidence, 'low', `${name} should match a known signature`);
    assert.ok(result.correctedSteps.length >= 1, `${name} must produce corrective steps`);
    assert.ok(result.correctedSteps.every((entry) => entry.title && entry.id), `${name} steps need ids and titles`);
  }
});
