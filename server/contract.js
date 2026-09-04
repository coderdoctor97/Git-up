// ---------------------------------------------------------------------------
// Feature 4 — Install Contract
//
// A short, explicit statement of what this install path assumes, changes, and
// requires — written before the user runs anything, and checkable after. It is
// assembled from parsed manifests (not prose), so every claim carries the file
// it came from. The `contractId` is a deterministic digest of the terms: same
// repository state, same number. If the terms change, the id changes.
// ---------------------------------------------------------------------------

const lowerName = (file) => String(file.path || '').toLowerCase().split('/').pop();
const depth = (file) => String(file.path || '').split('/').length;
// A monorepo has many package.json files; the root one is the contract's subject,
// so always read the shallowest match instead of whichever came first.
const read = (files, name) => files.filter((file) => lowerName(file) === name).sort((a, b) => depth(a) - depth(b))[0]?.content || '';
const push = (list, item) => { if (item && !list.some((entry) => entry.name === item.name && entry.required === item.required)) list.push(item); };

/** djb2 → base36, so the id is stable and content-bound without a crypto dep. */
function digest(value) {
  let hash = 5381;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  return hash.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

function firstMatch(text, pattern) {
  return String(text || '').match(pattern)?.[1]?.trim() || '';
}

function parseTomlValue(content, key) {
  const match = String(content || '').match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n]+)`, 'im'));
  return match?.[1]?.trim() || '';
}

export function buildContract({ repo, metadata, files, steps, health, failureScan, source }) {
  const packageJsonText = read(files, 'package.json');
  let packageJson = null;
  try { packageJson = packageJsonText ? JSON.parse(packageJsonText) : null; } catch { /* malformed or truncated */ }
  const pyproject = read(files, 'pyproject.toml');
  const goMod = read(files, 'go.mod');
  const cargoToml = read(files, 'Cargo.toml');
  const dockerfile = files.find((file) => lowerName(file) === 'dockerfile')?.content || '';
  const compose = read(files, 'docker-compose.yml') || read(files, 'docker-compose.yaml');
  const readme = files.filter((file) => /^readme(\.|$)/i.test(lowerName(file))).sort((a, b) => depth(a) - depth(b))[0]?.content || '';
  const combined = files.map((file) => `${file.path}\n${file.content || ''}`).join('\n');
  const names = new Set(files.map(lowerName));

  // --- 1. Exact versions this path expects ---------------------------------
  const expects = [];
  const engines = packageJson?.engines || {};
  if (engines.node) push(expects, { name: 'Node.js', required: String(engines.node), detectedFrom: 'package.json → engines.node', confidence: 'declared' });
  else if (packageJson) push(expects, { name: 'Node.js', required: 'not declared — 20.x or 22.x LTS is the safe assumption', detectedFrom: 'package.json has no engines field', confidence: 'inferred' });
  if (engines.npm) push(expects, { name: 'npm', required: String(engines.npm), detectedFrom: 'package.json → engines.npm', confidence: 'declared' });
  if (packageJson?.packageManager) push(expects, { name: 'Package manager', required: String(packageJson.packageManager), detectedFrom: 'package.json → packageManager', confidence: 'declared' });
  const requiresPython = parseTomlValue(pyproject, 'requires-python');
  if (requiresPython) push(expects, { name: 'Python', required: requiresPython, detectedFrom: 'pyproject.toml → requires-python', confidence: 'declared' });
  else if (names.has('requirements.txt')) push(expects, { name: 'Python', required: '3.10+ (not declared by the project)', detectedFrom: 'requirements.txt present, no pinned version', confidence: 'inferred' });
  const goVersion = firstMatch(goMod, /^go\s+([0-9.]+)/im);
  if (goVersion) push(expects, { name: 'Go', required: `^${goVersion}`, detectedFrom: 'go.mod → go directive', confidence: 'declared' });
  const rustVersion = parseTomlValue(cargoToml, 'rust-version');
  if (rustVersion) push(expects, { name: 'Rust', required: rustVersion, detectedFrom: 'Cargo.toml → rust-version', confidence: 'declared' });
  const baseImage = firstMatch(dockerfile, /^FROM\s+(\S+)/im);
  if (baseImage) push(expects, { name: 'Container base image', required: baseImage, detectedFrom: 'Dockerfile → FROM', confidence: 'declared' });
  if (names.has('docker-compose.yml') || names.has('docker-compose.yaml')) {
    push(expects, { name: 'Docker Compose', required: 'v2 (`docker compose`, not `docker-compose`)', detectedFrom: 'compose file in the tree', confidence: 'declared' });
  }
  if (packageJson?.version) push(expects, { name: 'Project version', required: String(packageJson.version), detectedFrom: 'package.json → version', confidence: 'declared' });

  // --- 2. What will be installed ------------------------------------------
  const runtimeDeps = Object.keys(packageJson?.dependencies || {});
  const devDeps = Object.keys(packageJson?.devDependencies || {});
  const installs = [];
  if (runtimeDeps.length || devDeps.length) {
    installs.push({
      what: `${runtimeDeps.length + devDeps.length} package${runtimeDeps.length + devDeps.length === 1 ? '' : 's'}`,
      kind: 'packages',
      detail: `${runtimeDeps.length} runtime, ${devDeps.length} development, written to ./node_modules inside the project folder only.`,
      sample: [...runtimeDeps, ...devDeps].slice(0, 8),
      scope: './node_modules',
    });
  }
  const pipLines = [...combined.matchAll(/^\s*pip3?\s+install\s+([^\n#]+)/gim)].map((match) => match[1].trim());
  const declaredPython = (read(files, 'requirements.txt').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')) || []).slice(0, 40);
  if (declaredPython.length || pipLines.length) {
    installs.push({
      what: `${declaredPython.length || pipLines.length} Python package${(declaredPython.length || 1) === 1 ? '' : 's'}`,
      kind: 'packages',
      detail: declaredPython.length ? 'Listed in requirements.txt; install them inside a virtual environment.' : 'Mentioned as pip install lines in the documentation.',
      sample: (declaredPython.length ? declaredPython : pipLines).slice(0, 8).map((line) => line.split(/\s+/)[0]),
      scope: '.venv (project local, if the venv step is followed)',
    });
  }
  if (baseImage) installs.push({ what: 'Container image', kind: 'images', detail: `Built from the repository Dockerfile on base ${baseImage}, plus any images named in the compose file.`, scope: 'Docker daemon storage, outside the project folder' });
  const systemPackages = [...new Set([...readme.matchAll(/\b(?:brew|apt(?:-get)?|winget|choco)\s+(?:install|list\s+-i)\s+([A-Za-z0-9._+-]+(?:\s+[A-Za-z0-9._+-]+){0,3})/g)].map((match) => match[1]))];
  if (systemPackages.length) installs.push({ what: `${systemPackages.length} system package${systemPackages.length === 1 ? '' : 's'}`, kind: 'binaries', detail: `Asked for by the documentation: ${systemPackages.slice(0, 5).join(', ')}. These land outside the project and usually need your password.`, sample: systemPackages.slice(0, 8), scope: 'system-wide' });

  // --- 3. Permissions and side effects --------------------------------------
  const permissions = [];
  permissions.push({ capability: 'Outbound network access', why: 'Fetching packages, images, or module indexes from public registries.', risk: 'low', scope: 'read-only downloads' });
  if (installs.some((item) => item.scope === 'system-wide')) {
    permissions.push({ capability: 'System-wide writes (needs your password)', why: 'A documented step installs packages outside the project folder.', risk: 'high', scope: 'system paths' });
  }
  permissions.push({ capability: 'Write inside the project directory', why: 'node_modules, .venv, generated config, and build output are all created here.', risk: 'low', scope: 'repo working tree' });
  const envKeys = uniqueKeys(combined);
  if (envKeys.length) permissions.push({ capability: 'Read local secrets', why: `The app loads ${envKeys.slice(0, 6).join(', ')} at runtime. Nothing uploads them; they stay in .env.`, risk: 'medium', scope: '.env in this folder' });
  const ports = uniquePorts(compose, dockerfile, readme, packageJson, combined);
  if (ports.length) permissions.push({ capability: `Bind ${ports.map((port) => `localhost:${port}`).join(', ')}`, why: 'The dev or production server listens on that port, so it is reachable from your machine.', risk: 'low', scope: 'loopback only, unless HOST=0.0.0.0 is set' });
  if (/(sudo|rm\s+-rf|chmod\s+777|curl[^|]*\|\s*(ba)?sh)/i.test(combined)) {
    permissions.push({ capability: 'Privileged or destructive commands appear in this documentation', why: 'Git-Up found sudo, rm -rf, or a piped-to-shell line in the scanned files. Review those commands yourself before running them.', risk: 'high', scope: 'your whole machine' });
  }

  // --- 4. The final working state, with a way to prove it -------------------
  const runStep = [...(steps || [])].reverse().find((entry) => /\b(dev|start|run|serve|up)\b/i.test(String(entry.id) + String(entry.title)));
  const declaredPort = ports[0] || null;
  const managerRun = (name) => (names.has('yarn.lock') ? `yarn ${name === 'test' ? '' : 'run '}${name}`.trim() : names.has('pnpm-lock.yaml') ? `pnpm ${name}` : name === 'test' ? 'npm test' : `npm run ${name}`);
  const verification = {
    command: declaredPort
      ? `curl -sS -o /dev/null -w "http %{http_code}\\n" http://localhost:${declaredPort}`
      : packageJson?.scripts?.test ? managerRun('test')
        : packageJson?.scripts?.build ? managerRun('build')
          : names.has('pytest.ini') || names.has('conftest.py') ? 'pytest -q'
            : 'echo "no automated check found — read the app startup output instead"',
    expect: declaredPort ? 'HTTP 200 (3xx/401 can still mean it started — read the server log).' : 'All tests pass, exit code 0.',
    notes: runStep ? `Follows “${runStep.title}”. Keep that terminal open while you verify.` : 'Run this in a second terminal after starting the app.',
    port: declaredPort,
  };
  const workingState = declaredPort
    ? `The process stays alive, prints no stack trace after startup, and ${`http://localhost:${declaredPort}`} answers with your project’s first screen.`
    : 'The start command stays running without a stack trace, and its documented entry point responds or prints its first-run output.';

  const checklist = [
    ...expects.filter((item) => item.confidence === 'declared').slice(0, 4).map((item) => ({ id: `expect-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label: `${item.name} reports ${item.required}`, hint: item.detectedFrom })),
    ...installs.map((item, index) => ({ id: `install-${item.kind}-${index}`, label: `${item.what} present where it belongs`, hint: item.scope || item.detail })),
    ...(envKeys.length ? [{ id: 'env-filled', label: `No placeholder values left in the ${envKeys.length} configuration key${envKeys.length === 1 ? '' : 's'}`, hint: envKeys.slice(0, 8).join(', ') }] : []),
    { id: 'verify-command', label: 'Verification command returns the expected result', hint: verification.command },
    ...(health?.caps?.length ? health.caps.slice(0, 2).map((cap, index) => ({ id: `risk-${index}`, label: cap, hint: 'Raised by the health scan before you installed.' })) : []),
  ];

  // Honest gaps: an empty list is only meaningful if we say why it is empty.
  const unreadable = files.length > 0 && files.every((file) => !String(file.content || '').trim());
  const gaps = [];
  if (unreadable) gaps.push({ field: 'everything', reason: 'File contents could not be downloaded, so only the repository’s file names were readable. Re-run the analysis on a network that can reach raw.githubusercontent.com to fill in versions and package counts.' });
  if (!unreadable && !expects.length) gaps.push({ field: 'exact versions', reason: 'No engines field, go directive, requires-python, or rust-version was found — this project does not declare a runtime version, so treat the versions in step one as a guess.' });
  if (!unreadable && !installs.length) gaps.push({ field: 'what gets installed', reason: 'No dependency manifest was readable in the scanned files.' });
  if (!unreadable && !declaredPort) gaps.push({ field: 'verification port', reason: 'No EXPOSE, compose mapping, or localhost URL was found, so the check falls back to the project’s own test or build script.' });
  if (!permissions.some((entry) => entry.risk === 'high')) gaps.push({ field: 'privileged commands', reason: 'Nothing needing sudo or writing outside the project was found — but only the scanned files were read, so verify before running commands the README adds later.' });

  const terms = { expects, installs, permissions, verification, workingState, checklist, gaps };
  const contractId = `GITUP-${digest(JSON.stringify({ terms, repo: repo?.canonicalUrl, branch: metadata?.default_branch }))}`;

  return {
    contractId,
    issuedAt: new Date().toISOString(),
    status: 'proposed',
    basis: {
      repository: repo?.canonicalUrl || '',
      branch: metadata?.default_branch || 'main',
      source: source === 'ai' ? 'AI analysis over scanned files' : 'direct file parse, no model involved',
      fileCount: files.length,
      files: files.slice(0, 14).map((file) => file.path),
      failureScan: failureScan?.available ? `${failureScan.patterns.filter((p) => p.origin === 'reported').length} reported signature(s)` : 'inferred only',
    },
    ...terms,
    guarantees: [
      'Git-Up never runs these commands. Every line here is for you to review and paste.',
      `Nothing is sent anywhere except the ${files.length} public files listed above and the ${repo?.canonicalUrl || 'repository'} metadata.`,
      'No command was invented: each one appears in, or is derived from, a file in the tree.',
      'Any claim the scan could not ground is labelled “inferred” rather than “declared” — check those first.',
    ],
    signature: {
      by: 'Git-Up install planner',
      method: 'content digest of the terms above (djb2/base36)',
      termsHash: contractId.split('-').pop(),
      evidenceCount: files.length,
      healthScore: health?.score ?? null,
    },
  };
}

function uniqueKeys(text) {
  const found = [...String(text).matchAll(/(?:^|\n)\s*([A-Z][A-Z0-9_]{2,})\s*=/g)].map((match) => match[1]);
  return [...new Set(found)].filter((key) => !['PATH', 'HOME', 'SHELL', 'NODE_ENV', 'LANG'].includes(key)).slice(0, 10);
}

function uniquePorts(compose, dockerfile, readme, packageJson, combined) {
  const ports = new Set();
  for (const match of String(compose).matchAll(/["']?(\d{2,5}):(\d{2,5})["']?/g)) ports.add(match[1]);
  for (const match of String(dockerfile).matchAll(/^EXPOSE\s+(\d{2,5})/gim)) ports.add(match[1]);
  const envPort = firstMatch(readme, /(?:localhost|127\.0\.0\.1):(\d{4,5})/);
  if (envPort) ports.add(envPort);
  const portScript = String(packageJson?.scripts?.start || '').match(/(?:-p|--port|PORT=)\s*(\d{2,5})/i)?.[1];
  if (portScript) ports.add(portScript);
  if (!ports.size) {
    const loose = String(combined).match(/(?:localhost:|0\.0\.0\.0:)(\d{4,5})/);
    if (loose) ports.add(loose[1]);
  }
  if (!ports.size && /vite|next|nuxt|react-scripts|astro|svelte-kit/i.test(JSON.stringify(packageJson?.scripts || {}))) {
    if (/next/i.test(JSON.stringify(packageJson?.dependencies || {}))) ports.add('3000');
    else ports.add('5173');
  }
  return [...ports].slice(0, 4);
}
