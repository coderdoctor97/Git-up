// ---------------------------------------------------------------------------
// Feature 3 — Multi-path install graph
//
// A repository rarely has one install path. This module derives a small
// decision graph (method / platform / scope / target) from real evidence in the
// tree, and attaches the alternative steps to each option. The browser then
// re-composes the visible path through public/path-engine.js on every click —
// no round trip, no regenerated list.
//
// Feature 2 hooks in here too: `patchStepsForFailures` writes the ranked
// failure signatures back into the steps, so the happy path is pre-empted.
// ---------------------------------------------------------------------------

const lowerName = (file) => String(file.path || '').toLowerCase().split('/').pop();

function readFile(files, name) {
  return files.find((file) => lowerName(file) === name)?.content || '';
}

function step(input) {
  return { id: input.id, title: input.title, command: input.command || '', detail: input.detail || '', origin: 'graph', ...input };
}

/** Node/npm vs pnpm vs yarn — used so graph steps match the project's manager. */
function installCommand(packageManager) {
  if (packageManager === 'pnpm') return 'pnpm install';
  if (packageManager === 'yarn') return 'yarn install';
  if (packageManager === 'bun') return 'bun install';
  return 'npm install';
}

/** Docker or compose path, whichever the repo actually ships. */
function dockerCommands(files, repo) {
  const names = new Set(files.map(lowerName));
  if (names.has('docker-compose.yml') || names.has('docker-compose.yaml')) {
    return { up: 'docker compose up -d --build', down: 'docker compose down', logs: 'docker compose logs -f', kind: 'compose' };
  }
  return { up: `docker build -t ${repo.repo.toLowerCase()} .\ndocker run --rm -p 3000:3000 ${repo.repo.toLowerCase()}`, down: `docker stop ${repo.repo.toLowerCase()}`, logs: 'docker logs -f ' + repo.repo.toLowerCase(), kind: 'image' };
}

export function buildPathGraph({ repo, metadata, files, packageManager, scripts, failureScan }) {
  const names = new Set(files.map(lowerName));
  const hasDocker = names.has('dockerfile') || names.has('docker-compose.yml') || names.has('docker-compose.yaml');
  const hasEnv = names.has('.env.example') || names.has('.env.sample');
  const isNode = names.has('package.json');
  const hasPython = names.has('requirements.txt') || names.has('pyproject.toml') || names.has('setup.py');
  const hasDb = /postgres|mysql|redis|mongo|prisma|drizzle|alembic|flyway/i.test(files.map((file) => file.path).join('\n'));
  const scriptsPresent = new Set(Object.keys(scripts || {}));
  const failureIds = new Set((failureScan?.patterns || []).map((pattern) => pattern.id));
  const axes = [];

  // --- Axis 1: container or native ------------------------------------------
  if (hasDocker) {
    const docker = dockerCommands(files, repo);
    axes.push({
      id: 'method',
      label: 'Install method',
      prompt: 'Container or on your machine?',
      detail: 'The repository ships a container definition, so a second path exists.',
      options: [
        {
          id: 'native',
          label: 'Native',
          detail: 'Install the toolchain and dependencies directly. Faster to edit and debug.',
          evidence: hasPython ? 'python manifest present' : 'package manifest present',
          default: true,
          removes: ['docker'],
        },
        {
          id: 'docker',
          label: 'Docker',
          detail: 'Nothing installed on your machine except Docker. Uses the repo’s own image.',
          evidence: docker.kind === 'compose' ? 'compose file found' : 'Dockerfile found',
          tradeoff: 'Code edits need a rebuild; ports must be free on your host.',
          removes: ['dependencies', 'env', 'build', 'run', 'dev', 'database'],
          adds: [
            step({ id: 'docker', title: 'Start the container path', command: docker.up, detail: `Use the repository’s ${docker.kind === 'compose' ? 'compose file' : 'Dockerfile'} so services match its assumptions.`, verify: docker.logs, order: 20 }),
            step({ id: 'docker-verify', title: 'Confirm the container answers', command: docker.logs, detail: 'Watch the startup lines until it reports a listening port.', order: 76 }),
          ],
        },
      ],
    });
  }

  // --- Axis 2: platform ------------------------------------------------------
  axes.push({
    id: 'os',
    label: 'Your platform',
    prompt: 'Which machine are you on?',
    detail: 'Shell syntax and build tools differ enough to break the same step on three machines.',
    options: [
      {
        id: 'macos',
        label: 'macOS',
        detail: 'Apple Silicon and Intel both covered; native modules may need the Xcode tools.',
        default: true,
        adds: failureIds.has('native-build')
          ? [step({ id: 'toolchain', title: 'Install the compiler tools first', command: 'xcode-select --install', detail: 'A dependency compiles native code, and that needs the command line tools before the install step can finish.', when: { os: 'macos' }, order: 12 })]
          : [],
      },
      {
        id: 'linux',
        label: 'Linux',
        detail: 'Assumes a POSIX shell and build-essential available through your distro.',
        adds: failureIds.has('native-build')
          ? [step({ id: 'toolchain', title: 'Install build tools', command: 'sudo apt-get update && sudo apt-get install -y build-essential python3', detail: 'Needed by native modules on Debian-family systems.', when: { os: 'linux' }, order: 12 })]
          : [],
      },
      {
        id: 'windows',
        label: 'Windows',
        detail: 'Most breakage here is shell syntax, not the project itself.',
        warning: 'Windows users: run these in Git Bash or WSL. `cp`, `export`, and `source` are not PowerShell commands.',
        adds: [
          step({ id: 'env-windows', title: 'Create your environment file (PowerShell syntax)', command: hasEnv ? 'Copy-Item .env.example .env' : 'New-Item -ItemType File .env', detail: 'Windows has no `cp`, so the copy step needs the PowerShell spelling.', when: { os: 'windows' }, order: 34 }),
          ...(failureIds.has('native-build') ? [step({ id: 'toolchain', title: 'Install Visual Studio Build Tools', command: 'winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools"', detail: 'node-gyp needs the MSVC workload for native modules on Windows.', when: { os: 'windows' }, order: 12 })] : []),
        ],
        removes: hasEnv ? ['env'] : [],
      },
    ],
  });

  // --- Axis 3: scope ---------------------------------------------------------
  if (isNode || hasPython) {
    axes.push({
      id: 'profile',
      label: 'Scope',
      prompt: 'Just make it run, or work inside it?',
      detail: 'Optional tooling is the part of most READMEs you can safely skip.',
      options: [
        {
          id: 'minimal',
          label: 'Minimal',
          detail: 'Only what is required to see the app run. Fewer moving parts, fewer failures.',
          removes: ['lint', 'test', 'seed', 'database', 'build'].filter((id) => !scriptsPresent.has(id) || id === 'build'),
          adds: [],
        },
        {
          id: 'full',
          label: 'Full workspace',
          default: true,
          detail: 'Adds the checks and fixtures a contributor needs: tests, lint, and local data if the repo seeds it.',
          adds: [
            ...(hasDb ? [step({ id: 'database', title: 'Start the local data services', command: 'docker compose up -d db redis 2>/dev/null || docker compose up -d', detail: 'The code expects a database on localhost; nothing in the tree starts it for you.', order: 30 })] : []),
            ...(scriptsPresent.has('test') ? [step({ id: 'test', title: 'Run the test suite', command: `${packageManager === 'pnpm' ? 'pnpm' : packageManager === 'yarn' ? 'yarn' : packageManager === 'bun' ? 'bun' : 'npm'} ${packageManager === 'yarn' ? '' : 'run '}test`.trim(), detail: 'Proves the install is genuinely healthy rather than merely started.', order: 70 })] : []),
            ...(scriptsPresent.has('lint') ? [step({ id: 'lint', title: 'Run the linter', command: `${packageManager === 'yarn' ? 'yarn' : 'npm run'} lint`, detail: 'Optional, but it catches a misconfigured toolchain early.', order: 72 })] : []),
          ],
        },
      ],
    });
  }

  // --- Axis 4: target --------------------------------------------------------
  if (scriptsPresent.has('dev') || scriptsPresent.has('start') || scriptsPresent.has('build')) {
    axes.push({
      id: 'usage',
      label: 'Target',
      prompt: 'Development or production behaviour?',
      detail: 'Same code, different start command and different failure modes.',
      options: [
        {
          id: 'dev',
          label: 'Development',
          default: true,
          detail: 'Live reload, stack traces, no optimisation. The right choice while you are getting it running.',
          adds: scriptsPresent.has('dev') ? [step({ id: 'dev', title: 'Start the dev server', command: `${packageManager === 'yarn' ? 'yarn' : packageManager === 'pnpm' ? 'pnpm' : packageManager === 'bun' ? 'bun' : 'npm run'} dev`, detail: 'Watch the terminal for the local URL it prints.', verify: 'curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000', order: 65 })] : [],
          removes: scriptsPresent.has('dev') ? ['run'] : [],
        },
        {
          id: 'prod',
          label: 'Production',
          detail: 'Builds first, then serves the compiled output. Slower to install, closer to a real deployment.',
          adds: [
            ...(scriptsPresent.has('build') ? [step({ id: 'build-prod', title: 'Build for production', command: `${packageManager === 'yarn' ? 'yarn' : 'npm run'} build`, detail: 'Fails loudly on anything the dev server would have hidden.', when: { usage: 'prod' }, order: 50 })] : []),
            step({ id: 'run-prod', title: 'Serve the built output', command: scriptsPresent.has('start') ? `${packageManager === 'yarn' ? 'yarn' : 'npm start'}` : `${packageManager === 'yarn' ? 'yarn' : 'npm run'} start`, detail: 'Serves the build directory; set NODE_ENV the way the project expects.', when: { usage: 'prod' }, order: 66 }),
          ],
          removes: ['dev', 'run'],
        },
      ],
    });
  }

  const defaults = {};
  for (const axis of axes) defaults[axis.id] = (axis.options.find((option) => option.default) || axis.options[0])?.id;
  for (const axis of axes) for (const option of axis.options) delete option.default;

  return {
    axes,
    defaults,
    note: axes.length
      ? `${axes.length} decision${axes.length === 1 ? '' : 's'} derived from the repository — the list below follows the highlighted branch.`
      : 'No meaningful variants found in this repository, so a single path is shown.',
  };
}

/**
 * Feature 2 → feature 1 bridge: write the ranked failure points into the steps
 * that would otherwise hit them, so the base path arrives pre-patched.
 */
export function patchStepsForFailures(steps = [], failureScan = {}) {
  const patches = [];
  if (!failureScan?.patterns?.length) return { steps, patches };
  const next = steps.map((entry) => ({ ...entry }));
  const byId = new Map(next.map((entry, index) => [String(entry.id), index]));

  for (const pattern of failureScan.patterns) {
    const target = pattern.patchStepId !== undefined ? byId.get(String(pattern.patchStepId)) : undefined;
    const prefix = pattern.origin === 'reported' ? `Seen in ${pattern.count} reported thread${pattern.count === 1 ? '' : 's'}` : 'Inferred for this repository shape';
    if (target === undefined) {
      const inserted = step({
        id: `guard-${pattern.id}`,
        title: `Guard: ${pattern.label}`,
        command: (pattern.commands || []).join('\n'),
        detail: `${prefix}. This path has no step that covers it, so it is listed after the app starts — expect to need it if the run output points at a missing service. ${pattern.why}`,
        patchedFor: [pattern.id],
        order: 100,
      });
      const maxOrder = next.reduce((max, entry) => Math.max(max, Number(entry.order) || 0), 0);
      inserted.order = maxOrder + 1;
      next.push(inserted);
      patches.push({ failureId: pattern.id, stepId: inserted.id, mode: 'added-step', origin: pattern.origin, count: pattern.count });
      continue;
    }
    const existing = next[target];
    existing.patchedFor = [...new Set([...(existing.patchedFor || []), pattern.id])];
    existing.guard = `${prefix}: ${pattern.why}`;
    if (pattern.commands?.length) {
      const check = pattern.commands[0];
      if (check && !String(existing.command || '').includes(check)) {
        existing.command = `${check}\n${existing.command || ''}`.trim();
        existing.prepended = check;
      }
    }
    patches.push({ failureId: pattern.id, stepId: existing.id, mode: existing.prepended ? 'prepended-command' : 'annotated', origin: pattern.origin, count: pattern.count });
  }

  return { steps: next, patches };
}
