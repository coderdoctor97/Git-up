import http from 'node:http';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

function loadDotEnv(fileUrl = new URL('./.env', import.meta.url)) {
  let text = '';
  try {
    text = readFileSync(fileUrl, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Could not read .env: ${error.message}`);
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    const value = rawValue.replace(/^(['"])([\s\S]*)\1$/, '$2');
    process.env[key] = value;
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const PUBLIC_DIR = new URL('./public/', import.meta.url);
const ASSETS_DIR = new URL('./assets/', import.meta.url);

import { scanInstallFailures, patchNotesFor } from './server/failures.js';
import { computeHealth, fetchCiSignal, healthVerdict } from './server/health.js';
import { buildPathGraph, patchStepsForFailures } from './server/pathgraph.js';
import { buildContract } from './server/contract.js';
import { recoverPath } from './server/recovery.js';
import { decorateSteps, composeSteps, EXPERTISE_LEVELS, expertiseFor, tuneGuide } from './public/path-engine.js';

const FEATURE_FLAGS = ['living-install-path', 'failure-first-analysis', 'multi-path-graph', 'install-contract', 'zero-context-clone', 'repo-health-score'];
const CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_FILE_BYTES = 110_000;
const MAX_CONTEXT_CHARS = 36_000;
const MAX_SCAN_FILES = 24;
const USER_AGENT = 'Git-Up/2.0.0 (repository-installation-guide)';

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function normaliseRepoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a GitHub repository URL.');
  const raw = value.trim();
  let url;
  try {
    if (raw.startsWith('git@github.com:')) url = new URL(`https://github.com/${raw.slice('git@github.com:'.length)}`);
    else if (raw.startsWith('ssh://git@github.com/')) url = new URL(`https://github.com/${raw.slice('ssh://git@github.com/'.length)}`);
    else if (raw.startsWith('github.com/')) url = new URL(`https://${raw}`);
    else url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new Error('That does not look like a valid GitHub repository URL.');
  }
  if (url.hostname.toLowerCase() !== 'github.com' && url.hostname.toLowerCase() !== 'www.github.com') {
    throw new Error('Only github.com repository URLs are supported.');
  }
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts.length < 2) throw new Error('Add an owner and repository name to the GitHub URL.');
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('The repository name contains unsupported characters.');
  return { owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}`, apiPath: `${owner}/${repo}` };
}

function githubNetworkError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  const cause = error?.cause?.code || error?.cause?.message || '';
  const detail = [message, cause].filter(Boolean).join(' — ');
  if (/UNABLE_TO_VERIFY|CERT|SELF_SIGNED|TLS/i.test(detail)) {
    return new Error('GitHub is reachable, but Node could not verify the TLS certificate. Check the system CA store or proxy settings, then retry.');
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(detail)) {
    return new Error(`GitHub API is unreachable${detail ? ` (${detail})` : ''}. Check the network connection or try again later.`);
  }
  return error instanceof Error ? error : new Error(detail || 'GitHub API request failed.');
}

async function github(path, options = {}) {
  let response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw githubNetworkError(error);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).message || ''; } catch { /* ignore */ }
    if (response.status === 403) throw new Error('GitHub rate limit reached. Add a GitHub token to the server environment or try again later.');
    if (response.status === 404) throw new Error('Repository not found, or it is private. Git-Up can currently scan public repositories.');
    throw new Error(`GitHub returned ${response.status}${detail ? `: ${detail}` : '.'}`);
  }
  return response.json();
}

function rawGithubUrl(path, ref) {
  const [owner, repo, ...fileParts] = String(path || '').split('/');
  if (!owner || !repo || !fileParts.length) return null;
  const filePath = fileParts.map((part) => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref || 'HEAD')}/${filePath}`;
}

async function rawGithub(path, ref) {
  const url = rawGithubUrl(path, ref);
  if (!url) return null;
  let response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch { return null; }
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) return buffer.subarray(0, MAX_FILE_BYTES).toString('utf8') + '\n[truncated]';
  return buffer.toString('utf8');
}

async function rawGithubHead(repo, filePath) {
  let response;
  try {
    response = await fetch(`https://github.com/${repo.apiPath}/raw/HEAD/${filePath}`, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
  } catch { return null; }
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) return buffer.subarray(0, MAX_FILE_BYTES).toString('utf8') + '\n[truncated]';
  return buffer.toString('utf8');
}

function htmlText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

async function fallbackRepositoryScan(repo, originalError) {
  let pageResponse;
  try {
    pageResponse = await fetch(repo.canonicalUrl, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  } catch {
    throw originalError;
  }
  if (!pageResponse.ok) throw originalError;
  const page = await pageResponse.text();
  const title = page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || repo.repo;
  const description = page.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] || '';
  const branch = page.match(/(?:defaultBranch|default_branch)["']?\s*:\s*["']([^"']+)/i)?.[1] || 'HEAD';
  const knownFiles = [
    'README.md', 'Readme.md', 'readme.md', 'README', 'package.json', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb', 'bun.lock',
    'pyproject.toml', 'requirements.txt', 'poetry.lock', 'Pipfile', 'Pipfile.lock', 'setup.py', 'setup.cfg',
    'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile', 'composer.json', 'Dockerfile',
    'docker-compose.yml', 'docker-compose.yaml', '.env.example', '.env.sample', 'Makefile', 'Justfile',
  ];
  const files = (await Promise.all(knownFiles.map(async (path) => ({ path, content: await rawGithubHead(repo, path) })))).filter((file) => file.content);
  if (!files.length) throw originalError;
  let language = null;
  const names = files.map((file) => file.path.toLowerCase());
  if (names.includes('package.json')) language = 'JavaScript';
  else if (names.includes('pyproject.toml') || names.includes('requirements.txt')) language = 'Python';
  else if (names.includes('go.mod')) language = 'Go';
  else if (names.includes('cargo.toml')) language = 'Rust';
  return {
    metadata: { name: repo.repo, description: htmlText(description) || htmlText(title).replace(/\s*[·|].*$/, ''), default_branch: branch, language },
    files,
    fallbackNotice: 'GitHub API rate limits required a lightweight public-file scan.',
  };
}

function filePriority(name) {
  const lower = name.toLowerCase();
  const exact = [
    'readme.md', 'readme', 'package.json', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json',
    'pyproject.toml', 'requirements.txt', 'poetry.lock', 'pipfile', 'pipfile.lock',
    'cargo.toml', 'go.mod', 'gemfile', 'composer.json', 'dockerfile', 'docker-compose.yml',
    'docker-compose.yaml', '.env.example', 'makefile', 'justfile', 'setup.py', 'setup.cfg',
  ];
  const base = lower.split('/').pop();
  const exactIndex = exact.indexOf(base);
  if (exactIndex >= 0) return exactIndex;
  if (/^readme(\.|$)/.test(base)) return 0;
  if (/\.ya?ml$|\.toml$|\.json$/.test(base)) return 30;
  return 50;
}

const CRITICAL_ROOT = ['package.json', 'go.mod', 'cargo.toml', 'pyproject.toml', 'requirements.txt', 'dockerfile',
  'docker-compose.yml', 'docker-compose.yaml', 'makefile', 'justfile', '.env.example', '.env.sample', 'gemfile',
  'composer.json', 'setup.py', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'uv.lock', 'deno.json',
  'procfile', 'fly.toml', 'railway.json', 'readme.md'];

/**
 * Choose the files worth reading.
 *
 * Sorting by name alone let a 27k-file repository fill every slot with nested
 * READMEs, which starved the graph, the contract, and the health score of the
 * root manifests that actually decide how a project installs. So: root-level
 * critical files first, then at most a couple of any repeated file name, with
 * shallower paths winning.
 */
function pickFiles(tree) {
  const blobs = tree
    .filter((item) => item.type === 'blob')
    .filter((item) => item.size <= MAX_FILE_BYTES || item.size === undefined)
    .filter((item) => !/(node_modules|vendor|dist|build|\.git|coverage|\.next|target)\//i.test(item.path))
    .map((item) => {
      const base = String(item.path).toLowerCase().split('/').pop();
      const depth = String(item.path).split('/').length - 1;
      return { ...item, base, depth, root: depth === 0, criticalRank: CRITICAL_ROOT.indexOf(base) };
    });

  const chosen = [];
  const taken = new Set();
  const perName = new Map();
  const admit = (item, limit) => {
    if (!item || taken.has(item.path)) return false;
    const used = perName.get(item.base) || 0;
    if (used >= limit) return false;
    perName.set(item.base, used + 1);
    taken.add(item.path);
    chosen.push(item);
    return true;
  };

  // Tier 1 — every root-level manifest / container / env template.
  for (const item of [...blobs].filter((entry) => entry.root && entry.criticalRank >= 0).sort((a, b) => a.criticalRank - b.criticalRank)) admit(item, 1);
  // Tier 2 — the root README plus any lockfiles a monorepo keeps per workspace.
  for (const item of [...blobs].filter((entry) => /^(package|pnpm|yarn|bun|go|cargo|poetry|uv|pipfile)\.(lock|mod|sum|toml|yaml|json)$/i.test(entry.base) || /^(bun\.lockb|uv\.lock|go\.sum|cargo\.lock)$/.test(entry.base)).sort((a, b) => a.depth - b.depth)) admit(item, 2);
  // Tier 3 — setup docs wherever they live, but never more than two of one name.
  const rest = [...blobs]
    .filter((entry) => !taken.has(entry.path))
    .filter((entry) => /(^|\/)(readme|contributing|setup|install|getting-started|quickstart|develop|dockerfile|compose|\.env\.|makefile)/i.test(entry.base) || /\.(ya?ml|toml|json)$/i.test(entry.base))
    .sort((a, b) => a.depth - b.depth || filePriority(a.path) - filePriority(b.path) || a.path.localeCompare(b.path));
  for (const item of rest) { if (chosen.length >= MAX_SCAN_FILES) break; admit(item, 2); }
  // Tier 4 — anything left, shallowest first.
  for (const item of [...blobs].filter((entry) => !taken.has(entry.path)).sort((a, b) => a.depth - b.depth)) {
    if (chosen.length >= MAX_SCAN_FILES) break;
    admit(item, 1);
  }
  return chosen.map(({ base, depth, root, criticalRank, ...item }) => item).slice(0, MAX_SCAN_FILES);
}

/** When the git trees response is truncated, the root files may be missing from it. */
const SUPPLEMENT_FILES = ['README.md', 'package.json', 'Dockerfile', 'docker-compose.yml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'Makefile', '.env.example', 'Cargo.toml'];

async function supplementTruncatedTree(repo, files, branch) {
  const have = new Set(files.map((file) => String(file.path).toLowerCase().split('/').pop()));
  const missing = SUPPLEMENT_FILES.filter((name) => !have.has(name.toLowerCase()));
  if (!missing.length) return files;
  const extra = await Promise.all(missing.slice(0, 8).map(async (name) => ({ name, content: await rawGithubHead(repo, name) })));
  const found = extra.filter((entry) => entry.content).map((entry) => ({ path: entry.name, size: entry.content.length, type: 'blob', content: entry.content }));
  return found.length ? [...found, ...files].slice(0, MAX_SCAN_FILES) : files;
}

function compactText(value, max = 4000) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}\n…` : value;
}

function detectPackageManager(files) {
  const names = new Set(files.map((file) => file.path.toLowerCase().split('/').pop()));
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  if (names.has('package-lock.json')) return 'npm';
  if (names.has('bun.lockb') || names.has('bun.lock')) return 'bun';
  return names.has('package.json') ? 'npm' : null;
}

function unique(items) { return [...new Set(items.filter(Boolean))]; }

function parseJsonFile(files, name) {
  const file = files.find((entry) => entry.path.toLowerCase().split('/').pop() === name);
  if (!file?.content) return null;
  try { return JSON.parse(file.content); } catch { return null; }
}

function heuristicGuide(repo, metadata, files) {
  const names = files.map((file) => file.path.toLowerCase().split('/').pop());
  const packageManager = detectPackageManager(files);
  const packageJson = parseJsonFile(files, 'package.json');
  const hasDocker = names.includes('dockerfile') || names.includes('docker-compose.yml') || names.includes('docker-compose.yaml');
  const hasEnv = names.some((name) => name === '.env.example' || name === '.env.sample');
  const hasPython = names.includes('requirements.txt') || names.includes('pyproject.toml') || names.includes('poetry.lock') || names.includes('setup.py');
  const hasGo = names.includes('go.mod');
  const hasRust = names.includes('cargo.toml');
  const hasRuby = names.includes('gemfile');
  const readme = files.find((file) => /^readme(\.|$)/i.test(file.path.split('/').pop()))?.content || '';
  const combined = files.map((file) => file.content || '').join('\n');
  const envKeys = unique([...combined.matchAll(/(?:^|\n)\s*([A-Z][A-Z0-9_]{2,})\s*=/g)].map((match) => match[1])).filter((key) => !['PATH', 'HOME', 'SHELL', 'NODE_ENV'].includes(key)).slice(0, 8);
  const scripts = packageJson?.scripts || {};
  const runScript = scripts.dev ? 'npm run dev' : scripts.start ? 'npm start' : scripts.serve ? 'npm run serve' : scripts.preview ? 'npm run preview' : null;
  const depEntries = packageJson ? [
    ...Object.entries(packageJson.dependencies || {}).map(([name, version]) => ({ name, version, kind: 'runtime' })),
    ...Object.entries(packageJson.devDependencies || {}).map(([name, version]) => ({ name, version, kind: 'dev' })),
  ] : [];
  const pythonInstall = names.includes('requirements.txt') ? 'python3 -m venv .venv\nsource .venv/bin/activate\npip install -r requirements.txt' : 'python3 -m venv .venv\nsource .venv/bin/activate\npip install -e .';
  const pythonRun = names.includes('main.py') ? 'python3 main.py' : names.includes('manage.py') ? 'python3 manage.py runserver' : null;
  const requirements = [];
  if (hasPython) requirements.push('Python 3.10 or newer');
  if (packageManager) requirements.push('Node.js 18 or newer');
  if (hasGo) requirements.push('Go toolchain');
  if (hasRust) requirements.push('Rust and Cargo');
  if (hasRuby) requirements.push('Ruby and Bundler');
  if (hasDocker) requirements.push('Docker Desktop or Docker Engine');
  if (envKeys.length) requirements.push('Values for the environment variables listed below');
  if (!requirements.length) requirements.push('A terminal with Git installed');

  const steps = [
    { id: 'clone', title: 'Clone the repository', command: `git clone ${repo.canonicalUrl}\ncd ${repo.repo}`, detail: 'Download the source and move into the project directory.' },
  ];
  if (hasDocker) steps.push({ id: 'docker', title: 'Start the project services', command: names.includes('docker-compose.yml') || names.includes('docker-compose.yaml') ? 'docker compose up -d' : 'docker build -t ' + repo.repo + ' .\ndocker run --rm -p 3000:3000 ' + repo.repo, detail: 'Use the repository’s container setup so local services match its expected environment.' });
  if (packageManager) steps.push({ id: 'dependencies', title: 'Install project dependencies', command: packageManager === 'pnpm' ? 'pnpm install' : packageManager === 'yarn' ? 'yarn install' : packageManager === 'bun' ? 'bun install' : 'npm install', detail: 'Install the exact libraries declared by the project manifest and lockfile.' });
  else if (hasPython) steps.push({ id: 'dependencies', title: 'Create a Python environment and install packages', command: pythonInstall, detail: 'Keep Python packages isolated from the rest of your machine.' });
  else if (hasGo) steps.push({ id: 'dependencies', title: 'Download Go modules', command: 'go mod download', detail: 'Resolve the modules declared in go.mod.' });
  else if (hasRust) steps.push({ id: 'dependencies', title: 'Fetch Rust dependencies', command: 'cargo fetch', detail: 'Download the crates required by Cargo.toml.' });
  if (hasEnv) steps.push({ id: 'env', title: 'Create your environment file', command: 'cp .env.example .env', detail: 'Start from the repository’s safe template, then replace placeholder values with your own.' });
  if (envKeys.length && !hasEnv) steps.push({ id: 'env', title: 'Configure required environment variables', command: envKeys.map((key) => `${key}=your-value`).join('\n'), detail: 'Provide the values the application reads at runtime. Never commit secrets to Git.' });
  if (packageJson?.scripts?.build) steps.push({ id: 'build', title: 'Build the application', command: 'npm run build', detail: 'Compile and validate a production-ready build before starting the app.' });
  const runCommand = runScript || pythonRun || (hasGo && names.includes('main.go') ? 'go run .' : null) || (hasRust && names.includes('src') ? 'cargo run' : null);
  if (runCommand) steps.push({ id: 'run', title: runScript ? 'Start the development server' : 'Run the application', command: runCommand, detail: 'Launch the project locally and follow the terminal output for its local URL.' });

  const depList = depEntries.length ? depEntries : unique([
    packageManager ? `${packageManager} package manager` : null,
    hasPython ? 'Python packages declared by the project' : null,
    hasDocker ? 'Container images defined by the repository' : null,
    hasGo ? 'Go modules declared in go.mod' : null,
    hasRust ? 'Rust crates declared in Cargo.toml' : null,
  ]);
  const overview = `${repo.repo} is a ${metadata.language || 'software'} repository. Git-Up scanned ${files.length} setup-related files and found ${steps.length} actions to get it running locally.`;
  const readmeHint = readme.match(/(?:install|setup|getting started|quick start)[\s\S]{0,500}/i)?.[0]?.replace(/\s+/g, ' ').trim();

  return {
    source: 'local-scan',
    analyzedAt: new Date().toISOString(),
    repository: { ...repo, name: metadata.name, description: metadata.description, stars: metadata.stargazers_count, language: metadata.language, defaultBranch: metadata.default_branch },
    summary: overview,
    confidence: files.length >= 3 ? 'high' : 'medium',
    dependencies: depList.map((item) => typeof item === 'string' ? ({ name: item, version: null, kind: item.includes('package manager') ? 'tooling' : 'runtime' }) : item),
    requirements,
    environment: envKeys,
    steps,
    explanations: steps.map((step) => ({ stepId: step.id, title: step.title, body: step.detail })),
    notes: [
      'This guide is based on a public repository scan. Review any project-specific notes in the README before using it in production.',
      ...(readmeHint ? [`README signal: ${readmeHint.slice(0, 260)}${readmeHint.length > 260 ? '…' : ''}`] : []),
    ],
    files: files.map((file) => file.path),
  };
}

function extractAiText(payload) {
  return payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || payload?.content || '';
}

// ---------------------------------------------------------------------------
// Plain-English overview (Feature 1) + Curious Explorer insights (Feature 3)
// + contextual follow-ups (Feature 4). Heuristic fallbacks keep every workflow
// usable with no AI key configured; AI prompts upgrade the same shapes.
// ---------------------------------------------------------------------------

function plainifyDescription(description, fallbackName) {
  const text = String(description || '').trim();
  if (!text) return `a shared project called ${fallbackName}`;
  // Strip common jargon tokens so the heuristic path never leaks them.
  return text
    .replace(/\bAPI\b/gi, 'helper')
    .replace(/\bendpoints?\b/gi, 'doorways')
    .replace(/\bserialization\b/gi, 'packing up information')
    .replace(/\bdependenc(?:y|ies)\b/gi, 'helper pieces')
    .replace(/\bCI\/CD\b/gi, 'automatic checks')
    .replace(/\bCLI\b/gi, 'typed command helper')
    .replace(/\bSDK\b/gi, 'helper kit')
    .replace(/\bmiddleware\b/gi, 'middle helper')
    .slice(0, 280);
}

function inferProjectKind(files, metadata) {
  const names = new Set(files.map((f) => String(f.path || '').toLowerCase().split('/').pop()));
  const combined = files.map((f) => f.content || '').join('\n').toLowerCase();
  const has = (...keys) => keys.some((k) => names.has(k));
  if (has('package.json') && /next|react|vue|nuxt|svelte|astro/.test(combined.slice(0, 20000))) return 'website';
  if (has('package.json') && /react-native|expo|flutter/.test(combined.slice(0, 20000))) return 'phone app';
  if (has('manage.py') || /django|flask|fastapi/.test(combined.slice(0, 20000))) return 'website helper';
  if (has('main.py', 'app.py') || has('requirements.txt', 'pyproject.toml')) return has('bot.py') || /discord|telegram|slack/.test(combined.slice(0, 8000)) ? 'chat helper' : 'task helper';
  if (has('cargo.toml')) return 'speed-focused helper';
  if (has('go.mod')) return 'behind-the-scenes helper';
  if (has('gemfile')) return 'website helper';
  if (has('dockerfile')) return 'ready-to-run helper';
  if ((metadata?.language || '').toLowerCase().includes('jupyter') || has('requirements.txt')) return 'notes-and-numbers helper';
  return 'helper';
}

function heuristicPlainOverview(repo, metadata, files) {
  const name = metadata?.name || repo.repo;
  const kind = inferProjectKind(files, metadata);
  const what = plainifyDescription(metadata?.description, name);
  const names = new Set(files.map((f) => String(f.path || '').toLowerCase().split('/').pop()));
  const hasReadme = [...names].some((n) => n.startsWith('readme'));
  const hasDocker = names.has('dockerfile') || names.has('docker-compose.yml') || names.has('docker-compose.yaml');
  const kindAnalogy = {
    website: `Think of it like a pre-built shop front: the shelves, signs, and till are already arranged, and you just stock it with your own goods.`,
    'phone app': `Think of it like a model home on wheels: the rooms are already laid out, and you decide the paint, furniture, and who gets a key.`,
    'website helper': `Think of it like a kitchen assistant that chops, stirs, and washes up behind the scenes while the dining room stays calm.`,
    'chat helper': `Think of it like a friendly receptionist who answers common questions the same way every time, day or night.`,
    'task helper': `Think of it like a tidy toolbox: each drawer holds one job, clearly labelled, so a boring chore becomes a single pull of a drawer.`,
    'speed-focused helper': `Think of it like a race-tuned engine: small, strong, and built to do hard work quickly without fuss.`,
    'behind-the-scenes helper': `Think of it like the plumbing in a house: you never see it, but every tap works because of it.`,
    'notes-and-numbers helper': `Think of it like a recipe book with a calculator in the margin: it shows its working and lets you taste-test each step.`,
    'ready-to-run helper': `Think of it like a lunchbox that packs itself: open it anywhere and everything inside is already in the right place.`,
    helper: `Think of it like a shared recipe box: someone wrote down steps that work, so you do not have to start from a blank page.`,
  }[kind] || `Think of it like a shared recipe box: someone wrote down steps that work, so you do not have to start from a blank page.`;
  const setupHint = hasDocker
    ? 'Getting going is mostly one big “start everything” step, like pressing the power button on a packed lunchbox.'
    : hasReadme
      ? 'Getting going is mostly following a short list in order, like following a recipe card from top to bottom.'
      : 'Getting going is mostly copying the project to your computer and following a short list in order, like unpacking a kit and laying the pieces out.';
  return {
    analogy: kindAnalogy,
    problem: `${name} exists to save you from starting from scratch. In everyday terms, it is ${what}. Instead of building every shelf and drawer yourself, you borrow this ${kind} and shape it to your needs.`,
    audience: kind === 'website' || kind === 'phone app'
      ? 'It helps shop owners, hobby makers, club organisers, students, and anyone who wants a public page without hiring a builder.'
      : kind === 'chat helper'
        ? 'It helps community hosts, teachers, small teams, and anyone who answers the same questions again and again.'
        : 'It helps curious beginners, students, small teams, and busy people who want a working starting point they can learn from and change safely.',
    howItWorks: [
      `You make your own copy of the project, the way you would photocopy a recipe before scribbling on it.`,
      `You follow the short ordered checklist in Git-Up from top to bottom — each tick is one small, visible win.`,
      `${setupHint} When it runs, you open it in your browser or terminal and try it out, then change one small thing at a time.`,
    ],
  };
}

function heuristicFollowUps(repo, metadata, files, mode = 'general') {
  const name = metadata?.name || repo.repo;
  const base = {
    general: [
      `What could I build next with my own copy of ${name}?`,
      `What should I be careful about before I change anything?`,
      `What is missing that would help a newcomer feel welcome?`,
    ],
    features: [
      `Which one of these new ideas is easiest to try first?`,
      `What would make this more fun or useful for a first-time visitor?`,
      `What small extra would make people want to share this?`,
    ],
    bugs: [
      `Which of these weak spots should I fix first?`,
      `How would I notice if something broke quietly?`,
      `What should I double-check before sharing this with others?`,
    ],
    recommendations: [
      `Which improvement would help a newcomer the most?`,
      `What should I write down first so others can help me?`,
      `What tiny polish would make this feel finished?`,
    ],
  };
  return [...(base[mode] || base.general)].slice(0, 3);
}

const INSIGHT_META = {
  features: { title: 'Feature extensions', question: 'Suggest 3–5 practical new directions for a fresh copy of this project.' },
  bugs: { title: 'Potential trouble spots', question: 'Audit this project for edge cases, weak spots, and places likely to break.' },
  recommendations: { title: 'Proactive recommendations', question: 'Recommend plain-language improvements to ease of use, guidance, and untapped potential.' },
};

function heuristicInsight(repo, metadata, files, mode) {
  const name = metadata?.name || repo.repo;
  const names = new Set(files.map((f) => String(f.path || '').toLowerCase().split('/').pop()));
  const paths = files.map((f) => f.path);
  const combined = files.map((f) => f.content || '').join('\n');
  const hasTests = paths.some((p) => /(test|spec)|\/__tests__\//i.test(p));
  const hasEnvExample = names.has('.env.example') || names.has('.env.sample');
  const envKeys = unique([...combined.matchAll(/(?:^|\n)\s*([A-Z][A-Z0-9_]{2,})\s*=/g)].map((m) => m[1])).filter((k) => !['PATH', 'HOME', 'SHELL'].includes(k));
  const hasDocker = names.has('dockerfile');
  const hasReadme = [...names].some((n) => n.startsWith('readme'));
  const readmeLen = (files.find((f) => /^readme(\.|$)/i.test(String(f.path).split('/').pop()))?.content || '').length;
  const pkg = parseJsonFile(files, 'package.json');
  const scripts = pkg?.scripts ? Object.keys(pkg.scripts) : [];
  if (mode === 'features') {
    return {
      mode, title: 'Feature extensions',
      intro: `Five down-to-earth directions for your own copy of ${name}. Each one reuses what is already here, so nothing starts from zero.`,
      bullets: [
        `Guided first run — add a friendly welcome screen with 3 sample actions, so a visitor succeeds in the first 60 seconds without reading any notes.`,
        `One-click examples — ship 2–3 ready-made examples (demo data included) so people can see “what good looks like” before changing anything.`,
        `Gentle reminders — if the project handles dates, lists, or messages, add kind nudges (empty states, confirmations) so mistakes are easy to undo.`,
        `Share-friendly copy — add a “copy my setup” button that writes out the exact steps you used, so a friend can repeat your result.`,
        `Progress keepsakes — remember where someone stopped (a simple checklist or saved view) so returning feels like picking up a bookmark, not restarting.`,
      ],
      outro: 'Tip: pick the guided first run first — it makes every other idea easier to test with real people.',
      followUps: heuristicFollowUps(repo, metadata, files, 'features'),
      source: 'local-scan',
    };
  }
  if (mode === 'bugs') {
    const bullets = [];
    if (!hasTests) bullets.push(`No safety nets found — no test files were spotted among ${files.length} setup files checked. A tiny typo could break things silently. Start with one “does it start?” check that runs before every change.`);
    if (envKeys.length && !hasEnvExample) bullets.push(`Hidden settings without a sample list — ${envKeys.slice(0, 4).join(', ')} ${envKeys.length > 1 ? 'appear' : 'appears'} in the files but there is no example list to copy. Newcomers will guess and get stuck; add a labelled sample with fake values.`);
    if (!hasDocker && scripts.length > 4) bullets.push(`Many ways to start (${scripts.slice(0, 4).join(', ')}) with no single packed box. Two people can follow different steps and get different results — write down the one blessed path.`);
    if (hasReadme && readmeLen < 800) bullets.push(`Very short front-page notes (${readmeLen} characters). Short notes mean people skip steps and blame themselves when it stalls. Add “what you need before you begin” in plain words.`);
    if (!hasReadme) bullets.push(`No front-page notes found at all. Visitors land with no map — add a 5-line “what this is, who it is for, how to try it” note at the very top.`);
    bullets.push(`Quiet breakages — places where old saved data, an expired key, or a full disk could stop the project without a clear message. Give each failure a human sentence (“Your saved list could not be opened, here is how to reset it”).`);
    bullets.push(`Crowded-door problem — if two people press “save” or “start” at the same moment, the last click may win. Decide what should happen and say it out loud in the project notes.`);
    return {
      mode, title: 'Potential trouble spots',
      intro: `Where ${name} is most likely to wobble, described without jargon so anyone on the team can act on it.`,
      bullets: bullets.slice(0, 6),
      outro: 'Fix order: safety-net check first, then the sample settings list, then clearer failure messages.',
      followUps: heuristicFollowUps(repo, metadata, files, 'bugs'),
      source: 'local-scan',
    };
  }
  // recommendations
  const bullets = [];
  bullets.push(hasReadme && readmeLen >= 800
    ? `Front-page notes exist — now add pictures. One screenshot of “working” and one of “something went wrong and how I fixed it” answers more questions than three new paragraphs.`
    : `Welcome mat is thin — add a 5-line hello at the top: what this is, who it is for, what a good first 5 minutes looks like. No background knowledge assumed.`);
  if (!hasEnvExample && envKeys.length) bullets.push(`Write down the settings list — newcomers currently have to hunt for ${envKeys.slice(0, 3).join(', ')}. A labelled sample with fake values turns a 30-minute hunt into a 2-minute copy.`);
  bullets.push(`Name the one path — if there are several ways to start, crown one “try this first” route and move the rest to an “other ways” corner. Fewer choices means more finishers.`);
  bullets.push(`Celebrate small wins — checkmarks, friendly “all done” messages, and an obvious next step keep people going. Right now finishing is quiet; make it feel like crossing a finish line.`);
  bullets.push(`Invite help kindly — add “good first jobs” (fix a typo, add one example, test on a different computer) so a stranger can contribute in under 20 minutes.`);
  return {
    mode, title: 'Proactive recommendations',
    intro: `Small, human touches that would make ${name} easier to try, trust, and share — no rebuild required.`,
    bullets: bullets.slice(0, 5),
    outro: 'Start with the welcome mat and the one blessed path; both take an afternoon and halve newcomer questions.',
    followUps: heuristicFollowUps(repo, metadata, files, 'recommendations'),
    source: 'local-scan',
  };
}

async function callAiInsight(config, repo, metadata, files, mode, question) {
  if (!config || !config.baseUrl || !config.apiKey || !config.model) return null;
  const meta = INSIGHT_META[mode] || INSIGHT_META.recommendations;
  const endpointUrl = buildProviderUrl(config.baseUrl, config.endpoint || '/chat/completions');
  const modeBrief = mode === 'features'
    ? 'Propose 3–5 practical, creative feature extensions for a NEW fork. Each bullet: bold title, one plain sentence of what it does, one of who it delights. No jargon.'
    : mode === 'bugs'
      ? 'Audit logic and architecture for edge cases, vulnerabilities, and breakage-prone areas. Each bullet names the weak spot, how it shows up in plain words, and the fix-first hint. Concrete, file-aware, no fear-mongering.'
      : 'Recommend UX improvements, missing documentation, and untapped potential. Prioritise small, high-leverage wins a non-expert can understand. No jargon.';
  const prompt = `You are Git-Up, a kind senior product engineer. Analyse this public GitHub repository and return ONLY valid JSON.\n\nJSON schema:\n{"title":"string","intro":"2-sentence plain-language intro","bullets":["4-6 specific bullets, each 1-3 sentences"],"outro":"one-sentence suggested first step","followUps":["follow-up question 1","follow-up question 2","follow-up question 3"]}\n\nRules:\n- Reference actual files/steps from the context (e.g. package.json scripts, missing tests, env handling).\n- Task (${mode}): ${question || meta.question}\n- ${modeBrief}\n- followUps must be 2–3 short, clickable, contextual questions that continue THIS topic, not generic filler.\n- Plain, warm tone. Avoid heavy jargon where possible.\n\nRepository: ${repo.canonicalUrl}\nMetadata: ${JSON.stringify({ name: metadata.name, description: metadata.description, language: metadata.language, default_branch: metadata.default_branch, topics: metadata.topics })}\n\nFiles:\n${files.map((f) => `--- ${f.path}\n${compactText(f.content, 4000)}`).join('\n')}`;
  let response;
  try {
    response = await fetchWithTimeout(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.35, messages: [{ role: 'user', content: prompt }] }),
    }, AI_CHAT_TIMEOUT_MS);
  } catch (error) {
    throw toProviderError(error);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI provider returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : '. Check the base URL, endpoint, model, and key.'}`);
  }
  const parsed = parseAiJson(extractAiText(await response.json()));
  if (!parsed || !Array.isArray(parsed.bullets)) throw new Error('The AI insight response was not valid JSON. Try again.');
  return {
    mode,
    title: String(parsed.title || meta.title).slice(0, 120),
    intro: String(parsed.intro || '').slice(0, 1200),
    bullets: parsed.bullets.map((b) => String(b)).filter(Boolean).slice(0, 7),
    outro: String(parsed.outro || '').slice(0, 600),
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map((q) => String(q)).filter(Boolean).slice(0, 3) : [],
    source: 'ai',
  };
}

/** GitHub reads are rate limited and a session hits the same repo repeatedly
 * (analyze, recover, insights), so the scan is memoised briefly. */
const contextCache = new Map();

async function scanRepositoryContext(repo) {
  let metadata;
  let files;
  let fullTreePaths = [];
  let rawBlocked = false;
  try {
    metadata = await github(`/repos/${repo.apiPath}`);
    const branch = metadata.default_branch || 'main';
    let treePayload;
    try {
      treePayload = await github(`/repos/${repo.apiPath}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    } catch { treePayload = { tree: [] }; }
    const tree = treePayload.tree || [];
    fullTreePaths = tree.filter((n) => n?.path).map((n) => n.path).filter((p) => !/(node_modules|\.git\/|dist\/|build\/|\.next\/)/i.test(p)).slice(0, 300);
    const selected = pickFiles(tree);
    const contents = await Promise.all(selected.map((entry) => rawGithub(`${repo.apiPath}/${entry.path}`, branch)));
    // Keep the file even when its body could not be read: the name alone carries
    // real signal (lockfiles, Dockerfile, .env.example), and dropping it would
    // throw away the whole scan just because one host was unreachable.
    files = selected.map((entry, index) => ({ ...entry, content: contents[index] ?? '' }));
    if (treePayload.truncated) files = await supplementTruncatedTree(repo, files, branch);
    rawBlocked = Boolean(selected.length) && contents.every((content) => !content);
  } catch (error) {
    const fallback = await fallbackRepositoryScan(repo, error);
    metadata = fallback.metadata;
    files = fallback.files;
    fullTreePaths = files.map((f) => f.path);
    rawBlocked = files.length > 0 && files.every((f) => !f.content);
  }
  return { repo, metadata, files, fullTreePaths, rawBlocked };
}

async function getRepoContext(repoUrl, { refresh = false } = {}) {
  const probe = normaliseRepoUrl(repoUrl);
  if (!refresh) {
    const hit = contextCache.get(probe.canonicalUrl);
    if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.value;
  }
  const value = await scanRepositoryContext(probe);
  contextCache.set(probe.canonicalUrl, { at: Date.now(), value });
  return value;
}

function parseAiJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Provider plumbing: every outbound request to the user's AI endpoint goes
// through here so one misbehaving provider can never take the site down.
// - buildProviderUrl avoids doubling the path when the base URL already ends
//   with the endpoint (a common paste mistake: base = .../chat/completions).
// - fetchWithTimeout aborts hung providers instead of hanging the analysis.
// - toProviderError rewrites cryptic fetch failures ("fetch failed") into an
//   actionable message that names the AI provider as the culprit.
// ---------------------------------------------------------------------------
const AI_CHAT_TIMEOUT_MS = 45_000;
const AI_MODELS_TIMEOUT_MS = 15_000;

function buildProviderUrl(baseUrl, endpoint) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const endpointValue = String(endpoint || '/chat/completions').trim() || '/chat/completions';
  if (/^https?:\/\//i.test(endpointValue)) return endpointValue;
  const suffix = endpointValue.startsWith('/') ? endpointValue : `/${endpointValue}`;
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) return base;
  return `${base}${suffix}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_CHAT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`AI provider timed out after ${Math.round(timeoutMs / 1000)}s. Check the base URL, or retry without AI (the local scan still works).`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toProviderError(error, what = 'AI provider') {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/timed out after/i.test(message)) return error;
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|Load failed/i.test(message)) {
    return new Error(`${what} is unreachable (${message || 'network error'}). Check the base URL and that the provider is running, or retry without AI.`);
  }
  return error instanceof Error ? error : new Error(String(message || `${what} request failed.`));
}

async function callAi(config, repo, metadata, files) {
  if (!config || !config.baseUrl || !config.apiKey || !config.model) return null;
  const endpointUrl = buildProviderUrl(config.baseUrl, config.endpoint || '/chat/completions');
  const prompt = `You are Git-Up, a meticulous senior developer advocate who can also explain anything to a 12-year-old. Analyze this public GitHub repository and return only valid JSON. Do not invent commands or requirements. Use the repository files as your source of truth. If uncertain, say so in notes.\n\nJSON schema:\n{\"summary\":\"string\",\"confidence\":\"high|medium|low\",\"dependencies\":[{\"name\":\"string\",\"version\":\"string|null\",\"kind\":\"runtime|dev|tooling|service\"}],\"requirements\":[\"string\"],\"environment\":[\"ENV_KEY\"],\"steps\":[{\"id\":\"stable-id\",\"title\":\"action title\",\"command\":\"shell commands or empty string\",\"detail\":\"what to do\"}],\"explanations\":[{\"stepId\":\"matching step id\",\"title\":\"short title\",\"body\":\"why this matters\"}],\"notes\":[\"caveat\"],\"anticipatedFailures\":[{\"signature\":\"short label of the failure\",\"stepId\":\"which step id it breaks\",\"symptom\":\"error text people actually paste\",\"fix\":\"the command or action that avoids it\"}],\"plainOverview\":{\"analogy\":\"one vivid real-world analogy sentence\",\"problem\":\"what everyday problem this solves, zero jargon\",\"audience\":\"who benefits, in everyday roles\",\"howItWorks\":[\"step 1 in plain words\",\"step 2\",\"step 3\"]},\"followUps\":[\"contextual follow-up question 1\",\"question 2\",\"question 3\"]}\n\nInstall-path rules (never break these):\n- steps[].id must be chosen from this vocabulary when the action matches it: clone, toolchain, services, docker, dependencies, database, env, build, dev, run, verify. Reuse the same id for the same action across revisions so progress is not lost.\n- steps[].order is an integer 0-90 placing the step in the sequence; steps with the same action must keep the same order slot.\n- anticipatedFailures: the 2-4 ways installers most often break for THIS repository, each pointing at the step id it breaks. Base them on the README, lockfiles, and Dockerfile — not on generic advice. Return an empty array if nothing specific is known.\n\nSTRICT plainOverview rules (never break these):\n- ZERO technical jargon. Never use: API, endpoints, serialization, dependencies, CI/CD, manifest, lockfile, toolchain, middleware, SDK, CLI, interface, schema, runtime, framework, repository (say \"project\" instead).\n- Write at a 12-year-old reading level. Use real-world analogies (kitchen, recipe box, library, workshop, garden, lunchbox, toolbox).\n- Cover exactly: what everyday problem it solves, who benefits (parents, teachers, shop owners, students…), how it works from a visitor's point of view in 3 short steps.\n- followUps: 2–3 short clickable questions specific to THIS project (e.g. ideas to build next, what to be careful about). Never generic filler.\n\nRepository: ${repo.canonicalUrl}\nMetadata: ${JSON.stringify({ name: metadata.name, description: metadata.description, language: metadata.language, default_branch: metadata.default_branch, topics: metadata.topics })}\n\nFiles:\n${files.map((file) => `--- ${file.path}\n${compactText(file.content, 5000)}`).join('\n')}`;
  let response;
  try {
    response = await fetchWithTimeout(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.1, messages: [{ role: 'user', content: prompt }] }),
    }, AI_CHAT_TIMEOUT_MS);
  } catch (error) {
    throw toProviderError(error);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI provider returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : '. Check the base URL, endpoint, model, and key.'}`);
  }
  const payload = await response.json();
  const parsed = parseAiJson(extractAiText(payload));
  if (!parsed) throw new Error('The AI response was not valid installation-guide JSON. Try another model.');
  return { ...parsed, source: 'ai', analyzedAt: new Date().toISOString(), repository: { ...repo, name: metadata.name, description: metadata.description, stars: metadata.stargazers_count, language: metadata.language, defaultBranch: metadata.default_branch }, files: files.map((file) => file.path) };
}

function normaliseGuide(guide, repo, metadata, files, source = 'local-scan', fullTreePaths = []) {
  const fallback = heuristicGuide(repo, metadata, files);
  const plainFallback = heuristicPlainOverview(repo, metadata, files);
  const followFallback = heuristicFollowUps(repo, metadata, files, 'general');
  const validPlain = (value) => value && typeof value.analogy === 'string' && typeof value.problem === 'string' && typeof value.audience === 'string' && Array.isArray(value.howItWorks) && value.howItWorks.length;
  return {
    ...fallback,
    ...guide,
    source: guide?.source || source,
    repository: { ...fallback.repository, ...(guide?.repository || {}) },
    dependencies: Array.isArray(guide?.dependencies) && guide.dependencies.length ? guide.dependencies : fallback.dependencies,
    requirements: Array.isArray(guide?.requirements) && guide.requirements.length ? guide.requirements : fallback.requirements,
    environment: Array.isArray(guide?.environment) ? guide.environment : fallback.environment,
    steps: decorateSteps(Array.isArray(guide?.steps) && guide.steps.length ? guide.steps.map((step, index) => ({ ...step, id: String(step.id || `step-${index + 1}`), title: step.title || `Installation step ${index + 1}`, command: step.command || '', detail: step.detail || '' })) : fallback.steps, 'base'),
    anticipatedFailures: Array.isArray(guide?.anticipatedFailures) ? guide.anticipatedFailures.filter((item) => item && (item.signature || item.symptom)).slice(0, 6).map((item) => ({ signature: String(item.signature || '').slice(0, 90), stepId: String(item.stepId || ''), symptom: String(item.symptom || '').slice(0, 240), fix: String(item.fix || '').slice(0, 240) })) : [],
    explanations: Array.isArray(guide?.explanations) ? guide.explanations : fallback.explanations,
    notes: Array.isArray(guide?.notes) ? guide.notes : fallback.notes,
    files: files.map((file) => file.path),
    fileTree: Array.isArray(fullTreePaths) && fullTreePaths.length ? [...new Set(fullTreePaths)].slice(0, 300) : files.map((file) => file.path),
    plainOverview: validPlain(guide?.plainOverview) ? guide.plainOverview : plainFallback,
    followUps: Array.isArray(guide?.followUps) && guide.followUps.length ? guide.followUps.map(String).filter(Boolean).slice(0, 3) : followFallback,
  };
}

async function analyzeRepository(body) {
  const expertise = EXPERTISE_LEVELS.some((level) => level.id === body?.expertise) ? body.expertise : 'some';
  const { repo, metadata, files, fullTreePaths, rawBlocked } = await getRepoContext(body.repoUrl);
  let scanNotice = '';
  if ((files.length <= 2) && fullTreePaths.length <= 2) scanNotice = '';
  // AI upgrades the guide but must never break it: any provider failure
  // (bad key, wrong endpoint, rate limit, offline) falls back to the local
  // scan with a visible warning instead of failing the whole analysis.
  let aiGuide = null;
  let aiWarning = '';
  if (body.config) {
    try {
      aiGuide = await callAi(body.config, repo, metadata, files);
    } catch (error) {
      aiWarning = error instanceof Error ? error.message : 'The AI provider could not answer.';
    }
  }
  const guide = normaliseGuide(aiGuide, repo, metadata, files, aiGuide ? 'ai' : 'local-scan', fullTreePaths);
  if (aiWarning) guide.notes = [`AI review unavailable (${aiWarning.slice(0, 220)}). Showing the local scan instead — check the AI provider settings and retry for a deeper review.`, ...(guide.notes || [])];

  // Feature 2 → read the repository's own failure history before shaping the path.
  const failureScan = await scanInstallFailures({ repo, metadata, files, github, token: process.env.GITHUB_TOKEN });
  mergeAnticipatedFailures(guide, failureScan);

  // Feature 6 → health score from the same evidence, with no model involvement.
  const ci = await fetchCiSignal({ repo, github, metadata });
  const health = computeHealth({ repo, metadata, files, failureScan, ci });

  // Feature 3 → decision graph; Feature 2's findings folded into the steps.
  const packageManager = detectPackageManager(files);
  const scripts = parseJsonFile(files, 'package.json')?.scripts || {};
  const patched = patchStepsForFailures(guide.steps, failureScan);
  guide.steps = patched.steps;
  guide.pathGraph = buildPathGraph({ repo, metadata, files, packageManager, scripts, failureScan });
  guide.defaultPath = composeSteps(guide.steps, guide.pathGraph, guide.pathGraph.defaults);
  guide.failurePatches = patched.patches;
  guide.pathPatches = patchNotesFor(failureScan, guide.steps);

  // Feature 4 → the contract, built after health so its caps can appear as terms.
  guide.contract = buildContract({ repo, metadata, files, steps: guide.defaultPath, health, failureScan, source: guide.source });
  guide.health = health;
  guide.failureScan = slimFailureScan(failureScan);
  guide.verdict = healthVerdict(health);
  guide.session = { revision: 1, startedAt: new Date().toISOString(), checked: {}, failures: [], revisions: [] };
  guide.expertiseOptions = EXPERTISE_LEVELS;

  // Feature 5 → reshape explanation depth and warning volume for this reader.
  guide.tuning = { steps: guide.steps, notes: guide.notes, plainOverview: guide.plainOverview, notesWithSeverity: undefined };
  const tuned = tuneGuide(guide, expertise);

  // The AI warning is unshifted post-tune on purpose: tuneGuide drops
  // low-severity notes for the default reader, and this one must stay visible.
  if (aiWarning && !tuned.notes.some((note) => String(note).startsWith('AI review unavailable'))) tuned.notes.unshift(`AI review unavailable (${aiWarning.slice(0, 220)}). Showing the local scan instead — check the AI provider settings and retry for a deeper review.`);
  if (rawBlocked) tuned.notes.unshift('File contents could not be downloaded from this network, so the scan used the repository’s file names only. Versions and dependency counts in the contract are therefore unavailable rather than wrong.');
  if (scanNotice && !tuned.notes.includes(scanNotice)) tuned.notes.unshift(scanNotice);
  if (!fullTreePaths.length) tuned.notes.unshift('Full folder listing was unavailable; showing inspected setup files only.');
  return tuned;
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}

/** Fold AI-predicted failures into the ranked list, labelled as predictions. */
function mergeAnticipatedFailures(guide, failureScan) {
  const predicted = Array.isArray(guide?.anticipatedFailures) ? guide.anticipatedFailures : [];
  if (!predicted.length) return;
  const known = new Set((failureScan.patterns || []).map((pattern) => String(pattern.id || '')));
  const extra = predicted
    .filter((item) => item.signature && !known.has(slugify(item.signature)))
    .slice(0, 3)
    .map((item, index) => ({
      rank: (failureScan.patterns?.length || 0) + index + 1,
      id: slugify(item.signature) || `predicted-${index + 1}`,
      label: item.signature,
      why: item.symptom || 'Predicted from the repository files.',
      patchStepId: item.stepId || undefined,
      commands: item.fix ? [item.fix] : [],
      count: 0,
      openCount: 0,
      weight: 1,
      origin: 'predicted',
      threads: [],
    }));
  if (!extra.length) return;
  failureScan.patterns = [...(failureScan.patterns || []), ...extra].slice(0, 6).map((pattern, position) => ({ ...pattern, rank: position + 1 }));
}

/** Trim thread evidence so a persisted guide stays light in localStorage. */
function slimFailureScan(scan) {
  return {
    available: Boolean(scan?.available),
    notice: scan?.notice || '',
    sources: scan?.sources || {},
    sampled: scan?.sampled || {},
    totalThreads: scan?.totalThreads || 0,
    installRelated: scan?.installRelated || 0,
    openIssuesTotal: scan?.openIssuesTotal || 0,
    patterns: (scan?.patterns || []).map((pattern) => ({
      rank: pattern.rank,
      id: pattern.id,
      label: pattern.label,
      why: pattern.why,
      origin: pattern.origin,
      count: pattern.count,
      openCount: pattern.openCount,
      patchStepId: pattern.patchStepId,
      commands: (pattern.commands || []).slice(0, 2),
      threads: (pattern.threads || []).slice(0, 3).map((thread) => ({ number: thread.number, title: thread.title, url: thread.url, state: thread.state, isPr: thread.isPr, comments: thread.comments })),
    })),
  };
}

/** Never trust client-supplied step objects wholesale. */
function sanitiseStepList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((entry, index) => ({
    id: String(entry?.id || `step-${index + 1}`).slice(0, 60),
    key: String(entry?.key || entry?.id || `step-${index + 1}`).slice(0, 60),
    title: String(entry?.title || '').slice(0, 160),
    command: String(entry?.command || '').slice(0, 4000),
    detail: String(entry?.detail || '').slice(0, 800),
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : (index + 1) * 10,
  }));
}

/**
 * Feature 1 endpoint: a step failed, the user pasted what happened, and the path
 * from that step onward is rebuilt. Completed steps are never returned.
 */
async function analyzeRecovery(body) {
  const failedStepId = String(body?.failedStepId || '').slice(0, 60);
  const errorText = String(body?.errorText || '').slice(0, 12_000);
  if (!body?.repoUrl) throw new Error('A repository URL is required to recover a failed step.');
  const { repo, metadata, files } = await getRepoContext(body.repoUrl, { refresh: Boolean(body.refresh) });
  const guide = body.guide && typeof body.guide === 'object' ? body.guide : {};
  const completed = sanitiseStepList(body.completedSteps);
  const remaining = sanitiseStepList(body.remainingSteps);
  const failedStep = completed.find((entry) => entry.id === failedStepId)
    || remaining.find((entry) => entry.id === failedStepId)
    || sanitiseStepList(guide.steps).find((entry) => entry.id === failedStepId)
    || { id: failedStepId || 'failed-step', title: 'The failed step', command: '', detail: '' };
  const expertise = EXPERTISE_LEVELS.some((level) => level.id === body?.expertise) ? body.expertise : 'some';
  const recovery = await recoverPath({
    config: body.config?.apiKey && body.config?.model ? body.config : null,
    repo,
    metadata,
    files,
    failedStep,
    errorText,
    remainingSteps: remaining.length ? remaining : [failedStep],
    completedSteps: completed,
    requirements: Array.isArray(guide.requirements) ? guide.requirements.slice(0, 8) : [],
    expertise,
    failureScan: guide.failureScan,
  });
  return {
    ...recovery,
    failedStep,
    revision: Number(body?.revision || 1) + 1,
    repository: { canonicalUrl: repo.canonicalUrl, name: metadata?.name || repo.repo },
    generatedAt: new Date().toISOString(),
  };
}

async function analyzeInsight(body) {
  const mode = ['features', 'bugs', 'recommendations', 'custom'].includes(body.mode) ? body.mode : 'recommendations';
  const question = typeof body.question === 'string' ? body.question.slice(0, 2000) : '';
  if (!body.repoUrl) throw new Error('A repository URL is required for insights.');
  const { repo, metadata, files } = await getRepoContext(body.repoUrl);
  const effectiveMode = mode === 'custom' ? (body.baseMode && INSIGHT_META[body.baseMode] ? body.baseMode : 'recommendations') : mode;
  if (body.config?.apiKey && body.config?.model) {
    try {
      const ai = await callAiInsight(body.config, repo, metadata, files, effectiveMode, question || undefined);
      if (ai) {
        if (mode === 'custom' && question) ai.title = `Answer: ${question.slice(0, 80)}`;
        ai.mode = mode;
        return ai;
      }
    } catch (error) {
      // Fall through to heuristic so the button never dead-ends; surface AI error in outro.
      const fallback = heuristicInsight(repo, metadata, files, effectiveMode);
      fallback.mode = mode;
      if (mode === 'custom' && question) fallback.title = `Answer: ${question.slice(0, 80)}`;
      fallback.outro = `${fallback.outro} (Live AI answer unavailable: ${error.message})`;
      return fallback;
    }
  }
  const fallback = heuristicInsight(repo, metadata, files, effectiveMode);
  fallback.mode = mode;
  if (mode === 'custom' && question) {
    fallback.title = `Answer: ${question.slice(0, 80)}`;
    fallback.intro = `Here is a down-to-earth take on “${question}” for this project, based on the files Git-Up could see. Connect an AI provider in the top-right settings for a deeper file-aware answer.`;
  }
  return fallback;
}

function safeUpstreamUrl(base, path = '') {
  let url;
  try { url = new URL(base); } catch { throw new Error('Enter a valid AI base URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The AI base URL must use HTTP or HTTPS.');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${url.toString().replace(/\/$/, '')}${suffix}`;
}

async function fetchModels(body) {
  if (!body.baseUrl || !body.apiKey) throw new Error('Base URL and API key are required to fetch models.');
  const endpoint = body.modelsEndpoint || '/models';
  const url = safeUpstreamUrl(body.baseUrl, endpoint);
  let response;
  try {
    response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${body.apiKey}`, Accept: 'application/json' } }, AI_MODELS_TIMEOUT_MS);
  } catch (error) {
    throw toProviderError(error, 'AI provider');
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 180); } catch { /* ignore */ }
    throw new Error(`Model request returned ${response.status}${detail ? `: ${detail}` : '. Check the base URL and key.'}`);
  }
  const payload = await response.json();
  const models = Array.isArray(payload) ? payload : payload.data || payload.models || [];
  // OpenAI uses {id}, Ollama uses {name}/{model}, some proxies return plain strings.
  return models.map((model) => typeof model === 'string' ? model : (model.id || model.name || model.model)).filter(Boolean).sort();
}

function sendProgress(res, phase, label, percent) {
  const payload = `data: ${JSON.stringify({ phase, label, percent })}\n\n`;
  res.write(payload);
  try { res.socket?.write(''); } catch { /* client gone */ }
}

async function analyzeStream(req, res, body) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('\n');

  // NOTE: a previous change tried `req.socket.writableHighWaterMark = 256`
  // here to defeat buffering. That assignment throws on modern Node
  // (writableHighWaterMark is getter-only) and — because it ran before the
  // try block and handleApi re-threw it — crashed the whole server process
  // on every stream request. Removed: writeHead + flushHeaders is what makes
  // SSE events arrive promptly; each res.write() is flushed by Node.
  const send = (phase, label, percent) => { try { sendProgress(res, phase, label, percent); } catch { /* client gone */ } };
  const done = () => {
    try { res.end(); } catch { /* ignore */ }
  };

  try {
    const expertise = EXPERTISE_LEVELS.some((level) => level.id === body?.expertise) ? body.expertise : 'some';
    send('repository', 'Reading repository metadata…', 10);
    const { repo, metadata, files, fullTreePaths, rawBlocked } = await getRepoContext(body.repoUrl);
    send('files', 'Scanning setup files…', 25);

    let scanNotice = '';
    if (!((files.length <= 2) && fullTreePaths.length <= 2)) scanNotice = '';
    // Same fallback as /api/analyze: a failing provider must not fail the stream.
    let aiGuide = null;
    let aiWarning = '';
    if (body.config) {
      try {
        aiGuide = await callAi(body.config, repo, metadata, files);
      } catch (error) {
        aiWarning = error instanceof Error ? error.message : 'The AI provider could not answer.';
      }
    }
    send('ai', aiGuide ? 'Reviewing with AI…' : 'Building local guide…', 45);
    const guide = normaliseGuide(aiGuide, repo, metadata, files, aiGuide ? 'ai' : 'local-scan', fullTreePaths);
    if (aiWarning) guide.notes = [`AI review unavailable (${aiWarning.slice(0, 220)}). Showing the local scan instead — check the AI provider settings and retry for a deeper review.`, ...(guide.notes || [])];

    send('failures', 'Checking failure history…', 55);
    const failureScan = await scanInstallFailures({ repo, metadata, files, github, token: process.env.GITHUB_TOKEN });
    mergeAnticipatedFailures(guide, failureScan);

    send('health', 'Computing health score…', 65);
    const ci = await fetchCiSignal({ repo, github, metadata });
    const health = computeHealth({ repo, metadata, files, failureScan, ci });

    send('path', 'Composing install path…', 78);
    const packageManager = detectPackageManager(files);
    const scripts = parseJsonFile(files, 'package.json')?.scripts || {};
    const patched = patchStepsForFailures(guide.steps, failureScan);
    guide.steps = patched.steps;
    guide.pathGraph = buildPathGraph({ repo, metadata, files, packageManager, scripts, failureScan });
    guide.defaultPath = composeSteps(guide.steps, guide.pathGraph, guide.pathGraph.defaults);
    guide.failurePatches = patched.patches;
    guide.pathPatches = patchNotesFor(failureScan, guide.steps);

    send('contract', 'Building install contract…', 90);
    guide.contract = buildContract({ repo, metadata, files, steps: guide.defaultPath, health, failureScan, source: guide.source });
    guide.health = health;
    guide.failureScan = slimFailureScan(failureScan);
    guide.verdict = healthVerdict(health);
    guide.session = { revision: 1, startedAt: new Date().toISOString(), checked: {}, failures: [], revisions: [] };
    guide.expertiseOptions = EXPERTISE_LEVELS;

    send('tuning', 'Tuning for your level…', 95);
    guide.tuning = { steps: guide.steps, notes: guide.notes, plainOverview: guide.plainOverview, notesWithSeverity: undefined };
    const tuned = tuneGuide(guide, expertise);

    // Post-tune so the reader-level note filter cannot drop this warning.
    if (aiWarning && !tuned.notes.some((note) => String(note).startsWith('AI review unavailable'))) tuned.notes.unshift(`AI review unavailable (${aiWarning.slice(0, 220)}). Showing the local scan instead — check the AI provider settings and retry for a deeper review.`);
    if (rawBlocked) tuned.notes.unshift('File contents could not be downloaded from this network, so the scan used the repository\'s file names only. Versions and dependency counts in the contract are therefore unavailable rather than wrong.');
    if (scanNotice && !tuned.notes.includes(scanNotice)) tuned.notes.unshift(scanNotice);
    if (!fullTreePaths.length) tuned.notes.unshift('Full folder listing was unavailable; showing inspected setup files only.');

    send('done', 'Analysis complete', 100);
    res.write(`data: ${JSON.stringify({ phase: 'result', guide: tuned })}\n\n`);
    done();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ phase: 'error', error: error instanceof Error ? error.message : 'Something went wrong.' })}\n\n`);
    done();
  }
}

async function handleApi(req, res, pathname) {
  try {
    const body = await readBody(req);
    if (req.method === 'POST' && pathname === '/api/analyze') return sendJson(res, 200, { ok: true, guide: await analyzeRepository(body) });
    // Awaited (not bare `return promise`) so a stream failure is caught below
    // instead of escaping as an unhandled rejection that kills the server.
    if (req.method === 'POST' && pathname === '/api/analyze-stream') { await analyzeStream(req, res, body); return; }
    if (req.method === 'POST' && pathname === '/api/insight') return sendJson(res, 200, { ok: true, insight: await analyzeInsight(body) });
    if (req.method === 'POST' && pathname === '/api/models') return sendJson(res, 200, { ok: true, models: await fetchModels(body) });
    if (req.method === 'POST' && pathname === '/api/recover') return sendJson(res, 200, { ok: true, recovery: await analyzeRecovery(body) });
    if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'git-up', version: '2.0.0', features: FEATURE_FLAGS, githubToken: Boolean(process.env.GITHUB_TOKEN) });
    return sendJson(res, 404, { ok: false, error: 'Not found.' });
  } catch (error) {
    // The SSE stream owns its socket once headers are sent; writing JSON here
    // would crash with ERR_STREAM_WRITE_AFTER_END. Only reply if untouched.
    if (res.headersSent || res.writableEnded) { try { res.end(); } catch { /* ignore */ } return; }
    return sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' });
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (requested.includes('..')) return sendText(res, 400, 'Bad request');
  // Brand assets live in /assets/logo/ at the repo root, but the client
  // requests them as /assets/logo/.... Serve that prefix from ASSETS_DIR so
  // the mode-wise logos resolve; everything else serves from public/.
  const isBrandAsset = requested === 'assets' || requested.startsWith('assets/');
  const baseDir = isBrandAsset ? ASSETS_DIR : PUBLIC_DIR;
  const relative = isBrandAsset ? requested.slice('assets/'.length) : requested;
  if (isBrandAsset && (!relative || relative.endsWith('/'))) return sendText(res, 404, 'Not found');
  const fileUrl = new URL(relative, baseDir);
  try {
    const file = await import('node:fs/promises').then((fs) => fs.readFile(fileUrl));
    const ext = requested.slice(requested.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(file);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url.pathname);
  if (req.method !== 'GET') return sendText(res, 405, 'Method not allowed');
  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  const preview = process.env.E2B_SANDBOX_ID ? `https://${PORT}-${process.env.E2B_SANDBOX_ID}.e2b.app` : `http://localhost:${PORT}`;
  console.log(`Git-Up listening on ${preview}`);
  console.log(`Bound to ${HOST}:${PORT} for local and preview traffic.`);
});
