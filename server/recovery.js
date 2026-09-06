// ---------------------------------------------------------------------------
// Feature 1 — Living install path: recovery pass
//
// When a step fails, the user says “this failed” and pastes the terminal
// output. This module turns that into a *corrected path* rather than a fresh
// generic guide:
//
//   · `heuristicRecover` matches the error against a signature table and
//     produces concrete corrective steps with no model and no network call.
//   · `aiRecover` does the same with the user's provider, over the real
//     remaining steps, and is told to reuse step ids so checkmarks survive.
//
// Completed steps are never rewritten; only the failing step and what follows
// it are replaced, and the previous path is kept for the revision trail.
// ---------------------------------------------------------------------------

import { FAILURE_SIGNATURES } from './failures.js';

/** High-signal error text → what to actually do. Ordered by specificity. */
const RECOVERY_RULES = [
  {
    id: 'eacces-permissions',
    test: /EACCES|permission denied|EPERM|insufficient privilege/i,
    diagnosis: 'The installer tried to write somewhere your user does not own, so it stopped mid-way.',
    steps: [
      { id: 'perm-scope', title: 'Point the package cache at your home directory', command: 'npm config set cache ~/.npm-cache\nnpm config set prefix ~/.npm-global', detail: 'Replaces the system-owned write target with a path you own, which is what EACCES is telling you about.' },
      { id: 'perm-retry', title: 'Re-run the install without sudo', command: 'npm install', detail: 'Never reach for sudo here — it leaves root-owned files in node_modules that break the next three installs.' },
    ],
    checks: ['npm config get cache', 'test -w "$(npm config get cache)" && echo writable'],
  },
  {
    id: 'eresolve-peer',
    test: /ERESOLVE|could not resolve dependency tree|conflicting peer dependency|peer\s+\S+@\d/i,
    diagnosis: 'Two packages in the manifest demand incompatible versions of the same dependency, so npm refuses to pick one.',
    steps: [
      { id: 'peer-inspect', title: 'See which package is asking for what', command: 'npm ls --all 2>/dev/null | head -40\nnpm install --dry-run 2>&1 | grep -i peer | head -12', detail: 'Identifies the conflicting pair before you change anything, so you know whose range is stale.' },
      { id: 'peer-install', title: 'Install while accepting the older peer', command: 'npm install --legacy-peer-deps', detail: 'Safest first attempt for a project that predates stricter resolution. If it works, leave it — do not also force overrides.' },
      { id: 'peer-lockfile', title: 'If that fails, trust the committed lockfile instead', command: 'npm ci', detail: 'The lockfile already resolved this once. `npm ci` installs exactly that tree and ignores live range conflicts.' },
    ],
    checks: ['npm ls <conflicting-package>'],
  },
  {
    id: 'node-gyp-native',
    test: /node-gyp|gyp ERR|gyp verb|prebuilt package|make.*failed|No usable version of libssl|MSVC|Visual Studio|command line tools are not installed/i,
    diagnosis: 'A dependency compiles native code during install, and your machine is missing the compiler toolchain it expects.',
    steps: [
      { id: 'gyp-toolchain', title: 'Install the build toolchain for your platform', command: '# macOS\nxcode-select --install\n# Debian / Ubuntu\nsudo apt-get install -y build-essential python3\n# Windows: install "Desktop development with C++" from the Build Tools', detail: 'node-gyp shells out to a real compiler; there is no npm flag that substitutes for it.' },
      { id: 'gyp-python', title: 'Make sure a Python 3 is visible', command: 'python3 --version\nnpm config set python "$(which python3)"', detail: 'node-gyp still looks for python by name, and fails on machines that only ship python3.' },
      { id: 'gyp-retry', title: 'Retry the install', command: 'rm -rf node_modules package-lock.json && npm install', detail: 'Clears the half-written tree from the failed attempt before rebuilding it.' },
    ],
    checks: ['which cc && which python3'],
  },
  {
    id: 'enoent-node',
    test: /env: node: No such file|command not found: node|node: command not found|not found: npm|npx: command not found/i,
    diagnosis: 'Node is either not installed or not on the PATH the shell the command runs in.',
    steps: [
      { id: 'node-check', title: 'Find out whether Node exists at all', command: 'which -a node || echo "not on PATH"\nnode --version 2>/dev/null || echo "no node"', detail: 'Distinguishes "not installed" from "installed but hidden from this shell".' },
      { id: 'node-install', title: 'Install a version manager and pick the project’s version', command: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\nnvm install --lts\nnvm use --lts', detail: 'A version manager means the next project that needs a different Node does not break this one.' },
    ],
    checks: ['node --version', 'npm --version'],
  },
  {
    id: 'engine-too-old',
    test: /EBADENGINE|requires node.*[><=]|Unsupported engine|engine\s*\{?[^}]*node/i,
    diagnosis: 'The project declares a Node range your current runtime falls outside of.',
    steps: [
      { id: 'engine-read', title: 'Read the exact range the project wants', command: 'grep -A3 \'\"engines\"\' package.json 2>/dev/null || grep -A3 -i "node" package.json', detail: 'Shows the constraint instead of guessing a version that "seems recent".' },
      { id: 'engine-switch', title: 'Switch to a matching runtime', command: 'nvm install 22 && nvm use 22', detail: 'Switching the runtime is reversible and touches nothing in the repository.' },
    ],
    checks: ['node --version'],
  },
  {
    id: 'port-in-use',
    test: /EADDRINUSE|address already in use|port.{0,12}(already in use|is in use|busy)/i,
    diagnosis: 'Something already owns the port this app wants, usually an earlier run of the same server that never exited.',
    steps: [
      { id: 'port-find', title: 'Identify what is holding the port', command: 'lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null || netstat -ano | grep ":3000"', detail: 'Confirms it is your own leftover process before killing anything.' },
      { id: 'port-free', title: 'Move your app to a free port', command: 'PORT=3001 npm run dev', detail: 'Prefer a new port over killing an unknown process — the squatter may be another project you still need.' },
    ],
    checks: ['curl -sS -o /dev/null -w "%{http_code}" http://localhost:3001'],
  },
  {
    id: 'missing-module',
    test: /Cannot find module|Module not found|ModuleNotFoundError|No module named|ImportError:\s+cannot import name/i,
    diagnosis: 'The code is importing something that was never installed into the environment it is running from.',
    steps: [
      { id: 'module-dir', title: 'Confirm you are in the project root', command: 'pwd\nls package.json pyproject.toml 2>/dev/null', detail: 'Most "module not found" errors are the wrong directory, not a wrong version.' },
      { id: 'module-install', title: 'Install into the environment you are actually running', command: '# Node\nnpm install\n# Python — activate the venv first\nsource .venv/bin/activate && pip install -e .', detail: 'Installing while a different interpreter is active is the usual cause: the package lands somewhere the app cannot see.' },
    ],
    checks: ['node -e "require(\'<package-name>\')" || echo missing', 'python -c "import <package_name>" || echo missing'],
  },
  {
    id: 'pep668-externally-managed',
    test: /externally-managed-environment|externally managed|--break-system-packages/i,
    diagnosis: 'Your distribution protects its system Python, so `pip install` refuses to write to it.',
    steps: [
      { id: 'venv-create', title: 'Create and enter a project virtual environment', command: 'python3 -m venv .venv\nsource .venv/bin/activate', detail: 'This is the supported answer — it keeps the project’s packages out of system site-packages.' },
      { id: 'venv-install', title: 'Install the dependencies inside it', command: 'pip install -r requirements.txt', detail: 'Re-run only after the prompt shows `(.venv)`.' },
    ],
    checks: ['python -c "import sys; print(sys.prefix)"'],
  },
  {
    id: 'env-var-missing',
    test: /missing (required )?(environment )?(variable|env var|api key)|undefined is not.{0,20}(key|token|secret)|No such file.{0,10}\.env|dotenv|key must be provided|Invalid (api|access) key/i,
    diagnosis: 'The app read a configuration value that does not exist yet, and it failed rather than asking you for it.',
    steps: [
      { id: 'env-scaffold', title: 'Create the env file from the template', command: 'cp -n .env.example .env 2>/dev/null || touch .env', detail: 'Never hand-write the filename list from a blog post; the template is the project’s own truth.' },
      { id: 'env-fill', title: 'Fill only the empty values, then re-check', command: 'grep -vE "^\\s*(#|$)" .env | awk -F= \'$2==""{print $1}\'', detail: 'Prints exactly which keys are still blank, so the next failure is about a real secret and not a typo.' },
    ],
    checks: ['test -f .env && echo present'],
  },
  {
    id: 'db-connection',
    test: /ECONNREFUSED.{0,20}(5432|3306|6379|27017)|connection (refused|rejected|timeout).{0,40}(database|db)|P1001|P1000|could not connect to server|FATAL:.*password|relation .* does not exist|OpenerError|redis.*(refused|unreachable)/i,
    diagnosis: 'The app reached for a database that is not running, not reachable at that host, or not migrated yet.',
    steps: [
      { id: 'db-start', title: 'Start the database service the repo defines', command: 'docker compose up -d db 2>/dev/null || docker compose up -d', detail: 'Uses the compose file already in the tree instead of installing a separate server.' },
      { id: 'db-migrate', title: 'Create the schema before first run', command: 'npx prisma migrate dev 2>/dev/null || npm run migrate 2>/dev/null || python manage.py migrate 2>/dev/null || alembic upgrade head', detail: '“relation does not exist” means the connection worked but the tables never did.' },
      { id: 'db-url', title: 'Re-check the connection string against the real port', command: 'grep -n "DATABASE_URL" .env', detail: 'A URL pointing at 5433 while compose published 5432 is one character of failure.' },
    ],
    checks: ['pg_isready -h localhost -p 5432 || nc -z localhost 5432 && echo open'],
  },
  {
    id: 'registry-network',
    test: /ETIMEDOUT|ENOTFOUND|ECONNRESET|self.?signed|unable to verify the first certificate|ERR_TLS_CERT_ALTNAME|proxy|403.{0,30}(registry|forbidden)|Failed to fetch|network error|integrity check failed|EINTEGRITY/i,
    diagnosis: 'The package download itself never completed — registry unreachable, a TLS-intercepting proxy, or a checksum mismatch.',
    steps: [
      { id: 'net-registry', title: 'Check which registry you are actually pointed at', command: 'npm config get registry\ncurl -sS -o /dev/null -w "%{http_code}\\n" https://registry.npmjs.org/express', detail: 'A stale corporate mirror causes EINTEGRITY and ENOTFOUND in equal measure.' },
      { id: 'net-cache', title: 'Clear a half-written cache entry', command: 'npm cache verify || npm cache clean --force', detail: 'EINTEGRITY specifically means the cached tarball hash did not match.' },
      { id: 'net-proxy', title: 'If you are behind a proxy, declare it', command: 'npm config set proxy "$HTTPS_PROXY"\nnpm config set https-proxy "$HTTPS_PROXY"', detail: 'npm does not always inherit shell proxy variables the way curl does.' },
    ],
    checks: ['curl -sSI https://registry.npmjs.org/ | head -1'],
  },
  {
    id: 'docker-daemon',
    test: /Cannot connect to the Docker daemon|docker:.*daemon is not running|failed to connect to the docker API|npipe.{0,20}docker_engine|docker: command not found|no such image|manifest unknown/i,
    diagnosis: 'Docker is either not installed, not running, or the image tag in the file does not exist publicly.',
    steps: [
      { id: 'dk-daemon', title: 'Start the Docker engine', command: 'open -a Docker || sudo systemctl start docker\n# then confirm:\ndocker info | head -5', detail: 'On macOS the daemon only exists while the desktop app is running.' },
      { id: 'dk-pull', title: 'Pull the base image explicitly', command: 'docker compose pull --policy missing 2>/dev/null || docker compose pull', detail: 'Surfaces a bad image tag as a pull error now instead of a build failure later.' },
      { id: 'dk-rebuild', title: 'Rebuild without cache', command: 'docker compose build --no-cache && docker compose up -d', detail: 'A stale layer is the usual cause when the same file worked for someone else.' },
    ],
    checks: ['docker ps --format "{{.Names}}\\t{{.Status}}"'],
  },
  {
    id: 'shell-syntax',
    test: /is not recognized (?:as the|an) name of a cmdlet|CRLF|line endings|bash\r|`\$`|pwsh|exec format error|exec: "?:|syntax error near unexpected token/i,
    diagnosis: 'The command was written for a different shell — copy-pasting POSIX syntax into PowerShell (or CRLF into bash) fails before the app ever starts.',
    steps: [
      { id: 'shell-powershell', title: 'Use the PowerShell spellings', command: 'Copy-Item .env.example .env\n$env:PORT=3000\nnpm run dev', detail: 'PowerShell has no `cp`, no `export`, and no `source` — the guide’s other commands are fine as-is.' },
      { id: 'shell-crlf', title: 'Fix CRLF in shell scripts before running them', command: 'git config core.autocrlf input\ngit add --renormalize .', detail: 'Stops Git rewriting line endings out from under a `#!/usr/bin/env bash` script.' },
    ],
    checks: ['file -i scripts/*.sh 2>/dev/null | grep -i crlf || echo "no CRLF"'],
  },
  {
    id: 'heap-memory',
    test: /heap out of memory|JavaScript heap|ENOMEM|out of memory|killed process|No space left on device/i,
    diagnosis: 'The install or build exhausted memory or disk before finishing.',
    steps: [
      { id: 'mem-raise', title: 'Raise the heap limit for the failing command', command: 'NODE_OPTIONS=--max-old-space-size=8192 npm run build', detail: 'Builds of large dependency graphs commonly exceed the default heap on 16GB machines.' },
      { id: 'mem-space', title: 'Free the disk the temp files land on', command: 'df -h . | tail -1 && npm cache clean --force', detail: 'ENOSPC during install is about disk, not RAM, and reads deceptively like either.' },
    ],
    checks: ['df -h . | tail -1'],
  },
  {
    id: 'git-clone-fail',
    test: /Repository not found|fatal: could not read Username|authentication failed|Permission denied \(publickey\)|SSL: CERTIFICATE|gnutls|unable to access|HTTP.?2 error/i,
    diagnosis: 'Git could not fetch the repository at all — usually an SSH key the machine does not have, or a proxy interrupting TLS.',
    steps: [
      { id: 'clone-https', title: 'Retry over HTTPS instead of SSH', command: 'git clone https://github.com/OWNER/REPO.git\n# or rewrite every future URL:\ngit config --global url."https://github.com/".insteadOf "ssh://git@github.com/"', detail: 'A public repo needs no credentials, which sidesteps the key entirely.' },
      { id: 'clone-ssh', title: 'If you want SSH, test the key directly', command: 'ssh -T git@github.com', detail: 'Prints the real reason (no key, wrong key, agent not loaded) in one line.' },
    ],
    checks: ['git ls-remote https://github.com/OWNER/REPO.git HEAD >/dev/null && echo reachable'],
  },
  {
    id: 'script-missing',
    test: /missing script|no script named|npm err\! missing|LifecycleScript|script not found|Command "dev" not found|Unknown command/i,
    diagnosis: 'The documented script name does not exist in this version of the project — README drift, not your mistake.',
    steps: [
      { id: 'script-list', title: 'List the scripts this checkout actually has', command: 'node -e "console.log(Object.keys(require(\'./package.json\').scripts).join(\'\\n\'))"', detail: 'Reads the file in front of you rather than the one the README was written against.' },
      { id: 'script-pick', title: 'Run the closest real entry point', command: 'npm start || npm run serve || npm run preview', detail: 'Most projects renamed `dev` to `start` at some point; the app is unchanged.' },
    ],
    checks: ['npm run'],
  },
  {
    id: 'lockfile-missing-ci',
    test: /npm ci can only install|can only install with an existing package-lock|The `npm ci` command can only install/i,
    diagnosis: '`npm ci` was used but no lockfile exists in this checkout, so the strict installer has nothing to install from.',
    steps: [
      { id: 'ci-to-install', title: 'Use a resolving install first', command: 'npm install', detail: 'Generates the lockfile. Switch back to `npm ci` once one exists.' },
    ],
    checks: ['test -f package-lock.json && echo lockfile-created'],
  },
  {
    id: 'permission-script-sandbox',
    test: /This command has to be run with sudo|npm error could not determine executable|EPASSWD|operation not permitted|sandbox/i,
    diagnosis: 'A required helper is blocked by your OS security policy rather than by the project.',
    steps: [
      { id: 'sandbox-allow', title: 'Allow the binary, then retry', command: 'xattr -d com.apple.quarantine "$(which node)" 2>/dev/null; spctl --status', detail: 'macOS quarantine attributes on a downloaded toolchain are a common cause of operation-not-permitted.' },
    ],
    checks: ['spctl --status'],
  },
];

function matchRules(errorText) {
  const text = String(errorText || '');
  const scored = [];
  for (const rule of RECOVERY_RULES) {
    const match = text.match(rule.test);
    if (match) scored.push({ rule, hit: match[0] || '', strength: (match[0] || '').length });
  }
  for (const signature of FAILURE_SIGNATURES) {
    if (RECOVERY_RULES.some((rule) => rule.id === signature.id)) continue;
    const match = text.match(signature.test);
    if (match) scored.push({ rule: { id: signature.id, diagnosis: signature.why, steps: (signature.fix || []).map((command, index) => ({ id: `${signature.id}-fix-${index + 1}`, title: `Apply the ${signature.label.toLowerCase()} fix`, command, detail: index === 0 ? 'Taken directly from the pattern that matches your error.' : 'Remaining commands from the same fix.' })) , checks: [] }, hit: match[0] || '', strength: (match[0] || '').length * 0.6 });
  }
  return scored.sort((a, b) => b.strength - a.strength);
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}

/** Deterministic recovery: no model, no network, works with a raw paste. */
export function heuristicRecover({ failedStep, errorText, remainingSteps = [], completedSteps = [] }) {
  const scored = matchRules(errorText);
  const completedIds = new Set(completedSteps.map((entry) => String(entry.id)));
  if (!scored.length) {
    const first = remainingSteps[0] || failedStep;
    return {
      source: 'local-rules',
      confidence: 'low',
      matched: [],
      diagnosis: 'That output does not match any of the installation failures Git-Up knows, so it is being handled generically: reproduce it with more detail, then narrow.',
      correctedSteps: [
        { id: 'repro-capture', title: 'Capture the full error, not the tail', command: `${failedStep?.command || 'npm install'} 2>&1 | tee git-up-error.log`, detail: 'A full log makes the difference between guessing and reading. Keep it local — never paste whole logs into a public issue.', key: 'repro-capture', order: 5 },
        { id: 'repro-clean', title: 'Rule out a half-written tree', command: 'rm -rf node_modules .venv && git checkout -- . 2>/dev/null; true', detail: 'Removes state from the failed attempt so a retry tests the real path, not a broken leftover.', key: 'repro-clean', order: 6 },
        ...(first ? [{ ...first, id: first.id, key: first.key || first.id, order: (first.order ?? 10) + 1, revision: 2, detail: `Retry “${first.title}” on a clean tree. ${first.detail || ''}`.trim() }] : []),
      ],
      checks: ['echo "Paste git-up-error.log into the next attempt for a matching fix."'],
      note: `No known signature matched. ${completedIds.size} completed step${completedIds.size === 1 ? '' : 's'} were left untouched.`,
      followUps: ['What was the last line before the error?', 'Did this ever install successfully on this machine?'],
    };
  }

  const [primary, secondary] = scored;
  const corrected = [];
  const usedLines = new Set();
  let order = 5;
  // Two signatures routinely recommend the same fix, and a rule often states it
  // as one multi-line block. Compare at line level so a path never repeats
  // `source .venv/bin/activate` just because another step wrote it inline.
  const alreadyCovered = (command) => {
    const lines = String(command || '').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    if (!lines.length) return false;
    return lines.every((line) => usedLines.has(line));
  };
  const addAll = (rule, origin) => {
    for (const entry of rule.steps || []) {
      const command = String(entry.command || '').trim();
      if (command && alreadyCovered(command)) continue;
      for (const line of command.split('\n').map((line) => line.trim()).filter(Boolean)) usedLines.add(line);
      corrected.push({ ...entry, id: `${origin === 'secondary' ? 'also-' : ''}${entry.id}`, key: `${origin === 'secondary' ? 'also-' : ''}${entry.id}`, detail: entry.detail, order: order++, revision: 2, fixFor: [rule.id], fixOrigin: origin });
    }
  };
  addAll(primary.rule, 'primary');
  if (secondary && secondary.rule.id !== primary.rule.id) addAll(secondary.rule, 'secondary');

  const retryStep = failedStep ? { ...failedStep, key: failedStep.key || failedStep.id, id: failedStep.id, order: order, revision: 2, detail: `Retried after the correction above. ${failedStep.detail || ''}`.trim(), retryOf: failedStep.id } : null;
  if (retryStep) corrected.push(retryStep);
  order += 1;
  for (const entry of remainingSteps.slice(1)) {
    corrected.push({ ...entry, key: entry.key || entry.id, order: order++ });
  }

  return {
    source: 'local-rules',
    confidence: primary.strength > 24 && !secondary ? 'high' : secondary ? 'medium' : 'medium',
    matched: [{ id: primary.rule.id, label: primary.rule.label || primary.rule.id, hit: primary.hit }, secondary ? { id: secondary.rule.id, label: secondary.rule.label || secondary.rule.id, hit: secondary.hit } : null].filter(Boolean),
    diagnosis: primary.rule.diagnosis,
    secondSuspect: secondary ? `${secondary.rule.diagnosis} (matched “${secondary.hit}” as well — worth ruling out if the first fix does not land.)` : '',
    correctedSteps: corrected,
    checks: [...new Set([...(primary.rule.checks || []), ...(secondary?.rule?.checks || [])])].slice(0, 3),
    note: 'Corrected path built locally from the error text. Connect an AI provider for a repository-aware diagnosis of the same output.',
    followUps: [
      `Did “${primary.rule.steps?.[0]?.title || 'the first corrective step'}” change the output?`,
      'Does the same command fail the second time from a fresh clone?',
    ],
  };
}

function aiPrompt({ repo, metadata, files, failedStep, errorText, remainingSteps, completedSteps, requirements, expertise, failureScan }) {
  const context = {
    repository: repo.canonicalUrl,
    language: metadata?.language,
    branch: metadata?.default_branch,
    declaredRequirements: requirements || [],
    knownFailureSignatures: (failureScan?.patterns || []).slice(0, 4).map((pattern) => `${pattern.label}${pattern.origin === 'reported' ? ` (${pattern.count} reported)` : ' (inferred)'}`),
    completedSteps: completedSteps.map((entry) => entry.title),
    failedStep: { id: failedStep.id, title: failedStep.title, command: failedStep.command, detail: failedStep.detail },
    remainingSteps: remainingSteps.map((entry) => ({ id: entry.id, title: entry.title, command: entry.command })),
    scannedFiles: files.map((file) => file.path).slice(0, 24),
    fileExcerpts: files.slice(0, 8).map((file) => `--- ${file.path}\n${truncate(file.content, 2600)}`).join('\n'),
  };
  const depth = expertise === 'novice'
    ? 'The reader is new to this project. Each corrected step needs a plain-language why, one sentence, no jargon, and tell them what a successful run looks like.'
    : expertise === 'expert'
      ? 'The reader is experienced. No encouragement, no background. One short clause of reasoning at most per step.'
      : 'The reader has used similar tools. Keep each step to a single sentence of reasoning.';
  return [
    'You are Git-Up, a senior engineer debugging an installation live with someone. A step in a guide you produced failed.',
    'Return ONLY valid JSON. No markdown, no commentary.',
    '',
    'JSON schema:',
    '{"diagnosis":"what is actually wrong, 1-3 sentences, specific to this error","correctedSteps":[{"id":"reuse-existing-id-if-the-step-survives","title":"string","command":"exact shell command or empty string","detail":"what to do and why","confidence":"high|medium|low"}],"checks":["terminal command that proves the fix landed"],"followUps":["question the user should answer next","second question"],"confidence":"high|medium|low"}',
    '',
    'Hard rules:',
    '- Rewrite the failing step and what follows it. Never propose re-running a completed step.',
    '- Reuse the EXACT existing id in `remainingSteps` for any step you keep unchanged, so the user keeps their checkmarks.',
    '- Never invent a package, flag, or env var that is not visible in the context. If a value is unknown, use a placeholder like <package-name> and say so in detail.',
    '- Prefer one corrective step that tests a hypothesis over five that repeat the same install.',
    '- Commands must be safe to paste. No piping secrets, no rm -rf outside the project directory, no sudo unless the failure is provably a permission problem.',
    `- ${depth}`,
    '',
    `USER-REPORTED ERROR:\n${truncate(errorText, 6000)}`,
    '',
    `CONTEXT:\n${JSON.stringify(context, null, 1)}`,
  ].join('\n');
}

export function buildRecoveryAiRequest(input) {
  return {
    messages: [{ role: 'user', content: aiPrompt(input) }],
    options: { temperature: 0.15, max_tokens: 3200 },
  };
}

function parseAiPayload(value) {
  if (value && typeof value === 'object') return value;
  const cleaned = String(value || '').slice(0, 400_000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function aiCall(config, prompt) {
  const base = String(config.baseUrl).trim().replace(/\/+$/, '');
  const endpointValue = String(config.endpoint || '/chat/completions').trim() || '/chat/completions';
  const suffix = /^https?:\/\//i.test(endpointValue) ? null : (endpointValue.startsWith('/') ? endpointValue : `/${endpointValue}`);
  const endpointUrl = suffix === null ? endpointValue : (base.toLowerCase().endsWith(suffix.toLowerCase()) ? base : `${base}${suffix}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let response;
  try {
    response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.15, messages: [{ role: 'user', content: prompt }] }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI provider timed out after 45s. Check the base URL, or retry without AI (the local fix still works).');
    const message = error instanceof Error ? error.message : String(error || '');
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|Load failed/i.test(message)) throw new Error(`AI provider is unreachable (${message || 'network error'}). Check the base URL and that the provider is running, or retry without AI.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`AI provider returned ${response.status}: ${(await response.text()).slice(0, 160)}. Check the base URL, endpoint, model, and key.`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || payload?.content || '';
  return parseAiPayload(text);
}

/**
 * Recovery entry point. The existing Custom API path keeps its local fallback.
 * Browser-provider failures stay explicit so Git-Up never silently changes a
 * user's selected provider.
 */
export async function recoverPath({ config, providerResult, repo, metadata, files, failedStep, errorText, remainingSteps, completedSteps, requirements, expertise, failureScan }) {
  const local = heuristicRecover({ failedStep, errorText, remainingSteps, completedSteps });
  const browserProvider = providerResult !== undefined;
  if (!browserProvider && (!config?.apiKey || !config?.model || !config?.baseUrl)) return local;
  let aiPayload = null;
  let aiError = '';
  if (browserProvider) {
    aiPayload = parseAiPayload(providerResult);
    if (!aiPayload?.correctedSteps?.length) throw new Error('Free AI returned an invalid recovery response. Please retry.');
  } else {
    try {
      aiPayload = await aiCall(config, aiPrompt({ repo, metadata, files, failedStep, errorText, remainingSteps, completedSteps, requirements, expertise, failureScan }));
    } catch (error) {
      aiError = error.message || 'The AI provider could not answer.';
    }
    if (!aiPayload?.correctedSteps?.length) {
      if (aiError) local.note = `AI recovery was unavailable (${aiError.slice(0, 140)}). Applying the local fix instead.`;
      return local;
    }
  }
  const remainingIds = new Set(remainingSteps.map((entry) => String(entry.id)));
  const corrected = aiPayload.correctedSteps.map((entry, index) => ({
    id: String(entry.id || `recover-${index + 1}`),
    key: String(entry.id || `recover-${index + 1}`),
    title: String(entry.title || `Corrected step ${index + 1}`),
    command: String(entry.command || ''),
    detail: String(entry.detail || ''),
    confidence: ['high', 'medium', 'low'].includes(entry.confidence) ? entry.confidence : 'medium',
    keptFromPath: remainingIds.has(String(entry.id || '')),
    order: 5 + index,
    revision: 2,
  }));
  return {
    source: 'ai',
    confidence: ['high', 'medium', 'low'].includes(aiPayload.confidence) ? aiPayload.confidence : 'medium',
    matched: local.matched,
    diagnosis: String(aiPayload.diagnosis || local.diagnosis),
    secondSuspect: local.secondSuspect,
    correctedSteps: corrected,
    checks: Array.isArray(aiPayload.checks) ? aiPayload.checks.map(String).slice(0, 4) : local.checks,
    followUps: Array.isArray(aiPayload.followUps) ? aiPayload.followUps.map(String).slice(0, 3) : local.followUps,
    note: `Corrected from the error text and ${files.length} scanned files. Your ${completedSteps.length} completed step${completedSteps.length === 1 ? '' : 's'} stay as they are.`,
    localFallback: local.correctedSteps.length ? local : null,
  };
}
