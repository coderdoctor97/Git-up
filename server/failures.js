// ---------------------------------------------------------------------------
// Feature 2 — Failure-first analysis
//
// Most installers show the happy path. This module does the opposite: it reads
// a repository's open/closed Issues, recent PRs (and Discussions where the
// GraphQL API allows it), keeps only the threads that smell like *installation*
// trouble, clusters them by failure signature, and ranks by real frequency.
//
// Everything here is best-effort and evidence-bound: when GitHub is rate
// limited or the repo has no reported failures, the scan degrades to a
// file-derived inference pass, clearly marked `origin: 'inferred'` so the UI
// can never present a guess as a reported bug.
// ---------------------------------------------------------------------------

/** Failure signatures, each with the regexes that prove it and how to patch it. */
export const FAILURE_SIGNATURES = [
  {
    id: 'engine-version',
    label: 'Runtime version mismatch',
    test: /\bEBADENGINE\b|engines?\b.{0,30}(node|npm)|unsupported node|requires node|node\.?js\s*\d{1,2}|nvm|version manager/i,
    why: 'The project expects a runtime version your machine is not on, so install or first run dies early.',
    fix: ['node --version', 'npm --version'],
    patchStepId: 'toolchain',
    weight: 3,
  },
  {
    id: 'peer-resolve',
    label: 'Dependency resolution conflict',
    test: /\bERESOLVE\b|peer dep|conflicting peer|could not resolve|unmet peer|no matching version/i,
    why: 'Two packages want incompatible versions, so the package manager refuses to finish.',
    fix: ['npm install --legacy-peer-deps', 'pnpm install'],
    patchStepId: 'dependencies',
    weight: 3,
  },
  {
    id: 'native-build',
    label: 'Native module / build toolchain failure',
    test: /node-gyp|\bgyp ERR\b|prebuilt|binding\.node|make.*failed|MSVC|visual studio|build essential|xcode-select|command line tools|cc1plus/i,
    why: 'A dependency compiles C/C++ on install and needs a local compiler toolchain that is missing.',
    fix: ['xcode-select --install', 'sudo apt-get install -y build-essential python3'],
    patchStepId: 'toolchain',
    weight: 3,
  },
  {
    id: 'missing-module',
    label: 'Module not found at first run',
    test: /cannot find module|module not found|ModuleNotFoundError|No module named|ImportError|undefined is not a function.*import/i,
    why: 'The app starts before its packages are actually installed, or the wrong working directory is used.',
    fix: ['ls node_modules >/dev/null 2>&1 || npm install'],
    patchStepId: 'dependencies',
    weight: 2,
  },
  {
    id: 'env-config',
    label: 'Missing environment variable or key',
    test: /\.env\b|environment variable|missing (api )?key|API_KEY|SECRET|undefined.{0,20}(token|key)|config not found|\.env\.example/i,
    why: 'Required configuration is read at startup and nothing in the repo created it for you.',
    fix: ['cp .env.example .env', 'grep -c "" .env'],
    patchStepId: 'env',
    weight: 3,
  },
  {
    id: 'port-conflict',
    label: 'Port already in use',
    test: /EADDRINUSE|address already in use|port .{0,12}(in use|busy|occupied)/i,
    why: 'The dev server binds a fixed port that something else on the machine already owns.',
    fix: ['lsof -i :3000', 'PORT=3001 npm run dev'],
    patchStepId: 'run',
    weight: 2,
  },
  {
    id: 'permissions',
    label: 'Filesystem permissions',
    test: /\bEACCES\b|permission denied|read-only file system|requires sudo|run as root|EPERM/i,
    why: 'Global or system-owned install targets reject writes from a normal user account.',
    fix: ['npm config set prefix ~/.npm-global'],
    patchStepId: 'toolchain',
    weight: 2,
  },
  {
    id: 'network-tls',
    label: 'Registry / proxy / TLS unreachable',
    test: /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|self.?signed|unable to verify|certificate|proxy|offline|network error|403 Forbidden.{0,40}registry/i,
    why: 'Corporate proxies, VPNs, or blocked registries stop the download step before it can finish.',
    fix: ['npm config get registry', 'npm config set strict-ssl false'],
    patchStepId: 'dependencies',
    weight: 2,
  },
  {
    id: 'python-env',
    label: 'Python environment conflicts',
    test: /externally managed|externally-managed|\bPEP 668\b|pip install.{0,40}(failed|error)|virtualenv|\bvenv\b|pip: command not found|pip3/i,
    why: 'System Python refuses global installs, or the project’s packages land outside the active environment.',
    fix: ['python3 -m venv .venv', 'source .venv/bin/activate', 'pip install -r requirements.txt'],
    patchStepId: 'dependencies',
    weight: 3,
  },
  {
    id: 'lockfile-drift',
    label: 'Lockfile and manifest disagree',
    test: /lockfile|npm ci.{0,40}(fail|error)|out of sync|EINTEGRITY|integrity check|shasum|checksum/i,
    why: 'A committed lockfile pins packages the manifest no longer describes, so clean installs diverge.',
    fix: ['npm ci', 'npm install --package-lock-only'],
    patchStepId: 'dependencies',
    weight: 2,
  },
  {
    id: 'docker-setup',
    label: 'Container / compose setup',
    test: /\bdocker\b|docker.?compose|daemon is running|compose up|no such image|manifest.{0,20}unknown|exited \(1\)|health.?check/i,
    why: 'The container path assumes a running daemon, the right compose binary, and free published ports.',
    fix: ['docker info >/dev/null 2>&1 && echo daemon-ok', 'docker compose up -d'],
    patchStepId: 'docker',
    weight: 2,
  },
  {
    id: 'os-specific',
    label: 'OS or architecture specific breakage',
    test: /\bwindows\b|powershell|wsl|\bmacos\b|\bM1\b|arm64|\bdarwin\b|\blinux\b|line endings|CRLF|shell script/i,
    why: 'Scripts assume a POSIX shell or a single architecture, and fail elsewhere.',
    fix: ['uname -sm'],
    patchStepId: 'toolchain',
    weight: 1,
  },
  {
    id: 'database-services',
    label: 'Database or backing service missing',
    test: /\bpostgres\b|\bmysql\b|redis|mongo|database.{0,30}(connection|refused|error)|ECONNREFUSED.{0,30}(5432|3306|6379)|migration.{0,30}fail/i,
    why: 'The app expects a service on localhost that nothing in the install path started.',
    fix: ['docker compose up -d db redis'],
    patchStepId: 'services',
    weight: 3,
  },
  {
    id: 'memory-disk',
    label: 'Out of memory or disk',
    test: /heap out of memory|JavaScript heap|\bENOMEM\b|No space left|disk quota|killed/i,
    why: 'Large dependency graphs or builds exceed the machine during install.',
    fix: ['NODE_OPTIONS=--max-old-space-size=4096 npm install'],
    patchStepId: 'build',
    weight: 1,
  },
];

const INSTALL_INTENT = /\b(install|setup|getting started|quick ?start|build|run|start|compile|deploy|local(?:host)? dev|first run|cannot (?:find|run)|fail(?:ed|s|ure)?|error|crash|break|not working|won'?t (?:start|run|build)|stuck)\b/i;

const STOPWORDS = /\b(bug report template|feature request|question about usage|how do i (?:use|configure)|translation|typo|docs typo|bump |chore:|refactor|ci:|release)\b/i;

function textOf(thread) {
  return `${thread.title || ''}\n${thread.body || ''}`.slice(0, 6000);
}

function threadUrl(thread, repo) {
  return thread.html_url || `${repo.canonicalUrl}/issues/${thread.number}`;
}

/** Score one thread: does it look install-related, and how much do people care? */
function scoreThread(thread, repo) {
  const text = textOf(thread);
  if (!INSTALL_INTENT.test(text)) return null;
  if (STOPWORDS.test(thread.title || '')) return null;
  const hits = FAILURE_SIGNATURES.filter((signature) => signature.test.test(text));
  if (!hits.length) return null;
  const engagement =
    Math.min(6, (thread.reactions?.total_count || 0) / 4) +
    Math.min(4, (thread.comments || 0) / 3) +
    (thread.state === 'open' ? 1.5 : 0) +
    (thread.pull_request ? -0.75 : 0);
  return { thread, hits, raw: hits.reduce((sum, hit) => sum + hit.weight, 0) + engagement };
}

function collect(signals) {
  const bySignature = new Map();
  for (const signal of signals) {
    for (const signature of signal.hits) {
      const entry = bySignature.get(signature.id) || { signature, threads: [], weight: 0 };
      entry.threads.push(signal.thread);
      entry.weight += signal.raw;
      bySignature.set(signature.id, entry);
    }
  }
  return [...bySignature.values()]
    .sort((a, b) => b.threads.length - a.threads.length || b.weight - a.weight)
    .map((entry, index) => {
      const open = entry.threads.filter((thread) => thread.state === 'open').length;
      return {
        rank: index + 1,
        id: entry.signature.id,
        label: entry.signature.label,
        why: entry.signature.why,
        patchStepId: entry.signature.patchStepId,
        commands: entry.signature.fix,
        count: entry.threads.length,
        openCount: open,
        weight: Math.round(entry.weight * 10) / 10,
        origin: 'reported',
        threads: entry.threads
          .sort((a, b) => (b.reactions?.total_count || 0) - (a.reactions?.total_count || 0))
          .slice(0, 4)
          .map((thread) => ({
            number: thread.number,
            title: String(thread.title || '').slice(0, 140),
            url: threadUrl(thread, entry.repo || thread.repository_url || { canonicalUrl: '' }),
            state: thread.state,
            isPr: Boolean(thread.pull_request),
            reactions: thread.reactions?.total_count || 0,
            comments: thread.comments || 0,
            updated: thread.updated_at,
          })),
      };
    });
}

/**
 * File-derived inference used whenever real threads cannot be read. Marked
 * `origin: 'inferred'` everywhere it surfaces.
 */
function inferFromFiles(files, metadata) {
  const names = new Set(files.map((file) => String(file.path).toLowerCase().split('/').pop()));
  const read = (name) => files.filter((file) => String(file.path).toLowerCase().split('/').pop() === name).sort((a, b) => String(a.path).split('/').length - String(b.path).split('/').length)[0]?.content || '';
  const readme = [...names].filter((name) => /^readme(\.|$)/.test(name)).map((name) => read(name)).join('\n');
  const packageJsonText = read('package.json');
  let packageJson = null;
  try { packageJson = packageJsonText ? JSON.parse(packageJsonText) : null; } catch { /* keep null */ }
  const combined = files.map((file) => file.content || '').join('\n');
  const hasLock = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb', 'bun.lock', 'poetry.lock', 'pipfile.lock', 'cargo.lock', 'go.sum'].some((name) => names.has(name));
  const inferred = [];

  if (packageJson && !packageJson.engines) {
    inferred.push({ id: 'engine-version', count: 0, origin: 'inferred', detail: 'package.json declares no `engines`, so any Node release is “supported” until one of them breaks.' });
  }
  if (Object.keys(packageJson?.dependencies || {}).length || Object.keys(packageJson?.devDependencies || {}).length) {
    if (!hasLock) inferred.push({ id: 'lockfile-drift', count: 0, origin: 'inferred', detail: 'No lockfile was found in the scanned tree, so each install resolves different transitive versions.' });
  }
  if (/\b[A-Z][A-Z0-9_]{3,}\s*=/.test(combined) && !names.has('.env.example') && !names.has('.env.sample')) {
    inferred.push({ id: 'env-config', count: 0, origin: 'inferred', detail: 'Configuration keys are read by the code but no `.env.example` template ships with them.' });
  }
  if (!/\b(install|getting started|quick ?start|setup)\b/i.test(readme)) {
    inferred.push({ id: 'missing-module', count: 0, origin: 'inferred', detail: 'The README has no install/setup section, so first-time runners typically start the app before installing it.' });
  }
  if (/(node-gyp|"gypfile"\s*:\s*true)|onnx|sharp|canvas|sqlite3|bcrypt|puppeteer|cypress/i.test(combined)) {
    inferred.push({ id: 'native-build', count: 0, origin: 'inferred', detail: 'At least one dependency compiles native code on install, which needs a local build toolchain.' });
  }
  if (names.has('docker-compose.yml') || names.has('docker-compose.yaml')) {
    inferred.push({ id: 'docker-setup', count: 0, origin: 'inferred', detail: 'Compose is the entry point, so a stopped daemon or busy published port blocks everything downstream.' });
  }
  if (/postgres|mysql|redis|mongo/i.test(combined) && !names.has('docker-compose.yml') && !names.has('docker-compose.yaml')) {
    inferred.push({ id: 'database-services', count: 0, origin: 'inferred', detail: 'A backing service is expected, but nothing in the tree starts it for local development.' });
  }
  if (/requires-python/i.test(read('pyproject.toml')) || names.has('requirements.txt')) {
    inferred.push({ id: 'python-env', count: 0, origin: 'inferred', detail: 'Python dependencies are installed without a declared isolated environment step.' });
  }
  if (!inferred.length && metadata?.pushed_at && Date.now() - Date.parse(metadata.pushed_at) > 1000 * 60 * 60 * 24 * 540) {
    inferred.push({ id: 'os-specific', count: 0, origin: 'inferred', detail: 'The tree has been idle for over 18 months; install instructions usually rot before code does.' });
  }

  const byId = new Map(FAILURE_SIGNATURES.map((signature) => [signature.id, signature]));
  return inferred.map((item, index) => {
    const signature = byId.get(item.id);
    return {
      rank: index + 1,
      id: item.id,
      label: signature?.label || item.id,
      why: item.detail,
      patchStepId: signature?.patchStepId,
      commands: signature?.fix || [],
      count: 0,
      openCount: 0,
      weight: 1,
      origin: 'inferred',
      threads: [],
    };
  });
}

async function safeJson(promise) {
  try { return await promise; } catch { return null; }
}

/**
 * GraphQL Discussions, attempted only with a token (REST has no discussions
 * endpoint). Returns null silently so absence never looks like an error.
 */
async function scanDiscussions(repo, token) {
  if (!token) return null;
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussions(first:25,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{title body state comments(first:1){totalCount} upvoteCount url}}}}}`;
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Git-Up/2.0.0', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner: repo.owner, name: repo.repo } }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const nodes = payload?.data?.repository?.discussions?.nodes || [];
    return nodes.map((node) => ({
      number: null,
      title: node.title,
      body: node.body,
      state: node.state === 'OPEN' ? 'open' : 'closed',
      html_url: node.url,
      comments: node.comments?.totalCount || 0,
      reactions: { total_count: node.upvoteCount || 0 },
      updated_at: null,
    }));
  } catch {
    return null;
  }
}

export async function scanInstallFailures({ repo, metadata, files, github, token }) {
  const result = {
    available: false,
    notice: '',
    sources: { issues: 'none', pulls: 'none', discussions: 'none' },
    sampled: { issues: 0, pulls: 0, discussions: 0 },
    installRelated: 0,
    totalThreads: 0,
    patterns: [],
    openIssuesTotal: 0,
  };

  if (typeof github !== 'function') {
    result.notice = 'Failure scan unavailable in this mode.';
    result.patterns = inferFromFiles(files, metadata);
    return result;
  }

  const [issues, pulls, repoMeta] = await Promise.all([
    safeJson(github(`/repos/${repo.apiPath}/issues?state=all&per_page=40&sort=updated&direction=desc`)),
    safeJson(github(`/repos/${repo.apiPath}/pulls?state=all&per_page=25&sort=updated&direction=desc`)),
    Promise.resolve(metadata || {}),
  ]);
  result.openIssuesTotal = repoMeta?.open_issues_count || 0;

  const pool = [];
  if (Array.isArray(issues)) {
    result.sources.issues = 'ok';
    result.sampled.issues = issues.length;
    pool.push(...issues.filter((thread) => !thread.pull_request));
  }
  if (Array.isArray(pulls)) {
    result.sources.pulls = 'ok';
    result.sampled.pulls = pulls.length;
    pool.push(...pulls.map((pull) => ({ ...pull, pull_request: { merged_at: pull.merged_at } })));
  }
  if (result.sources.issues === 'none' && result.sources.pulls === 'none') {
    result.notice = 'GitHub threads could not be read (rate limit or private repo). The list below is inferred from the repository files instead.';
    result.patterns = inferFromFiles(files, metadata);
    return result;
  }

  const discussions = await scanDiscussions(repo, token);
  if (Array.isArray(discussions) && discussions.length) {
    result.sources.discussions = 'ok';
    result.sampled.discussions = discussions.length;
    pool.push(...discussions);
  }

  result.totalThreads = pool.length;
  const scored = pool.map((thread) => scoreThread(thread, repo)).filter(Boolean);
  result.installRelated = scored.length;
  const ranked = collect(scored).slice(0, 6);
  const inferred = inferFromFiles(files, metadata).slice(0, 3);
  const seen = new Set(ranked.map((item) => item.id));
  const merged = [...ranked, ...inferred.filter((item) => !seen.has(item.id))].slice(0, 6).map((item, index) => ({ ...item, rank: index + 1 }));

  result.patterns = merged;
  result.available = true;
  if (!merged.length) {
    result.notice = result.totalThreads
      ? `${result.totalThreads} recent threads mention installation, but none matched a known failure signature.`
      : 'No installation failures found in the recent threads.';
  }
  return result;
}

/** Which base steps the failure scan should pre-empt, for the "already patched" note. */
export function patchNotesFor(failureScan, steps = []) {
  if (!failureScan?.patterns?.length) return [];
  const stepIds = new Set(steps.map((step) => String(step.id)));
  const notes = [];
  for (const pattern of failureScan.patterns) {
    if (!pattern.patchStepId || !stepIds.has(pattern.patchStepId)) continue;
    notes.push({
      failureId: pattern.id,
      stepId: pattern.patchStepId,
      origin: pattern.origin,
      count: pattern.count,
      text: pattern.origin === 'reported'
        ? `Added because ${pattern.count} ${pattern.count === 1 ? 'thread' : 'threads'} hit “${pattern.label}” here.`
        : `Included up front — “${pattern.label}” is likely for this repo shape.`,
    });
  }
  return notes;
}
