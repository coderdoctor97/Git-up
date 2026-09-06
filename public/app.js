import { composeSteps, keyOf, progressOf, applyRevision, revisionEntry, selectionsLabel, EXPERTISE_LEVELS, tuneGuide } from './path-engine.js';
import { bindTickers, bindReveals } from './magic.js';
import { initParticles } from './particles-workspace.js';
import { initTopbarContributions } from './topbar-contributions.js';
import { icon } from './icons.js';
import { AI_CONNECTION, AI_PROVIDER, activeConnectionState, connectionPresentation, customConfigReady, normaliseAiProvider } from './ai/ai-provider.js';
import { aiService } from './ai/ai-service.js';
import { POLLINATIONS_DEFAULT_MODEL } from './ai/pollinations-provider.js';

const root = document.querySelector('#app');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
/** Strip key-like secrets from anything rendered back to the page (banners, insights, recovery notes). */
function redactSecrets(value) {
  return String(value ?? '')
    .replace(/sk[-_][A-Za-z0-9-_]{8,}/g, '[redacted-key]')
    .replace(/gh[pousr]_[A-Za-z0-9]{8,}/g, '[redacted-token]')
    .replace(/AKIA[0-9A-Z]{12,}/g, '[redacted-key]')
    .replace(/xox[bpas]-[A-Za-z0-9-]{6,}/g, '[redacted-token]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-private-key]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]{12,}/g, 'Bearer [redacted]');
}
function safe(value) { return esc(redactSecrets(value)); }
function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); } catch { return 'Just now'; }
}
function uid() { return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function shortName(guide) { return guide?.repository?.name || guide?.repository?.repo || 'Repository'; }
function loadJson(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function displayName(entry) { return (entry?.label || '').trim() || entry?.name || entry?.url || 'Repository'; }
function persistHistory() { try { localStorage.setItem('git-up-history', JSON.stringify(state.history.slice(0, 20))); } catch { /* ignore */ } }
const savedSettings = loadJson('git-up-settings', {});
const savedActiveProvider = normaliseAiProvider(savedSettings?.activeProvider);
let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('git-up-theme') || 'dark'; } catch { /* ignore */ }
if (savedTheme !== 'light' && savedTheme !== 'dark') savedTheme = 'dark';
const rawHistory = loadJson('git-up-history', []);
const savedHistory = (Array.isArray(rawHistory) ? rawHistory : []).map((entry) => ({
  id: entry.id || uid(),
  url: entry.url,
  name: entry.name || entry.url,
  label: entry.label || '',
  analyzedAt: entry.analyzedAt,
  guide: entry.guide,
  session: entry.session && typeof entry.session === 'object' ? entry.session : null,
})).filter((entry) => entry.url && entry.guide);

const state = {
  mode: 'empty',
  repoUrl: '',
  guide: null,
  checked: {},
  explanationIndex: 0,
  modal: null,
  lastFocusId: '',
  error: '',
  toast: null,
  settings: { baseUrl: savedSettings.baseUrl || 'https://api.openai.com/v1', endpoint: savedSettings.endpoint || '/chat/completions', model: savedSettings.model || '', apiKey: sessionStorage.getItem('git-up-api-key') || '' },
  modelOptions: Array.isArray(savedSettings.modelOptions) ? savedSettings.modelOptions : [],
  ai: {
    activeProvider: savedActiveProvider,
    pollinationsStatus: AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED,
    customError: false,
    busy: '',
    message: '',
    authorization: null,
  },
  history: savedHistory,
  secretVisible: false,
  // Oreo the cat bot — floating messenger chatbot (replaces the old inline explorer)
  chat: { open: false, messages: [], typing: false, tipIndex: 0, input: '', hidden: false, muted: false, pos: null, panelPos: null },
  // v2 features: living path, graph, contract, reader mode
  expertise: 'some',
  pathSelections: {},
  failures: [],
  revisions: [],
  superseded: [],
  contractChecked: {},
  failure: { stepId: '', errorText: '', note: '', saving: false, error: '' },
  recovery: null,
  resumeNote: '',
  showHiddenNotes: false,
  // Feature 2: sidebar menus + file tree
  openMenuId: null,
  renamingId: null,
  renameDraft: '',
  expandedDirs: {},
  treeFilter: '',
  // Daylight / dark mode
  theme: savedTheme,
  // Analysis progress
  progress: { phase: '', label: '', percent: 0, error: '' },
};

// Persist the safe default when a removed or unknown provider id is found.
if (Object.prototype.hasOwnProperty.call(savedSettings || {}, 'activeProvider')
  && savedSettings.activeProvider !== savedActiveProvider) persistAiSettings();

function hasCustomAiConfig() { return customConfigReady(state.settings); }
function aiConnection() {
  return activeConnectionState({
    activeProvider: state.ai.activeProvider,
    customReady: hasCustomAiConfig(),
    customError: state.ai.customError,
    pollinationsStatus: state.ai.pollinationsStatus,
  });
}
function hasAiConfig() {
  const connection = aiConnection();
  return connection === AI_CONNECTION.CUSTOM_CONNECTED || connection === AI_CONNECTION.POLLINATIONS_CONNECTED;
}
function persistAiSettings() {
  try {
    localStorage.setItem('git-up-settings', JSON.stringify({
      baseUrl: state.settings.baseUrl,
      endpoint: state.settings.endpoint,
      model: state.settings.model,
      modelOptions: state.modelOptions,
      activeProvider: state.ai.activeProvider,
    }));
  } catch { /* storage can be disabled without breaking the current session */ }
}
function providerSummary() {
  if (state.ai.activeProvider === AI_PROVIDER.POLLINATIONS) {
    return state.ai.pollinationsStatus === AI_CONNECTION.POLLINATIONS_CONNECTED ? 'AI review via Git-Up Free AI' : 'Git-Up Free AI selected (authorization required)';
  }
  return hasCustomAiConfig() ? `AI review via configured provider (model ${state.settings.model || 'unknown'})` : 'heuristic fallback (no AI configured)';
}
const FREE_AI_AUTH_REQUIRED_CODES = new Set([
  'auth-required',
  'auth-expired',
  'authorization-cancelled',
  'authorization-denied',
  'authorization-expired',
]);
async function generateAI(operation, payload, onProgress = () => {}) {
  const provider = state.ai.activeProvider;
  try {
    const result = await aiService.generate({ provider, operation, payload, config: state.settings, onProgress });
    if (provider === AI_PROVIDER.POLLINATIONS) state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTED;
    else state.ai.customError = false;
    return result;
  } catch (error) {
    if (provider === AI_PROVIDER.POLLINATIONS) {
      state.ai.pollinationsStatus = FREE_AI_AUTH_REQUIRED_CODES.has(error?.code)
        ? AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED
        : AI_CONNECTION.POLLINATIONS_ERROR;
      console.error('Git-Up Free AI request failed', { code: error?.code || 'request-failed', type: error?.name || 'Error' });
      throw new Error(`Free AI: ${aiService.freeAiMessage(error)}`);
    }
    throw error;
  }
}
function sourceLabel() { return state.guide?.source === 'ai' ? 'AI reviewed' : 'Local scan'; }
function showToast(message, type = 'success') {
  state.toast = { message, type };
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { state.toast = null; render(); }, 3300);
}

/** Classify a failed analysis into a titled, actionable state instead of one generic banner. */
function errorKindOf(message) {
  const text = String(message || '');
  if (/rate limit/i.test(text)) return { title: 'GitHub rate limit reached', hint: 'Add a server GitHub token, or wait an hour. File-name evidence is still usable.' };
  if (/private|not found/i.test(text)) return { title: 'Repository not found or private', hint: 'Git-Up scans public repositories. Check the owner and name, or make the repo public first.' };
  if (/Free AI/i.test(text)) return { title: 'Free AI is unavailable', hint: 'Retry, reconnect Pollinations, or choose Custom API from AI settings. Git-Up will not switch providers without you.' };
  if (/AI provider|model|endpoint|base URL|key/i.test(text)) return { title: 'AI provider hiccup', hint: 'The heuristic guide still works with no key. Check the provider settings and retry.' };
  if (/URL|github\.com|owner/i.test(text)) return { title: 'Check the repository URL', hint: 'HTTPS, SSH, and git@ forms all work, for example https://github.com/owner/repo.' };
  if (/network|fetch|failed/i.test(text)) return { title: 'Network problem', hint: 'Check your connection and try again. Recent analyses are kept in history.' };
  return { title: 'Analysis failed', hint: 'Check the URL and try again. Nothing was saved for this attempt.' };
}

function topbar() {
  const connection = connectionPresentation(aiConnection());
  const toLight = state.theme !== 'light';
  return `<header class="topbar">
    <div id="topbar-contrib" aria-hidden="true"></div>
    <a class="brand" href="#" data-action="new-analysis" aria-label="Git-Up home">
      <span class="brand-logo">
        <img class="brand-img brand-img--dark" src="/assets/logo/icon_Dark_mode.png" alt="" width="56" height="56" fetchpriority="high" decoding="async" />
        <img class="brand-img brand-img--light" src="/assets/logo/icon_light_mode.png" alt="" width="56" height="56" fetchpriority="high" decoding="async" />
      </span><span class="brand-word">git-<em>up</em></span>
      <span class="brand-sub">living install paths</span>
    </a>
    <div class="topbar-center"><span>Route</span><span class="slash">/</span><strong>${state.mode === 'analysis' ? esc(displayName({ label: '', name: shortName(state.guide) })) : 'New analysis'}</strong></div>
    <div class="topbar-actions">
      <button type="button" class="connection-pill" data-action="settings" aria-label="AI status: ${esc(connection.label)}. Open AI settings"><i class="status-dot ${connection.tone}" aria-hidden="true"></i><span>${esc(connection.label)}</span></button>
      <button class="icon-button" data-action="palette" aria-label="Open command menu (Ctrl K)" title="Command menu (Ctrl K)">${icon('command', 18)}</button>
      <button class="icon-button" data-action="theme" aria-label="${toLight ? 'Switch to daylight mode' : 'Switch to dark mode'}" title="${toLight ? 'Daylight mode' : 'Dark mode'}">${icon(toLight ? 'sun' : 'moon', 18)}</button>
      <button class="icon-button" data-action="settings" aria-label="Open AI settings" title="AI settings">${icon('aiSettings', 18)}</button>
    </div>
  </header>`;
}

// --- Feature 2: file-tree helpers -------------------------------------------
function treePaths() {
  const guide = state.guide;
  if (!guide) return [];
  const list = Array.isArray(guide.fileTree) && guide.fileTree.length ? guide.fileTree : (guide.files || []);
  const filter = state.treeFilter.trim().toLowerCase();
  const cleaned = [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return filter ? cleaned.filter((p) => p.toLowerCase().includes(filter)) : cleaned;
}
function buildTree(paths) {
  const rootNode = { dirs: {}, files: [] };
  for (const full of paths) {
    const parts = String(full).split('/').filter(Boolean);
    let node = rootNode;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      // Heuristic: treat last segment as file unless path clearly continues elsewhere.
      if (isLast) {
        const looksLikeDir = paths.some((p) => p !== full && p.startsWith(`${full}/`));
        if (looksLikeDir) {
          if (!node.dirs[part]) node.dirs[part] = { dirs: {}, files: [], fullPath: [...parts.slice(0, i + 1)].join('/') };
          node = node.dirs[part];
        } else {
          node.files.push({ name: part, full });
        }
      } else {
        if (!node.dirs[part]) node.dirs[part] = { dirs: {}, files: [], fullPath: parts.slice(0, i + 1).join('/') };
        node = node.dirs[part];
      }
    }
  }
  return rootNode;
}
function isExpanded(path, depth) {
  if (path in state.expandedDirs) return state.expandedDirs[path];
  return depth < 1;
}
function treeNodeHtml(node, depth = 0) {
  const dirNames = Object.keys(node.dirs).sort((a, b) => a.localeCompare(b));
  const fileItems = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
  let html = '';
  for (const name of dirNames) {
    const child = node.dirs[name];
    const expanded = isExpanded(child.fullPath, depth);
    const count = Object.keys(child.dirs).length + child.files.length;
    html += `<div class="tree-dir">
      <button class="tree-row dir" data-action="toggle-dir" data-path="${esc(child.fullPath)}" aria-expanded="${expanded}">
        <span class="tree-caret ${expanded ? 'open' : ''}">${icon('chevron', 11)}</span>
        <span class="tree-ic dir">${icon('folder', 13)}</span>
        <span class="tree-name">${esc(name)}</span>
        <span class="tree-count">${count}</span>
      </button>
      ${expanded ? `<div class="tree-children">${treeNodeHtml(child, depth + 1)}</div>` : ''}
    </div>`;
  }
  for (const file of fileItems) {
    html += `<div class="tree-row file" title="${esc(file.full)}"><span class="tree-ic file">${icon('file', 12)}</span><span class="tree-name mono">${esc(file.name)}</span></div>`;
  }
  return html || '<div class="tree-empty">No files match.</div>';
}
function fileTreePanel() {
  if (state.mode !== 'analysis' || !state.guide) return '';
  const paths = treePaths();
  const tree = buildTree(paths);
  const topCounts = Object.keys(tree.dirs).length + tree.files.length;
  return `<div class="side-section" id="route-files">
    <div class="side-section-head"><p class="sidebar-label">Files</p><span class="side-count">${paths.length}</span></div>
    <input class="tree-filter" id="tree-filter" placeholder="Filter files…" value="${esc(state.treeFilter)}" aria-label="Filter file tree" />
    <div class="file-tree" role="region" aria-label="Repository file tree">${treeNodeHtml(tree)}</div>
    ${!paths.length ? '<div class="history-empty">No file listing available for this analysis.</div>' : `<div class="tree-foot">${topCounts} top-level ${topCounts === 1 ? 'entry' : 'entries'} · click a folder to expand</div>`}
  </div>`;
}

function sidebar() {
  const historyHtml = state.history.length ? state.history.slice(0, 8).map((entry) => {
    const isActive = state.mode === 'analysis' && state.repoUrl === entry.url;
    const menuOpen = state.openMenuId === entry.id;
    const renaming = state.renamingId === entry.id;
    if (renaming) {
      return `<div class="history-entry renaming ${isActive ? 'active' : ''}">
        <span class="history-icon">${icon('history', 14)}</span>
        <input class="rename-input" id="rename-input" value="${esc(state.renameDraft)}" maxlength="60" aria-label="Rename repository label" />
        <button class="mini-btn save" data-action="history-rename-save" data-id="${esc(entry.id)}" title="Save label" aria-label="Save label">${icon('check', 12)}</button>
        <button class="mini-btn" data-action="history-rename-cancel" title="Cancel" aria-label="Cancel rename">${icon('close', 12)}</button>
      </div>`;
    }
    return `<div class="history-row ${isActive ? 'active' : ''}">
      <button class="history-entry" data-history-id="${esc(entry.id)}" title="${esc(entry.url)}"><span class="history-icon">${icon('history', 14)}</span><span class="history-name">${esc(displayName(entry))}</span>${entry.label ? `<span class="history-sub">${esc(entry.name || entry.url)}</span>` : ''}</button>
      <div class="menu-wrap">
        <button class="dots-button" data-action="history-menu" data-id="${esc(entry.id)}" aria-label="Repository actions for ${esc(displayName(entry))}" aria-haspopup="menu" aria-expanded="${menuOpen}">${icon('dots', 15)}</button>
        ${menuOpen ? `<div class="menu-pop" role="menu">
          <button class="menu-item" data-action="history-rename" data-id="${esc(entry.id)}" role="menuitem">${icon('edit', 13)}<span>Rename</span></button>
          <button class="menu-item danger" data-action="history-delete" data-id="${esc(entry.id)}" role="menuitem">${icon('trash', 13)}<span>Remove</span></button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="history-empty">Your analyzed repositories will appear here. Hover any entry for rename / remove.</div>';
  return `<aside class="sidebar" aria-label="Workspace">
    <button class="new-analysis" data-action="new-analysis">${icon('add', 16)}<span>New analysis</span></button>
    <p class="sidebar-label">Workspace</p>
    <nav class="sidebar-nav" aria-label="Workspace navigation">
      <button class="nav-item active" data-action="new-analysis"><span class="nav-icon">${icon('dashboard', 16)}</span><span>Analyses</span><span class="nav-count">${state.history.length || '—'}</span></button>
      <button class="nav-item" data-action="settings"><span class="nav-icon">${icon('aiSettings', 16)}</span><span>AI provider</span></button>
    </nav>
    <div class="history" id="route-history"><p class="sidebar-label">Recent</p><div class="history-list">${historyHtml}</div></div>
    ${fileTreePanel()}
    <div class="sidebar-foot"><div class="local-note"><strong>Private by default</strong>Your Custom API key stays in this browser session. Repository files are only sent to the AI provider you choose.</div></div>
  </aside>`;
}

function repoForm() {
  const kind = state.error ? errorKindOf(state.error) : null;
  return `<form class="repo-form" id="repo-form">
    <div class="repo-input-wrap">${icon('github', 17)}<input id="repo-input" class="repo-input" autocomplete="url" spellcheck="false" value="${esc(state.repoUrl)}" placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" required /></div>
    <button class="analyze-button ${state.mode === 'loading' ? 'loading' : ''}" type="submit" ${state.mode === 'loading' ? 'disabled' : ''}>${state.mode === 'loading' ? `${icon('loader', 15, 'spinner')}Scanning repository` : `${icon('route', 15)}Analyze repository`}</button>
  </form>
  ${expertisePicker()}
  <div class="form-meta"><span>${icon('github', 12)} Public repositories</span><span>${icon('link', 12)} SSH, HTTPS, and Git URLs</span><span>${icon('shield', 12)} Heuristic scan works with no AI key</span><span class="shortcut">⌘ ↵</span></div>
  ${state.error ? `<div class="error-banner" role="alert">${icon('warning', 17)}<span><strong>${esc(kind.title)}.</strong> ${safe(state.error)}<br /><em>${esc(kind.hint)}</em></span></div>` : ''}`;
}

function emptyView() {
  return `<section class="hero">
    <div class="eyebrow"><span class="eyebrow-line"></span>Repository → ready-to-run</div>
    <h1>Make any repo<br /><span>runnable, without the archaeology.</span></h1>
    <p class="hero-copy">Git-Up builds a living install path from repository evidence, and helps you recover when a step fails. Paste a public GitHub URL to begin.</p>
    ${repoForm()}
  </section>
  <section class="initial-content" aria-labelledby="how-it-works" data-reveal-stagger>
    <div class="section-kicker" id="how-it-works">How Git-Up works</div>
    <ol class="route-preview">
      <li class="route-stop"><span class="route-mile">01</span><div><h3>Read the setup surface</h3><p>Manifests, lockfiles, Docker configs, README instructions, and environment hints.</p></div></li>
      <li class="route-stop"><span class="route-mile">02</span><div><h3>Walk one living route</h3><p>Failure evidence first, then a checklist that keeps your ticks, branch choices, and corrections.</p></div></li>
      <li class="route-stop"><span class="route-mile">03</span><div><h3>Recover, don’t restart</h3><p>Paste the terminal output and the path rebuilds from the fault forward. Completed work stays done.</p></div></li>
    </ol>
    <div class="example-row"><span>Try a public repo</span><button class="example-chip" data-example="https://github.com/expressjs/express">${icon('github', 12)} expressjs/express</button><button class="example-chip" data-example="https://github.com/tiangolo/fastapi">${icon('github', 12)} tiangolo/fastapi</button><button class="example-chip" data-example="git@github.com:golang/go.git">${icon('github', 12)} golang/go <small>SSH</small></button></div>
  </section>`;
}

function loadingView() {
  const p = state.progress;
  const phases = [
    { id: 'repository', label: 'Repository read', sub: 'metadata, branches, tree' },
    { id: 'files', label: 'Setup-file scan', sub: 'manifests, lockfiles, env templates' },
    { id: 'ai', label: 'AI review', sub: 'heuristic guide' },
    { id: 'failures', label: 'Failure evidence', sub: 'issues, PRs, inferred risks' },
    { id: 'health', label: 'Health score', sub: 'CI signals, repo health' },
    { id: 'path', label: 'Path composition', sub: 'branches recomposed locally' },
    { id: 'contract', label: 'Contract assembly', sub: 'versions, permissions, verification' },
    { id: 'tuning', label: 'Expertise tuning', sub: 'tailored depth and warnings' },
  ];
  const currentIdx = phases.findIndex((ph) => ph.id === p.phase && p.phase !== 'done');
  const activePhase = currentIdx >= 0 ? phases[currentIdx] : phases[phases.length - 1];
  const pct = p.percent || 0;
  const phaseItems = phases.map((ph, i) => {
    const isActive = p.phase === 'done' ? i < phases.length : i <= currentIdx;
    const isCurrent = i === currentIdx && p.phase !== 'done';
    return `<li class="phase-item ${isActive ? 'done' : ''} ${isCurrent ? 'active' : ''}"><span class="phase-dot"></span><div><strong>${ph.label}</strong><span>${ph.sub}</span></div></li>`;
  }).join('');
  const isDone = p.phase === 'done';
  return `<section class="loading-view" aria-live="polite" aria-busy="${!isDone}">
    <div class="loading-top">
      <div class="loading-orb">${isDone ? icon('check', 18) : icon('route', 18)}</div>
      <div>
        <h2>${isDone ? 'Analysis complete' : 'Reading the repository surface'}</h2>
        <p>${isDone ? 'Composing your install path.' : esc(p.label || 'Following the real pipeline in order.')}</p>
      </div>
    </div>
    <div class="progress-bar-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Analysis progress">
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-pct">${pct}%</span>
    </div>
    <ol class="scan-phases">${phaseItems}</ol>
    ${p.error ? `<div class="progress-error">${esc(p.error)}</div>` : ''}
    <div class="skeleton-grid" aria-hidden="true"><div class="skeleton-panel"><div class="skeleton-line short"></div><div class="skeleton-line wide"></div><div class="skeleton-line mid"></div><div class="skeleton-line"></div><div class="skeleton-line mid"></div><div class="skeleton-line"></div></div><div class="skeleton-panel"><div class="skeleton-line short"></div><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-line mid"></div><div class="skeleton-line"></div></div></div></section>`;
}

function dependencyList(items) {
  if (!items?.length) return '<div class="empty-list">No installable dependencies detected.</div>';
  return items.map((item) => {
    const name = typeof item === 'string' ? item : item.name;
    const version = typeof item === 'object' ? item.version : null;
    return `<div class="info-item dependency"><span class="info-bullet"></span><span>${esc(name)}</span>${version ? `<span class="dependency-meta">${esc(version)}</span>` : ''}</div>`;
  }).join('');
}
function requirementsList(items) {
  if (!items?.length) return '<div class="empty-list">No additional requirements detected.</div>';
  return items.map((item) => `<div class="info-item"><span class="info-bullet"></span><span>${esc(item)}</span></div>`).join('');
}
function explanationFor() {
  const guide = state.guide;
  const step = guide?.steps?.[state.explanationIndex] || guide?.steps?.[0];
  const explanation = guide?.explanations?.find((item) => item.stepId === step?.id) || { title: step?.title, body: step?.detail || 'This action prepares the next part of the installation.' };
  return { step, explanation };
}
function installScript() {
  const steps = activePath();
  const guide = state.guide || {};
  const selection = guide.pathGraph?.axes?.length ? selectionsLabel(guide.pathGraph.axes, state.pathSelections) : '';
  const header = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `# Generated by Git-Up for ${guide.repository?.canonicalUrl || state.repoUrl}`,
    `# ${steps.length} steps · ${selection ? `path: ${selection} · ` : ''}revision ${currentRevision()} · ${guide.health ? `install health ${guide.health.score}/100` : 'no health score'}`,
    `# Contract ${guide.contract?.contractId || 'n/a'} — review every line before running it.`,
    '# Nothing here has been executed; this file is for your own terminal.',
    '',
  ].join('\n');
  const sections = steps.map((step, index) => [
    `# ${String(index + 1).padStart(2, '0')}. ${step.title}`,
    ...(step.patchedFor?.length ? [`#    guards: ${step.patchedFor.join(', ')}`] : []),
    step.command ? `echo "▸ ${String(index + 1).padStart(2, '0')}. ${String(step.title).replace(/"/g, '\"')}"` : '',
    step.command || '',
  ].filter(Boolean).join('\n'));
  if (guide.contract?.verification?.command) {
    sections.push([
      '# Final check from the install contract',
      `# expect: ${guide.contract.verification.expect}`,
      guide.contract.verification.command,
    ].join('\n'));
  }
  return [header, ...sections].join('\n\n');
}

// --- Feature 1: plain-English overview --------------------------------------
function plainOverviewPanel() {
  const overview = state.guide?.plainOverview;
  if (!overview) return '';
  const steps = Array.isArray(overview.howItWorks) ? overview.howItWorks : [];
  return `<section class="panel plain-panel" aria-labelledby="plain-title" data-reveal>
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('chat', 15)}</div><div><h3 id="plain-title">In plain English</h3><p class="panel-subtitle">No jargon — share this with anyone, even if they have never opened a project before</p></div></div><span class="panel-count">for everyone</span></div>
    <div class="plain-body">
      <div class="plain-analogy">${icon('sparkles', 14)}<span>${esc(overview.analogy || '')}</span></div>
      <div class="plain-grid">
        <div class="plain-card"><div class="plain-kicker">What problem it solves</div><p>${esc(overview.problem || '')}</p></div>
        <div class="plain-card"><div class="plain-kicker">Who it helps</div><p>${esc(overview.audience || '')}</p></div>
        <div class="plain-card wide"><div class="plain-kicker">How it works for you</div><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      </div>
    </div>
  </section>`;
}

// --- Oreo the cat bot: floating messenger chatbot ----------------------------
// Replaces the old inline "Curious Explorer" section. The chat lives in a
// fixed bottom-right container (see oreoHtml + styles.css) so it is available
// on every view. Answers use the central AI service so the active provider is
// transparent to the chatbot; messages render as sanitised standard markdown.
// The mascot is the remote Lottie robot animation, played with the
// dotLottie player component (see the module script in index.html).
const OREO_NAME = 'Oreo the cat bot';
const OREO_LOTTIE = 'https://assets-v2.lottiefiles.com/a/5c0d4146-9efd-11ee-bf96-5b9fd57436b4/stZ4jBVCdO.lottie';
const OREO_TIPS = [
  'psst… ask me anything! 🐾',
  'I eat bugs for breakfast! 🐛',
  'you got this, superstar! ⭐',
  'stuck? I got paws to help! 🐱',
  'boop! need a hint? 💡',
  'lets fix it together! 🚀',
];
const OREO_QUICK = [
  'What does this repo do?',
  'How do I install it?',
  'What usually breaks?',
  'Suggest one improvement',
];

function oreoInline(text) {
  let out = String(text ?? '');
  out = out.replace(/`([^`\n]+?)`/g, '<code class="oreo-code">$1</code>');
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*])/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  out = out.replace(/\[([^\]]+?)\]\((https?:[^)\s]+?)\)/g, (m, t, u) => {
    const url = String(u).replace(/"/g, '%22');
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${t}</a>`;
  });
  out = out.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer noopener">$2</a>');
  return out;
}

/** Minimal standard-markdown renderer: headings, lists, code, quotes, tables, links. Input is escaped first, so output is XSS-safe. */
function oreoMarkdown(src) {
  let text = String(src ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return '';
  const fences = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    const idx = fences.length;
    fences.push(`<pre class="oreo-pre"><code>${esc(String(code).replace(/^\n+|\n+$/g, ''))}</code></pre>`);
    return `\u0000FENCE${idx}\u0000`;
  });
  text = esc(text);
  const lines = text.split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    html += `<p>${para.map(oreoInline).join('<br />')}</p>`;
    para = [];
  };
  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^\u0000FENCE(\d+)\u0000$/);
    if (fenceMatch) {
      flushPara(); closeLists();
      html += fences[Number(fenceMatch[1])] || '';
      continue;
    }
    // GFM table: header row + separator row
    if (line.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|?[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      flushPara(); closeLists();
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => `<th>${oreoInline(c.trim())}</th>`.replace('<th>', '<td>').replace('</th>', '</td>'));
      // header uses th
      const headCells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => `<th>${oreoInline(c.trim())}</th>`).join('');
      html += `<div class="oreo-table-wrap"><table><thead><tr>${headCells}</tr></thead><tbody>`;
      i += 1; // skip separator
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) {
        i += 1;
        const bodyCells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => `<td>${oreoInline(c.trim())}</td>`).join('');
        html += `<tr>${bodyCells}</tr>`;
      }
      html += '</tbody></table></div>';
      continue;
    }
    if (!line.trim()) { flushPara(); closeLists(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara(); closeLists();
      const level = heading[1].length;
      html += `<h${level + 2} class="oreo-h">${oreoInline(heading[2].trim())}</h${level + 2}>`;
      continue;
    }
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) { flushPara(); closeLists(); html += '<hr />'; continue; }
    const quote = line.match(/^&gt;\s?(.*)$/);
    if (quote) { flushPara(); closeLists(); html += `<blockquote>${oreoInline(quote[1])}</blockquote>`; continue; }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${oreoInline(ul[1])}</li>`;
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${oreoInline(ol[1])}</li>`;
      continue;
    }
    para.push(line.trim());
  }
  flushPara(); closeLists();
  // restore any inline fence placeholder that sat inside a paragraph (rare)
  html = html.replace(/\u0000FENCE(\d+)\u0000/g, (m, n) => fences[Number(n)] || '');
  return html;
}

function insightToMarkdown(insight) {
  const parts = [];
  if (insight?.title) parts.push(`## ${String(insight.title).slice(0, 140)}`);
  if (insight?.intro) parts.push(String(insight.intro));
  for (const b of (insight?.bullets || []).slice(0, 7)) parts.push(`- ${String(b)}`);
  if (insight?.outro) parts.push(`> ${String(insight.outro)}`);
  const md = parts.join('\n\n').slice(0, 6000);
  const followUps = Array.isArray(insight?.followUps) ? insight.followUps.map(String).filter(Boolean).slice(0, 3) : [];
  return { md: md || 'Oops, my whiskers missed that one! 🙈 Try asking about setup, errors, or what to build next — I promise I am all ears! 🐱', followUps };
}

function loadOreoPrefs() {
  try {
    const raw = localStorage.getItem('git-up-oreo-prefs');
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (!state.chat) state.chat = { open: false, messages: [], typing: false, tipIndex: 0, input: '', hidden: false, muted: false, pos: null, panelPos: null };
    if (typeof prefs.muted === 'boolean') state.chat.muted = prefs.muted;
    if (typeof prefs.hidden === 'boolean') state.chat.hidden = prefs.hidden;
    if (prefs.pos && Number.isFinite(prefs.pos.x) && Number.isFinite(prefs.pos.y)) {
      state.chat.pos = { x: Math.max(0, Math.min(window.innerWidth - 90, prefs.pos.x)), y: Math.max(0, Math.min(window.innerHeight - 90, prefs.pos.y)) };
    }
    if (prefs.panelPos && Number.isFinite(prefs.panelPos.x) && Number.isFinite(prefs.panelPos.y)) {
      state.chat.panelPos = {
        x: Math.max(0, Math.min(window.innerWidth - 100, prefs.panelPos.x)),
        y: Math.max(0, Math.min(window.innerHeight - 80, prefs.panelPos.y)),
      };
    }
  } catch { /* ignore corrupt prefs */ }
}

function saveOreoPrefs() {
  try {
    localStorage.setItem('git-up-oreo-prefs', JSON.stringify({ muted: Boolean(state.chat?.muted), hidden: Boolean(state.chat?.hidden), pos: state.chat?.pos || null, panelPos: state.chat?.panelPos || null }));
  } catch { /* private mode etc */ }
}

function ensureOreoWelcome() {
  if (!state.chat) state.chat = { open: false, messages: [], typing: false, tipIndex: 0, input: '', hidden: false, muted: false, pos: null, panelPos: null };
  if (typeof state.chat.hidden !== 'boolean') state.chat.hidden = false;
  if (typeof state.chat.muted !== 'boolean') state.chat.muted = false;
  if (!('pos' in state.chat)) state.chat.pos = null;
  if (!('panelPos' in state.chat)) state.chat.panelPos = null;
  if (state.chat.messages.length) return;
  const repo = shortName(state.guide);
  const hasRepo = Boolean(state.guide);
  state.chat.messages.push({
    id: uid(),
    role: 'bot',
    text: hasRepo
      ? `Hiii! I\'m **Oreo**! 🐱✨ I sniffed through **${repo}** just for you!\n\nYou\'re doing amazing, by the way! 💪 Ask me stuff like:\n- How do I install this? 🚀\n- What usually goes boom? 💥\n- What cool thing should I build next? 🎨`
      : `Hiii! I\'m **Oreo**! 🐱✨ Your cheery repo buddy!\n\nDrop a repo link above and I\'ll sniff it out in seconds! 🕵️ Until then, ask me anything about getting started — no silly questions here, only silly cats! 😹`,
  });
  state.chat.suggestions = [...OREO_QUICK];
}

/** True while a synthetic click right after a real drag must be swallowed. Self-expiring so it can never get stuck. */
function oreoShouldSuppressClick(now = Date.now()) {
  return typeof window !== 'undefined' && Number(window.__oreoSuppressClickUntil || 0) > now;
}

/** Pure helper: clamp a floating position inside the viewport. Unit-tested. */
function oreoClampPos(x, y, vw, vh, margin = 4, sizeX = 84, sizeY = null) {
  const w = Number.isFinite(vw) && vw > 0 ? vw : 1024;
  const h = Number.isFinite(vh) && vh > 0 ? vh : 768;
  const sx = Number.isFinite(sizeX) && sizeX > 0 ? sizeX : 84;
  const sy = Number.isFinite(sizeY) && sizeY > 0 ? sizeY : sx;
  return {
    x: Math.max(margin, Math.min(w - sx, Math.round(x))),
    y: Math.max(margin, Math.min(h - sy, Math.round(y))),
  };
}

/** Pure helper: one critically-damped-ish follow step toward a target. Never overshoots. Unit-tested. */
function oreoSpringStep(cur, target, k = 0.2) {
  const c = Number(cur);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t)) return Number.isFinite(t) ? t : 0;
  const stiffness = Math.max(0.01, Math.min(1, Number(k) || 0.2));
  const next = c + (t - c) * stiffness;
  return Math.abs(next - t) < 0.6 ? t : next;
}

function toggleOreo(force) {
  if (oreoShouldSuppressClick()) return;
  console.log('Open Chat');
  ensureOreoWelcome();
  if (state.chat.hidden && (force === undefined || force === true)) { state.chat.hidden = false; saveOreoPrefs(); }
  const next = typeof force === 'boolean' ? force : !state.chat.open;
  state.chat.open = next;
  render();
  if (next) setTimeout(() => document.querySelector('#oreo-input')?.focus(), 60);
}

function setOreoMuted(muted) {
  ensureOreoWelcome();
  state.chat.muted = Boolean(muted);
  saveOreoPrefs();
  render();
}

function setOreoHidden(hidden) {
  ensureOreoWelcome();
  state.chat.hidden = Boolean(hidden);
  if (state.chat.hidden) state.chat.open = false;
  saveOreoPrefs();
  render();
}

function oreoPositionStyle() {
  const pos = state.chat?.pos;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    return ` style="left:${Math.round(pos.x)}px;top:${Math.round(pos.y)}px;right:auto;bottom:auto;"`;
  }
  return '';
}

function oreoPanelPositionStyle() {
  const pos = state.chat?.panelPos;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    return ` style="left:${Math.round(pos.x)}px;top:${Math.round(pos.y)}px;right:auto;bottom:auto;"`;
  }
  return '';
}

/**
 * Drag the floating bot by grabbing Oreo himself. Tap still toggles the chat.
 *
 * The old bug was never "drag itself" — it was a shared boolean flag plus
 * button-level move/up listeners plus re-renders mid-gesture, so a drag could
 * randomly pop the chat open. All three are fixed while keeping whole-bot
 * dragging: tracking lives on `window` (fast flicks and outside releases
 * can't orphan the gesture), the grab offset is anchored (no jump), nothing
 * re-renders mid-gesture (single commit on release), and the post-drag
 * synthetic click is swallowed by a capture-phase guard with a self-expiring
 * timestamp that can never get stuck.
 */
function initOreoDrag() {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;
    // One capture-phase guard for the whole page: swallows only clicks inside
    // #oreo-float while the suppression window is active.
    if (!window.__oreoClickGuardBound) {
      window.__oreoClickGuardBound = true;
      window.addEventListener('click', (e) => {
        if (oreoShouldSuppressClick() && e.target?.closest?.('#oreo-float')) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
    }
    const fab = document.querySelector('#oreo-float .oreo-fab');
    const float = document.querySelector('#oreo-float');
    if (!fab || !float || fab.__oreoDragBound) return;
    fab.__oreoDragBound = true;
    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const r = float.getBoundingClientRect();
      // Anchor: keep the exact grab offset so the bot follows the cursor
      // without jumping — then trails behind it like a curious pet.
      const grabDX = e.clientX - r.left;
      const grabDY = e.clientY - r.top;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const canSpring = !reduceMotion && typeof requestAnimationFrame === 'function';
      window.__oreoDragging = true;
      float.classList?.add('oreo-dragging');
      let moved = false;
      let tx = r.left;
      let ty = r.top;
      let cx = r.left;
      let cy = r.top;
      let raf = 0;
      const stopSpring = () => {
        if (raf) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
          raf = 0;
        }
      };
      const tick = () => {
        raf = 0;
        cx = oreoSpringStep(cx, tx);
        cy = oreoSpringStep(cy, ty);
        float.style.left = `${Math.round(cx)}px`;
        float.style.top = `${Math.round(cy)}px`;
        float.style.right = 'auto';
        float.style.bottom = 'auto';
        if (cx === tx && cy === ty) return; // caught up: rest
        raf = requestAnimationFrame(tick);
      };
      const move = (ev) => {
        moved = true;
        const p = oreoClampPos(ev.clientX - grabDX, ev.clientY - grabDY, window.innerWidth, window.innerHeight);
        if (!canSpring) {
          cx = tx = p.x;
          cy = ty = p.y;
          float.style.left = `${p.x}px`;
          float.style.top = `${p.y}px`;
          float.style.right = 'auto';
          float.style.bottom = 'auto';
          return;
        }
        tx = p.x;
        ty = p.y;
        if (!raf) {
          const now = float.getBoundingClientRect();
          cx = now.left;
          cy = now.top;
          raf = requestAnimationFrame(tick);
        }
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        window.__oreoDragging = false;
        float.classList?.remove('oreo-dragging');
        stopSpring();
        if (!moved) return; // plain tap: move nothing, let the click toggle the chat
        window.__oreoSuppressClickUntil = Date.now() + 350;
        const r2 = float.getBoundingClientRect();
        ensureOreoWelcome();
        state.chat.pos = { x: Math.round(r2.left), y: Math.round(r2.top) };
        saveOreoPrefs();
        render();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      try { fab.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    });
    // Double-click Oreo to dock him back to the default bottom-right corner.
    fab.addEventListener('dblclick', (e) => {
      e.preventDefault();
      ensureOreoWelcome();
      state.chat.pos = null;
      saveOreoPrefs();
      render();
    });
  } catch { /* ignore */ }
}

/**
 * Drag the chat box itself by its header. Unlike the robot (which trails the
 * cursor like a pet), a window wants precision, so this is an exact anchored
 * follow. Position persists separately from the robot in `panelPos`.
 * Header buttons/inputs are excluded so the close button keeps working, and
 * the same self-expiring click guard covers the trailing synthetic click.
 * Double-click an empty header spot to snap the box back to its dock.
 */
function initOreoPanelDrag() {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;
    const head = document.querySelector('#oreo-float .oreo-panel .oreo-head');
    const panel = document.querySelector('#oreo-float .oreo-panel');
    if (!head || !panel || head.__oreoPanelDragBound) return;
    head.__oreoPanelDragBound = true;
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target?.closest?.('button, input, select, textarea, a')) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      const grabDX = e.clientX - r.left;
      const grabDY = e.clientY - r.top;
      window.__oreoDragging = true;
      panel.classList?.add('oreo-panel-dragging');
      let moved = false;
      const move = (ev) => {
        moved = true;
        const p = oreoClampPos(
          ev.clientX - grabDX, ev.clientY - grabDY,
          window.innerWidth, window.innerHeight, 4,
          Math.max(200, Math.min(r.width, window.innerWidth - 24)),
          Math.max(160, Math.min(r.height, window.innerHeight - 24)),
        );
        panel.style.left = `${p.x}px`;
        panel.style.top = `${p.y}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        window.__oreoDragging = false;
        panel.classList?.remove('oreo-panel-dragging');
        if (!moved) return;
        window.__oreoSuppressClickUntil = Date.now() + 350;
        const r2 = panel.getBoundingClientRect();
        ensureOreoWelcome();
        state.chat.panelPos = { x: Math.round(r2.left), y: Math.round(r2.top) };
        saveOreoPrefs();
        render();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      try { head.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    });
    head.addEventListener('dblclick', (e) => {
      if (e.target?.closest?.('button, input, select, textarea, a')) return;
      e.preventDefault();
      ensureOreoWelcome();
      state.chat.panelPos = null;
      saveOreoPrefs();
      render();
    });
  } catch { /* ignore */ }
}

/**
 * Oreo moves by himself while the page scrolls: a small velocity-driven
 * hop-and-tilt on the robot that eases back to rest. Purely cosmetic —
 * DOM transform only, never touches state, never re-renders, never opens
 * the chat. Skipped during drags, when hidden, and for reduced motion.
 */
function initOreoScrollWiggle() {
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;
    if (window.__oreoWiggleBound) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    if (typeof requestAnimationFrame !== 'function') return;
    window.__oreoWiggleBound = true;
    let lastY = window.scrollY || 0;
    let tilt = 0;
    let lift = 0;
    let raf = 0;
    const settle = () => {
      raf = 0;
      tilt *= 0.88;
      lift *= 0.88;
      const fab = document.querySelector?.('#oreo-float .oreo-fab');
      if (!fab) return;
      if (Math.abs(tilt) < 0.4 && Math.abs(lift) < 0.4) { fab.style.transform = ''; return; }
      fab.style.transform = `translateY(${lift.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`;
      raf = requestAnimationFrame(settle);
    };
    window.addEventListener('scroll', () => {
      if (window.__oreoDragging) return;
      if (state.chat?.hidden) return;
      const fab = document.querySelector?.('#oreo-float .oreo-fab');
      if (!fab) return;
      const y = window.scrollY || 0;
      const dy = y - lastY;
      lastY = y;
      if (!dy) return;
      tilt = Math.max(-14, Math.min(14, tilt + dy * 0.06));
      lift = Math.max(-12, Math.min(0, lift - Math.min(Math.abs(dy) * 0.03, 6)));
      fab.style.transform = `translateY(${lift.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`;
      if (!raf) raf = requestAnimationFrame(settle);
    }, { passive: true });
  } catch { /* ignore */ }
}

function pushOreo(role, text) {
  ensureOreoWelcome();
  state.chat.messages.push({ id: uid(), role, text: String(text ?? '').slice(0, 6000) });
  if (state.chat.messages.length > 100) state.chat.messages = state.chat.messages.slice(-100);
}

/**
 * Compact live-session snapshot for Oreo's system instruction context.
 * Bounded and title-only (no file bodies, no secrets) — the server re-caps
 * everything again, so this is belt and braces for a small request body.
 */
function oreoSessionSnapshot() {
  const snap = { expertise: state.expertise || 'some' };
  const guide = state.guide;
  if (!guide) return snap;
  try {
    const steps = activePath().map((entry, index) => ({
      title: String(entry.title || '').slice(0, 160),
      command: String(entry.command || '').slice(0, 600),
      done: Boolean(state.checked[keyOf(entry, index)]),
    }));
    const completed = steps.filter((s) => s.done).slice(-12);
    const remaining = steps.filter((s) => !s.done).slice(0, 12);
    snap.repoUrl = state.repoUrl;
    snap.repoName = shortName(guide);
    snap.summary = String(guide.summary || '').slice(0, 600);
    snap.activeStep = remaining[0] || null;
    snap.completedSteps = completed;
    snap.remainingSteps = remaining.slice(1);
    snap.provider = providerSummary();
    if (guide.contract?.contractId) snap.contractId = guide.contract.contractId;
    if (guide.contract?.verification) snap.verification = guide.contract.verification;
    const lastFailure = state.failures[state.failures.length - 1];
    if (lastFailure) snap.failure = `step ${lastFailure.stepId}: ${String(lastFailure.diagnosis || '').slice(0, 300)}`;
    if (state.recovery?.diagnosis) snap.recovery = String(state.recovery.diagnosis).slice(0, 300);
  } catch { /* minimal snapshot on any surprise */ }
  return snap;
}

async function sendOreoMessage(raw) {
  const text = String(raw ?? '').trim().slice(0, 2000);
  if (!text || state.chat.typing) return;
  ensureOreoWelcome();
  pushOreo('user', text);
  state.chat.input = '';
  state.chat.typing = true;
  state.chat.suggestions = [];
  render();
  document.querySelector('#oreo-messages')?.scrollTo?.({ top: 999999 });
  try {
    if (!state.guide) {
      await new Promise((r) => setTimeout(r, 500));
      pushOreo('bot', `Ooo good question! 🤩 First, toss a GitHub repo link in the box above, and I\'ll sniff it out like a treat! 🦴🐾\n\nAbout **${esc(text).slice(0, 120)}**:\n- Any public \`github.com/owner/repo\` link works! 🔗\n- No API key needed for the quick sniff! 🆓\n- Then come back and I\'ll cheer you through every step! 📣`);
      state.chat.suggestions = [...OREO_QUICK];
    } else {
      const insight = await generateAI('insight', { repoUrl: state.repoUrl, mode: 'custom', question: text, baseMode: 'recommendations', session: oreoSessionSnapshot() });
      const { md, followUps } = insightToMarkdown(insight);
      pushOreo('bot', md);
      state.chat.suggestions = followUps.length ? followUps : [...OREO_QUICK];
    }
  } catch (error) {
    pushOreo('bot', `Eep! I tripped over my own tail! 🙈 ${String(error.message || 'Try again in a moment.')}\n\nDon\'t worry, champs bounce back! 💪 You can still:\n- Ask about an install step by name 🏷️\n- Paste a scary terminal error and I\'ll translate the gibberish! 🧪`);
    state.chat.suggestions = [...OREO_QUICK];
  } finally {
    state.chat.typing = false;
    render();
    const box = document.querySelector('#oreo-messages');
    if (box) box.scrollTop = box.scrollHeight;
    document.querySelector('#oreo-input')?.focus?.();
  }
}

function rotateOreoTip() {
  if (!state.chat || state.chat.open || state.chat.muted || state.chat.hidden) return;
  if (typeof window !== 'undefined' && window.__oreoDragging) return;
  state.chat.tipIndex = (state.chat.tipIndex + 1) % OREO_TIPS.length;
  const el = document.querySelector?.('#oreo-tip-text');
  if (!el) return;
  el.classList.remove('oreo-tip-anim');
  void el.offsetWidth;
  el.textContent = OREO_TIPS[state.chat.tipIndex];
  el.classList.add('oreo-tip-anim');
}

function oreoHtml() {
  ensureOreoWelcome();
  const chat = state.chat;
  if (chat.hidden) {
    return `<div class="oreo-float" id="oreo-float"${oreoPositionStyle()}>
    <button class="oreo-show" data-action="oreo-show" aria-label="Show ${esc(OREO_NAME)}" title="Show ${esc(OREO_NAME)}"><span aria-hidden="true">🐾</span> Oreo</button>
  </div>`;
  }
  const tip = OREO_TIPS[chat.tipIndex % OREO_TIPS.length];
  const showTip = !chat.open && !chat.muted;
  const suggestions = chat.suggestions?.length ? chat.suggestions : OREO_QUICK;
  const messages = chat.messages.map((m) => {
    if (m.role === 'user') return `<div class="oreo-msg user"><div class="oreo-bubble-msg">${esc(m.text).replace(/\n/g, '<br />')}</div></div>`;
    return `<div class="oreo-msg bot"><div class="oreo-msg-name">Oreo</div><div class="oreo-bubble-msg oreo-md">${oreoMarkdown(m.text)}</div></div>`;
  }).join('');
  return `<div class="oreo-float" id="oreo-float"${oreoPositionStyle()}>
    ${showTip ? `<div class="oreo-tip" id="oreo-tip" role="status" aria-label="${esc(OREO_NAME)} says: ${esc(tip)}"><span class="oreo-tip-name">${esc(OREO_NAME)}</span><span class="oreo-tip-text oreo-tip-anim" id="oreo-tip-text">${esc(tip)}</span></div>` : ''}
    ${chat.open ? `<section class="oreo-panel" role="dialog" aria-modal="false" aria-label="Chat with ${esc(OREO_NAME)}"${oreoPanelPositionStyle()}>
      <header class="oreo-head" title="Drag to move this chat box (double-click resets)">
        <span class="oreo-avatar" aria-hidden="true"><span class="oreo-avatar-dot"></span>😺</span>
        <div class="oreo-head-text"><strong>Oreo 🎉</strong><span>cheer captain · ${state.guide ? esc(shortName(state.guide)) : 'no repo yet'} · ${state.chat.typing ? 'typing… ✍️' : 'online 💚'}</span></div>
        <button class="oreo-icon-btn" data-action="oreo-close" aria-label="Close chat">✕</button>
      </header>
      <div class="oreo-messages" id="oreo-messages" aria-live="polite">${messages}${chat.typing ? '<div class="oreo-msg bot"><div class="oreo-bubble-msg oreo-typing"><span></span><span></span><span></span></div></div>' : ''}</div>
      ${suggestions.length && !chat.typing ? `<div class="oreo-chips">${suggestions.map((q) => `<button class="oreo-chip" data-action="oreo-chip" data-question="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
      <form class="oreo-form" id="oreo-form"><input id="oreo-input" class="oreo-input" placeholder="${state.guide ? 'Ask me anything, superstar! ✨' : 'Say hi to Oreo! 🐾'}" value="${esc(chat.input || '')}" maxlength="2000" autocomplete="off" aria-label="Message Oreo" /><button class="oreo-send" type="submit" aria-label="Send message">➤</button></form>
    </section>` : ''}
    <div class="oreo-controls" role="toolbar" aria-label="Oreo controls: mute chatter, hide bot">
      <button class="oreo-ctrl-btn" data-action="oreo-mute" aria-pressed="${chat.muted}" title="${chat.muted ? 'Unmute Oreo chatter' : 'Mute Oreo chatter'}" aria-label="${chat.muted ? 'Unmute Oreo' : 'Mute Oreo'}">${chat.muted ? '🔇 muted' : '🔊'}</button>
      <button class="oreo-ctrl-btn" data-action="oreo-hide" title="Hide Oreo" aria-label="Hide Oreo">hide</button>
    </div>
    <button class="oreo-fab" data-action="oreo-toggle" aria-label="${chat.open ? 'Close' : 'Open'} chat with ${esc(OREO_NAME)} (drag Oreo to move him, double-click to dock back)" title="${esc(OREO_NAME)} — drag me anywhere! 🐾" aria-expanded="${chat.open}">
      <dotlottie-player class="oreo-mascot" src="${OREO_LOTTIE}" background="transparent" speed="1" loop autoplay aria-hidden="true"></dotlottie-player>
    </button>
  </div>`;
}

function routeNav() {
  return `<nav class="route-nav" aria-label="Result sections">
    <a href="#route-path">${icon('route', 12)} Path</a>
    <a href="#route-failures">${icon('bug', 12)} Failures</a>
    <a href="#route-graph">${icon('graph', 12)} Graph</a>
    <a href="#route-contract">${icon('shield', 12)} Contract</a>
    <a href="#route-evidence">${icon('book', 12)} Evidence</a>
  </nav>`;
}

function routeStatusStrip() {
  const steps = activePath();
  const { done, total, percent } = progressOf(steps, state.checked);
  const firstOpen = steps.find((entry) => !state.checked[keyOf(entry)]);
  const verdict = state.guide?.verdict;
  return `<section class="route-status" aria-label="Where you are on the route">
    <div class="route-status-main">
      <span class="route-kicker">${icon('flag', 13)} ${done === total && total ? 'Route complete' : firstOpen ? `Next: step ${String(firstOpen.position || steps.indexOf(firstOpen) + 1).padStart(2, '0')} — ${esc(firstOpen.title)}` : 'Your living route'}</span>
      ${verdict ? `<p class="route-verdict">${esc(verdict)}</p>` : `<p class="route-verdict dim">Health, failure evidence, and the contract sit below the path they describe.</p>`}
    </div>
    <div class="route-status-meter"><div class="progress-copy"><span>${done}/${total} steps confirmed</span><strong>${percent}%</strong></div><div class="progress-track" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Installation progress"><div class="progress-fill" style="width:${percent}%"></div></div></div>
  </section>`;
}

function analysisView() {
  const guide = state.guide;
  const repo = guide.repository || {};
  const steps = activePath();
  const { step, explanation } = explanationFor();
  const files = (guide.files || []).slice(0, 14);
  return `<section class="analysis-view" aria-label="Analysis result">
    <div class="analysis-head">
      <div class="repo-identity">
        <div class="repo-avatar">${icon('github', 22)}</div>
        <div>
          <h2>${esc(repo.name || repo.repo || 'Repository')}</h2>
          <div class="repo-url">${esc(repo.canonicalUrl || state.repoUrl)} ${icon('external', 12)}</div>
          ${repo.description ? `<p class="repo-description">${esc(repo.description)}</p>` : ''}
          <div class="analysis-meta"><span class="tag ${guide.source === 'ai' ? 'ai' : 'scan'}"><i class="tag-dot"></i>${sourceLabel()}</span><span class="tag">${esc(guide.confidence || 'medium')} confidence</span><span class="tag">${formatDate(guide.analyzedAt)}</span></div>
        </div>
      </div>
      <div class="analysis-actions">${expertiseSwitch()}<button class="secondary-button" data-action="new-analysis">${icon('add', 14)} New</button><button class="install-button" data-action="install">${icon('terminal', 14)} Generate install script</button></div>
    </div>
    ${routeNav()}
    ${resumeBanner()}
    ${recoveryReport()}
    ${routeStatusStrip()}
    ${healthPanel()}
    ${pathGraphPanel()}
    ${installStepsPanel()}
    ${failureFirstPanel()}
    ${contractPanel()}
    ${revisionTrail()}
    <div class="overview-strip" data-reveal><div class="overview-cell summary"><div class="cell-label">Analysis summary</div><div class="cell-value overview-summary">${esc(guide.summary || 'A structured installation path for this repository.')}</div></div><div class="overview-cell branch"><div class="cell-label">Default branch</div><div class="cell-value mono">${esc(repo.defaultBranch || 'main')}</div></div><div class="overview-cell language"><div class="cell-label">Language</div><div class="cell-value">${esc(repo.language || 'Not detected')}</div></div><div class="overview-cell files"><div class="cell-label">Files inspected</div><div class="cell-value mono">${(guide.files || []).length}</div></div></div>
    ${plainOverviewPanel()}
    <div class="dashboard-grid" id="route-evidence" data-reveal>
      <div class="primary-stack">
        <div class="info-grid"><section class="panel info-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('packages', 15)}</div><div><h3>Dependencies</h3><p class="panel-subtitle">Installed as part of this repository</p></div></div><span class="panel-count">${guide.dependencies?.length || 0}</span></div><div class="info-list">${dependencyList(guide.dependencies)}</div></section><section class="panel info-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('requirements', 15)}</div><div><h3>Requirements</h3><p class="panel-subtitle">Needed before the app can work</p></div></div><span class="panel-count">${guide.requirements?.length || 0}</span></div><div class="info-list">${requirementsList(guide.requirements)}</div></section></div>
        ${guide.notes?.length ? `<section class="panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('notes', 15)}</div><div><h3>Notes from the scan</h3><p class="panel-subtitle">Keep these caveats close while you set up</p></div></div></div><div class="info-list">${guide.notes.map((note) => `<div class="info-item"><span class="info-bullet"></span><span>${esc(note)}</span></div>`).join('')}</div></section>` : ''}
      </div>
      <div class="sticky-column"><section class="panel explanation-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('info', 15)}</div><div><h3>Explanation</h3><p class="panel-subtitle">Understand the why, without cluttering the checklist</p></div></div></div><div class="explanation-content"><label class="explanation-step-label" for="explanation-select">Selected step</label><select class="explanation-select" id="explanation-select">${steps.map((item, index) => `<option value="${index}" ${index === state.explanationIndex ? 'selected' : ''}>${String(index + 1).padStart(2, '0')} · ${esc(item.title)}</option>`).join('')}</select><h4>${esc(explanation.title || step?.title || 'Installation step')}</h4><p>${esc(explanation.body || step?.detail || '')}</p>${guide.environment?.length ? `<div class="explanation-tip">${icon('key', 14)}<span>Environment detected: <strong>${guide.environment.map(esc).join(', ')}</strong>. Keep secrets out of Git.</span></div>` : `<div class="explanation-tip">${icon('info', 14)}<span>Commands are shown for your terminal. Git-Up never executes code on your machine.</span></div>`}</div></section>${files.length ? `<section class="panel files-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('fileSearch', 15)}</div><div><h3>Inspected files</h3><p class="panel-subtitle">The setup evidence behind this guide</p></div></div></div><div class="file-list">${files.map((file) => `<span class="file-chip" title="${esc(file)}">${esc(file)}</span>`).join('')}</div></section>` : ''}</div>
    </div>
  </section>`;
}

function settingsModal() {
  const provider = state.ai.activeProvider;
  const models = [...new Set([...(state.modelOptions || []), state.settings.model].filter(Boolean))];
  const providerPicker = `<fieldset class="provider-picker"><legend>AI provider</legend><div class="provider-options">
    <label class="provider-option ${provider === AI_PROVIDER.CUSTOM ? 'selected' : ''}"><input type="radio" name="ai-provider" value="${AI_PROVIDER.CUSTOM}" ${provider === AI_PROVIDER.CUSTOM ? 'checked' : ''} /><span><strong>Custom API</strong><small>Use your own OpenAI-compatible endpoint.</small></span></label>
    <label class="provider-option ${provider === AI_PROVIDER.POLLINATIONS ? 'selected' : ''}"><input type="radio" name="ai-provider" value="${AI_PROVIDER.POLLINATIONS}" ${provider === AI_PROVIDER.POLLINATIONS ? 'checked' : ''} /><span><strong>Git-Up Free</strong><small>No key to paste. Authorize this session with Pollinations.</small></span></label>
  </div></fieldset>`;
  const head = `<div class="modal-head"><div><h2 id="settings-title">AI provider</h2><p>Choose how Git-Up performs deeper repository reviews. Your Custom API values stay intact when you use Free AI.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close settings">${icon('close', 18)}</button></div>`;

  if (provider === AI_PROVIDER.CUSTOM) {
    return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal ai-settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">${head}<form class="modal-body" id="settings-form">${providerPicker}<div class="provider-panel" aria-label="Custom API settings"><div class="inline-fields"><div class="form-field"><label for="base-url">Base URL <span>required</span></label><input class="text-field" id="base-url" value="${esc(state.settings.baseUrl)}" placeholder="https://api.openai.com/v1" /></div><div class="form-field"><label for="endpoint">Chat endpoint <span>required</span></label><input class="text-field" id="endpoint" value="${esc(state.settings.endpoint)}" placeholder="/chat/completions" /></div></div><div class="form-field"><label for="api-key">API key <span>session only</span></label><div class="secret-field"><input class="text-field" id="api-key" type="${state.secretVisible ? 'text' : 'password'}" value="${esc(state.settings.apiKey)}" placeholder="sk-…" autocomplete="off" /> <button class="reveal-key" type="button" data-action="toggle-key" aria-label="${state.secretVisible ? 'Hide' : 'Show'} API key">${icon(state.secretVisible ? 'eyeOff' : 'eye', 15)}</button></div><p class="field-hint">Used only for requests from this session. It is never saved to the server or included in a repository guide.</p></div><aside class="free-ai-cta"><div><strong>Don’t have your own API?</strong><p>No problem — Git-Up has a free AI option.</p></div><button type="button" class="secondary-button" data-action="use-free-ai">Try Free AI ${icon('arrow', 13)}</button></aside><div class="form-field"><label for="model">Model <span>${models.length ? `${models.length} available` : 'fetch from provider'}</span></label><div class="model-row"><select class="select-field" id="model"><option value="">Select a model…</option>${models.map((model) => `<option value="${esc(model)}" ${model === state.settings.model ? 'selected' : ''}>${esc(model)}</option>`).join('')}</select><button type="button" class="fetch-button" data-action="fetch-models">${icon('refresh', 13)} Fetch models</button></div><p class="field-hint">Git-Up requests <span class="mono">GET /models</span> from your base URL. Your provider may use a different models endpoint.</p></div><div id="settings-status" class="settings-status ${state.ai.customError ? 'bad' : ''}" aria-live="polite">${state.ai.customError ? 'Custom API connection failed. Check your settings and try again.' : ''}</div></div><div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="install-button" type="submit">${icon('check', 14)} Save configuration</button></div></form></section></div>`;
  }

  const pollinationsStatus = state.ai.pollinationsStatus;
  const connected = pollinationsStatus === AI_CONNECTION.POLLINATIONS_CONNECTED;
  const connecting = state.ai.busy === 'connect';
  const testing = state.ai.busy === 'test';
  const busy = Boolean(state.ai.busy);
  const failed = pollinationsStatus === AI_CONNECTION.POLLINATIONS_ERROR;
  const authorization = connecting ? state.ai.authorization : null;
  const statusCopy = connecting
    ? (authorization
      ? `Waiting for Pollinations approval for code ${authorization.userCode}…`
      : 'Requesting a Pollinations authorization code…')
    : testing
      ? 'Sending a small Pollinations test request…'
      : state.ai.message || (connected
        ? 'Free AI Connected — you’re ready to use Git-Up’s AI features.'
        : failed
          ? 'Free AI connection failed. Please reconnect and try again.'
          : 'Free AI is not connected. Authorize Pollinations to continue.');
  const statusClass = connected && !failed ? 'good' : failed ? 'bad' : '';
  const authorizationPanel = authorization
    ? `<div class="free-ai-authorization" aria-label="Pollinations authorization"><span>Authorization code</span><strong class="authorization-code">${esc(authorization.userCode)}</strong><p>Open Pollinations, confirm this code, then return here. Git-Up will finish connecting automatically; the code expires on its own.</p></div>`
    : '';
  const actions = connected
    ? `<button type="button" class="secondary-button" data-action="test-free-ai" ${busy ? 'disabled' : ''}>${testing ? `${icon('loader', 13, 'spinner')} Testing Free AI…` : `${icon('sparkles', 13)} Test AI`}</button><button type="button" class="secondary-button danger-button" data-action="disconnect-free-ai" ${busy ? 'disabled' : ''}>Disconnect</button>`
    : connecting
      ? `${authorization ? `<a class="install-button" href="${esc(authorization.verificationUri)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open Pollinations ${icon('external', 13)}</a><button type="button" class="secondary-button" data-copy="${esc(authorization.userCode)}">${icon('copy', 13)} Copy code</button>` : ''}<button type="button" class="secondary-button danger-button" data-action="cancel-free-ai-connect">Cancel</button>`
      : `<button type="button" class="install-button" data-action="connect-free-ai">${icon('sparkles', 13)} ${failed ? 'Retry Free AI' : 'Authorize Pollinations'}</button>${failed ? '<button type="button" class="secondary-button danger-button" data-action="disconnect-free-ai">Disconnect</button>' : ''}${failed && hasCustomAiConfig() ? '<button type="button" class="secondary-button" data-action="use-custom-ai">Use Custom API</button>' : ''}`;
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal ai-settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">${head}<div class="modal-body">${providerPicker}<section class="free-ai-card" aria-labelledby="free-ai-title"><div class="free-ai-heading"><span class="free-ai-mark">${icon('sparkles', 18)}</span><div><h3 id="free-ai-title">Git-Up Free AI</h3><p>Use AI without pasting or configuring an API key.</p></div></div><div class="free-ai-model"><span>Pollinations model</span><strong>${esc(POLLINATIONS_DEFAULT_MODEL)}</strong></div><div class="free-ai-status ${statusClass}" role="status" aria-live="polite"><i class="status-dot ${connected ? 'online' : failed ? 'warning' : connecting ? 'pending' : ''}" aria-hidden="true"></i><span>${esc(statusCopy)}</span></div>${authorizationPanel}<div class="free-ai-actions">${actions}</div><p class="free-ai-credit">Powered by Pollinations. Your delegated authorization stays in this browser session and is sent only to Pollinations. Usage may consume Pollen; <a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">manage your Pollinations account</a>.</p></section><div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Close</button></div></div></section></div>`;
}
function installModal() {
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal script-modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><div class="modal-head"><div><h2 id="install-title">Your install script</h2><p>Review these commands, then run them in your own terminal. Nothing runs automatically.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close install script">${icon('close', 18)}</button></div><div class="modal-body" aria-live="polite"><p class="script-copy-note">This is the same order as your checklist. If the repository requires secrets, fill those in locally before running the script.</p><div class="script-block"><button class="copy-mini script-copy" data-copy="${esc(installScript())}" aria-label="Copy install script" title="Copy install script">${icon('copy', 13)}<span>Copy</span></button>${esc(installScript())}</div><div class="modal-foot"><button class="secondary-button" data-action="close-modal">Close</button><button class="install-button" data-copy="${esc(installScript())}">${icon('copy', 14)} Copy script</button></div></div></section></div>`;
}
function resumeBanner() {
  if (!state.resumeNote) return '';
  const note = state.resumeNote;
  return `<div class="resume-note">${icon('history', 13)}<span>${esc(note)}</span><button class="link-button" data-action="resume-dismiss">Dismiss</button></div>`;
}

function toastHtml() { return state.toast ? `<div class="toast ${state.toast.type}" role="status">${icon(state.toast.type === 'error' ? 'warning' : 'checkCircle', 15)}<span>${esc(state.toast.message)}</span></div>` : ''; }

// ===========================================================================
// Git-Up v2 feature layer
//   1 living install path (session + failure recovery)
//   2 failure-first analysis      3 multi-path install graph
//   4 install contract             5 zero-context clone mode   6 health score
// Everything degrades: a missing field hides its panel instead of blanking the
// page, and every action works with no AI provider configured.
// ===========================================================================

const ORIGIN_LABEL = { reported: 'reported in this repo', inferred: 'inferred from files', predicted: 'predicted from docs' };

// --- Session plumbing (Feature 1) ------------------------------------------
function activePath() {
  const guide = state.guide;
  if (!guide) return [];
  const base = Array.isArray(guide.steps) ? guide.steps : [];
  if (!guide.pathGraph?.axes?.length) return base.map((entry, index) => ({ ...entry, position: index + 1 }));
  return composeSteps(base, guide.pathGraph, state.pathSelections);
}

function sessionSnapshot() {
  return {
    checked: state.checked,
    failures: state.failures,
    revisions: state.revisions,
    superseded: state.superseded,
    contractChecked: state.contractChecked,
    pathSelections: state.pathSelections,
    expertise: state.expertise,
    savedAt: new Date().toISOString(),
  };
}

function persistSession() {
  const entry = state.history.find((item) => item.url === state.repoUrl || item.guide?.repository?.canonicalUrl === state.repoUrl);
  if (entry) entry.session = sessionSnapshot();
  persistHistory();
  try { localStorage.setItem('git-up-active', state.repoUrl); } catch { /* ignore */ }
}

function emptySession() {
  state.checked = {};
  state.failures = [];
  state.revisions = [];
  state.superseded = [];
  state.contractChecked = {};
  state.pathSelections = { ...(state.guide?.pathGraph?.defaults || {}) };
}

function hydrateSession(session, guide) {
  emptySession();
  if (guide?.pathGraph?.defaults) state.pathSelections = { ...guide.pathGraph.defaults };
  if (!session || typeof session !== 'object') return;
  state.checked = session.checked && typeof session.checked === 'object' ? { ...session.checked } : {};
  state.failures = Array.isArray(session.failures) ? session.failures : [];
  state.revisions = Array.isArray(session.revisions) ? session.revisions : [];
  state.superseded = Array.isArray(session.superseded) ? session.superseded : [];
  state.contractChecked = session.contractChecked && typeof session.contractChecked === 'object' ? { ...session.contractChecked } : {};
  if (session.pathSelections && typeof session.pathSelections === 'object') state.pathSelections = { ...state.pathSelections, ...session.pathSelections };
  if (session.expertise) state.expertise = session.expertise;
}

function currentRevision() {
  return Math.max(1, ...(state.revisions.length ? state.revisions.map((entry) => entry.revision) : [state.guide?.session?.revision || 1]));
}

function failedIds() { return new Set(state.failures.map((entry) => String(entry.stepId))); }

// --- Reader mode (Feature 5) ------------------------------------------------
function expertiseProfile(id) {
  return (state.guide?.expertiseOptions || EXPERTISE_LEVELS).find((entry) => entry.id === (id || state.expertise)) || EXPERTISE_LEVELS[1];
}

function expertisePicker() {
  return `<div class="seg-block" role="radiogroup" aria-label="How much do you already know about this project?">
    <div class="seg-label">${icon('compass', 12)}<span>Start from</span><em>changes explanation depth and how many warnings you get</em></div>
    <div class="seg-row">${EXPERTISE_LEVELS.map((level) => `<button type="button" class="seg-option ${state.expertise === level.id ? 'active' : ''}" role="radio" aria-checked="${state.expertise === level.id}" data-expertise="${level.id}" title="${esc(level.detail)}">
      <strong>${esc(level.short)}</strong><span>${esc(level.label)}</span>
    </button>`).join('')}</div>
  </div>`;
}

function expertiseSwitch() {
  const profile = expertiseProfile();
  return `<div class="seg-inline" role="radiogroup" aria-label="Reader mode">
    ${EXPERTISE_LEVELS.map((level) => `<button class="seg-chip ${state.expertise === level.id ? 'active' : ''}" role="radio" aria-checked="${state.expertise === level.id}" data-expertise="${level.id}">${esc(level.short)}</button>`).join('')}
    <span class="seg-note">${esc(profile.tempo)}</span>
  </div>`;
}

function setExpertise(id) {
  if (!EXPERTISE_LEVELS.some((level) => level.id === id)) return;
  state.expertise = id;
  if (state.guide) {
    // Re-shape the already-scanned guide locally: no GitHub read, no model call.
    state.guide = tuneGuide(state.guide, id);
    persistSession();
    render();
    showToast(`Reader mode: ${expertiseProfile(id).short}. ${expertiseProfile(id).detail}`);
  } else {
    render();
  }
}

// --- Feature 6: repo health score ------------------------------------------
function scoreRing(score, tone) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="Install health ${score} out of 100">
    <circle class="ring-track" cx="32" cy="32" r="${radius}"></circle>
    <circle class="ring-fill tone-${tone}" cx="32" cy="32" r="${radius}" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 32 32)"></circle>
    <text class="ring-value" data-ticker data-ticker-to="${score}" x="32" y="30" text-anchor="middle">${score}</text>
    <text class="ring-max" x="32" y="43" text-anchor="middle">/100</text>
  </svg>`;
}

function healthPanel() {
  const health = state.guide?.health;
  if (!health) return '';
  const factors = health.factors || [];
  const bars = factors.map((factor) => `<div class="factor" title="${esc(factor.detail)}">
      <div class="factor-top"><span>${esc(factor.label)}</span><b>${factor.score} · weight ${Math.round((factor.weight || 0) * 100)}%</b></div>
      <div class="factor-track"><i style="width:${Math.max(3, factor.score)}%" class="tone-${bandTone(factor.score)}"></i></div>
      <p>${esc(factor.detail)}</p>
    </div>`).join('');
  const evidence = health.evidence || {};
  return `<section class="panel health-panel" aria-labelledby="health-title" data-reveal>
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('health', 15)}</div><div><h3 id="health-title">Install health</h3><p class="panel-subtitle">Scored from repository evidence before any steps are shown — ${esc(health.method)}</p></div></div><span class="panel-count">weight disclosed</span></div>
    <div class="health-body">
      <div class="health-score">${scoreRing(health.score, health.band.tone)}<div class="health-band tone-${health.band.tone}"><strong>${esc(health.band.label)}</strong><span>${esc(health.band.note)}</span></div></div>
      <div class="health-factors">${bars}</div>
    </div>
    ${health.caps?.length ? `<div class="health-caps">${health.caps.map((cap) => `<div class="cap-item">${icon('warning', 13)}<span>${esc(cap)}</span></div>`).join('')}</div>` : ''}
    <div class="health-foot"><span>${icon('clock', 12)} pushed ${evidence.ageDays === null || evidence.ageDays === undefined ? 'unknown' : `${evidence.ageDays}d ago`}</span><span>${icon('messages', 12)} ${evidence.threadsSampled || 0} threads sampled</span><span>${icon('bug', 12)} ${evidence.openIssues || 0} open issues</span><span>${icon('graph', 12)} branch ${esc(evidence.branch || 'main')}: ${esc(evidence.ci?.state || 'no-ci')}</span><span class="mono">${esc(health.method)}</span></div>
  </section>`;
}

function bandTone(score) {
  if (score >= 85) return 'mint';
  if (score >= 68) return 'blue';
  if (score >= 48) return 'amber';
  return 'red';
}

// --- Feature 2: failure-first analysis -------------------------------------
/** A quiet, professional signature strip. CSS-only marquee when there are
    enough signatures to loop; a static chip row below that threshold. Purely
    a preview — the ranked fail-list underneath is the accessible source. */
function signatureStrip(patterns) {
  const labels = patterns.filter((pattern) => pattern.label).slice(0, 8);
  if (labels.length < 2) return '';
  const chip = (pattern) => `<span class="sig-chip"><span class="sig-rank">${String(pattern.rank).padStart(2, '0')}</span>${esc(pattern.label)}${pattern.count ? `<em>· ${pattern.count}</em>` : ''}</span>`;
  if (labels.length < 3) {
    return `<div class="sig-marquee sig-static" aria-hidden="true"><div class="sig-marquee-group">${labels.map(chip).join('')}</div></div>`;
  }
  const group = `<div class="sig-marquee-group">${labels.map(chip).join('')}</div>`;
  const text = labels.map((pattern) => `${String(pattern.rank).padStart(2, '0')} ${pattern.label}`).join('; ');
  return `<div class="sig-marquee" aria-hidden="true"><div class="sig-marquee-track">${group}${group}</div></div><span class="sr-only">${esc(text)}</span>`;
}

function failureFirstPanel() {
  const scan = state.guide?.failureScan;
  if (!scan) return '';
  const patterns = scan.patterns || [];
  const steps = activePath();
  const maxHits = Math.max(1, ...patterns.map((entry) => entry.count || 0));
  const rows = patterns.map((pattern) => {
    const targetIndex = steps.findIndex((entry) => String(entry.id) === String(pattern.patchStepId));
    return `<article class="fail-row origin-${pattern.origin}">
      <div class="fail-rank">${String(pattern.rank).padStart(2, '0')}</div>
      <div class="fail-main">
        <div class="fail-title"><h4>${esc(pattern.label)}</h4><span class="origin-badge">${esc(ORIGIN_LABEL[pattern.origin] || pattern.origin)}</span></div>
        <p>${esc(pattern.why)}</p>
        <div class="fail-scale">${pattern.origin === 'reported' ? `<div class="scale-track"><i style="width:${Math.round(((pattern.count || 0) / maxHits) * 100)}%"></i></div><span>${pattern.count} thread${pattern.count === 1 ? '' : 's'}${pattern.openCount ? ` · ${pattern.openCount} still open` : ''}</span>` : '<span class="no-count">no matching reports — flagged from the files themselves</span>'}</div>
        ${pattern.threads?.length ? `<div class="fail-evidence">${pattern.threads.map((thread) => `<a href="${esc(thread.url)}" target="_blank" rel="noreferrer noopener">#${thread.number} ${esc(thread.title)}${thread.comments ? ` · ${thread.comments} comments` : ''}</a>`).join('')}</div>` : ''}
        ${pattern.commands?.length ? `<div class="command-block fail-fix"><button class="copy-mini" data-copy="${esc(pattern.commands.join('\n'))}" aria-label="Copy the mitigation" title="Copy mitigation">${icon('copy', 13)}<span>Copy</span></button>${esc(pattern.commands.join('\n'))}</div>` : ''}
      </div>
      <div class="fail-patch">${targetIndex >= 0 ? `<span class="patched">${icon('check', 12)}pre-empted in step ${String(targetIndex + 1).padStart(2, '0')}</span>` : '<span class="unpatched">listed after the run step</span>'}${pattern.origin === 'reported' ? `<button class="link-button" data-action="ask-failure" data-failure="${esc(pattern.id)}">Ask about this${hasAiConfig() ? '' : ' (local)'}</button>` : ''}</div>
    </article>`;
  }).join('');
  return `<section class="panel fail-panel" id="route-failures" aria-labelledby="fail-title" data-reveal>
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('bug', 15)}</div><div><h3 id="fail-title">How this install usually breaks</h3><p class="panel-subtitle">Read before the steps — ranked by what ${esc(scan.totalThreads || 0)} recent ${scan.totalThreads === 1 ? 'thread' : 'threads'} actually say</p></div></div><span class="panel-count">${patterns.length} found</span></div>
    ${signatureStrip(patterns)}
    ${patterns.length ? `<div class="fail-list" data-reveal-stagger>${rows}</div>` : `<div class="fail-empty">${icon('checkCircle', 15)}<span>${esc(scan.notice || 'No installation failures were found in the recent threads.')}</span></div>`}
    <div class="fail-foot"><span>sampled ${scan.sampled?.issues || 0} issues · ${scan.sampled?.pulls || 0} pull requests${scan.sampled?.discussions ? ` · ${scan.sampled.discussions} discussions` : ''}</span>${scan.sources?.discussions === 'none' ? '<span>discussions need a server GitHub token (GraphQL only)</span>' : ''}</div>
    ${scan.notice ? `<p class="field-hint fail-notice">${esc(scan.notice)}</p>` : ''}
  </section>`;
}

// --- Feature 3: multi-path install graph ------------------------------------
function graphSvg(axes, selections, pathLength) {
  if (!axes.length) return '';
  const NW = 158;
  const NH = 38;
  const VGAP = 9;
  const CGAP = 46;
  const PAD = 12;
  const ENDW = 104;
  const columns = [
    [{ kind: 'root', id: 'clone', label: 'clone' }],
    ...axes.map((axis) => axis.options.map((option) => ({ kind: 'option', axisId: axis.id, id: option.id, label: option.label, detail: option.detail }))),
    [{ kind: 'end', id: 'run', label: `${pathLength} step${pathLength === 1 ? '' : 's'}` }],
  ];
  const columnHeight = (count) => count * NH + (count - 1) * VGAP;
  const totalHeight = Math.max(...columns.map((column) => columnHeight(column.length))) + PAD * 2;
  const xFor = (index) => (index === 0 ? PAD : index === columns.length - 1 ? PAD + ENDW + CGAP + (columns.length - 2) * (NW + CGAP) : PAD + ENDW + CGAP + (index - 1) * (NW + CGAP));
  const widthFor = (index) => (index === 0 || index === columns.length - 1 ? ENDW : NW);
  const width = xFor(columns.length - 1) + ENDW + PAD;
  const chosen = columns.map((column, index) => (index === 0 || index === columns.length - 1 ? column[0].id : (selections[axes[index - 1]?.id] ?? column[0]?.id)));
  const nodes = [];
  const edges = [];
  columns.forEach((column, columnIndex) => {
    const top = PAD + (totalHeight - PAD * 2 - columnHeight(column.length)) / 2;
    column.forEach((node, nodeIndex) => {
      node._x = xFor(columnIndex);
      node._y = top + nodeIndex * (NH + VGAP);
      node._w = widthFor(columnIndex);
      node._active = String(chosen[columnIndex]) === String(node.id);
      nodes.push(node);
      if (columnIndex === 0) return;
      columns[columnIndex - 1].forEach((parent) => {
        edges.push({
          x1: parent._x + parent._w,
          y1: parent._y + NH / 2,
          x2: node._x,
          y2: node._y + NH / 2,
          onPath: node._active && String(chosen[columnIndex - 1]) === String(parent.id),
        });
      });
    });
  });
  const shapes = nodes.map((node) => `<rect class="graph-node ${node.kind} ${node._active ? 'active' : ''}" x="${node._x}" y="${node._y}" width="${node._w}" height="${NH}" rx="9"></rect>`);
  const labels = nodes.map((node) => `<text class="graph-text ${node._active ? 'active' : ''}" x="${node._x + 12}" y="${node._y + NH / 2 + 4}">${esc(node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label)}</text>`);
  return `<div class="graph-scroll"><svg class="graph-svg" viewBox="0 0 ${width} ${totalHeight}" width="${width}" height="${totalHeight}" role="group" aria-label="Install path decision graph">
    ${edges.map((edge) => {
    const mid = Math.max(12, (edge.x2 - edge.x1) / 2);
    return `<path class="graph-edge ${edge.onPath ? 'on-path' : ''}" d="M${edge.x1},${edge.y1} C${edge.x1 + mid},${edge.y1} ${edge.x2 - mid},${edge.y2} ${edge.x2},${edge.y2}"></path>`;
  }).join('')}
    ${shapes.join('')}
    ${labels.join('')}
    ${nodes.filter((node) => node.kind === 'option').map((node) => `<g class="graph-hit" data-axis="${esc(node.axisId)}" data-option="${esc(node.id)}" role="button" tabindex="0" aria-label="${esc(node.label)}: ${esc(node.detail || '')}"><rect x="${node._x}" y="${node._y}" width="${node._w}" height="${NH}" rx="9" fill="transparent"></rect></g>`).join('')}
  </svg></div>`;
}

function graphAltSelects(graph) {
  // Readable stepwise alternative for small screens and keyboard users.
  return `<details class="graph-alt"><summary>Choose branches as a list</summary><div class="graph-alt-body">${graph.axes.map((axis) => `<label class="graph-alt-row"><span><strong>${esc(axis.label)}</strong><em>${esc(axis.prompt)}</em></span><select class="select-field" data-graph-axis="${esc(axis.id)}" aria-label="${esc(axis.label)}">${axis.options.map((option) => `<option value="${esc(option.id)}" ${String(state.pathSelections[axis.id]) === String(option.id) ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>`).join('')}</div></details>`;
}

function pathGraphPanel() {
  const graph = state.guide?.pathGraph;
  if (!graph?.axes?.length) return '';
  const steps = activePath();
  const pills = steps.map((entry, index) => `<span class="path-pill ${state.checked[keyOf(entry)] ? 'done' : ''}">${String(index + 1).padStart(2, '0')} ${esc(entry.title)}</span>`).join('');
  const label = selectionsLabel(graph.axes, state.pathSelections);
  return `<section class="panel graph-panel" id="route-graph" aria-labelledby="graph-title" data-reveal>
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('graph', 15)}</div><div><h3 id="graph-title">Choose your path</h3><p class="panel-subtitle">${esc(graph.note || 'Pick a branch — only the relevant steps stay in the checklist.')}</p></div></div>${label ? `<span class="panel-count path-selection">${esc(label)}</span>` : ''}</div>
    ${graphSvg(graph.axes, state.pathSelections, steps.length)}
    ${graphAltSelects(graph)}
    <div class="graph-axis-labels">${graph.axes.map((axis) => `<div class="axis-label"><strong>${esc(axis.label)}</strong><span>${esc(axis.prompt)}</span></div>`).join('')}</div>
    ${(() => {
    const chosen = graph.axes.map((axis) => axis.options.find((option) => option.id === state.pathSelections[axis.id])).filter(Boolean);
    const alerts = [
      ...chosen.filter((option) => option.warning).map((option) => ({ tone: 'warn', text: option.warning })),
      ...chosen.filter((option) => option.tradeoff).map((option) => ({ tone: 'info', text: option.tradeoff })),
    ];
    if (!alerts.length) return '';
    return `<div class="graph-detail">${alerts.map((alert) => `<div class="graph-tradeoff ${alert.tone === 'warn' ? 'warn' : ''}">${icon(alert.tone === 'warn' ? 'warning' : 'info', 13)}<span>${esc(alert.text)}</span></div>`).join('')}</div>`;
  })()}
    <div class="path-pills"><span class="pills-label">${icon('list', 12)}${steps.length} steps on this branch</span>${pills}</div>
    ${Object.keys(state.pathSelections).length ? `<div class="graph-foot"><button class="link-button" data-action="path-reset">${icon('restore', 12)} Reset to the recommended path</button></div>` : ''}
  </section>`;
}

function setPathOption(axisId, optionId) {
  state.pathSelections = { ...state.pathSelections, [axisId]: optionId };
  persistSession();
  render();
}

function resetPath() {
  state.pathSelections = { ...(state.guide?.pathGraph?.defaults || {}) };
  persistSession();
  render();
  showToast('Back to the recommended path.');
}

// --- Feature 1: the living checklist ---------------------------------------
function stepStatus(entry, key) {
  const isDone = Boolean(state.checked[key]);
  const isFailed = failedIds().has(String(entry.id));
  if (isFailed) return { code: 'failed', label: 'Needs fix' };
  if (isDone) return { code: 'done', label: 'Confirmed' };
  if (entry.revision > 1) return { code: 'revised', label: 'Corrected' };
  return { code: 'pending', label: 'Pending' };
}

function installStepsPanel() {
  const steps = activePath();
  const { done, total, percent } = progressOf(steps, state.checked);
  const revision = currentRevision();
  const profile = expertiseProfile();
  const rows = steps.map((entry, index) => {
    const key = keyOf(entry, index);
    const isDone = Boolean(state.checked[key]);
    const isFailed = failedIds().has(String(entry.id));
    const status = stepStatus(entry, key);
    const patched = (entry.patchedFor || []).map((id) => (state.guide?.failureScan?.patterns || []).find((pattern) => pattern.id === id)?.label).filter(Boolean);
    return `<article class="step-row ${isDone ? 'is-done' : ''} ${isFailed ? 'is-failed' : ''} ${entry.revision > 1 ? 'is-revised' : ''}">
      <div class="step-rail" aria-hidden="true"><span class="step-dot status-${status.code}">${status.code === 'done' ? icon('check', 11) : status.code === 'failed' ? icon('warning', 11) : ''}</span>${index < steps.length - 1 ? '<span class="step-line"></span>' : ''}</div>
      <div class="step-number">${entry.revision > 1 ? icon('history', 13) : String(index + 1).padStart(2, '0')}</div>
      <div class="step-body">
        <h4 class="step-title"><span class="step-id mono">${esc(entry.id)}</span>${esc(entry.title)}${entry.revision > 1 ? '<span class="rev-badge">revised</span>' : ''}</h4>
        <p class="step-state">Status: ${status.label}${isDone && entry.revision > 1 ? ' · kept through revision' : ''}</p>
        ${entry.detail ? `<p class="step-detail">${esc(entry.detail)}</p>` : ''}
        ${entry.guard ? `<p class="step-guard">${icon('shieldLock', 12)}${esc(entry.guard)}</p>` : ''}
        ${patched.length ? `<p class="step-patch">${icon('check', 12)}patched for: ${patched.map(esc).join(', ')}</p>` : ''}
        ${entry.command ? `<div class="command-block"><button class="copy-mini" data-copy="${esc(entry.command)}" aria-label="Copy command" title="Copy command">${icon('copy', 13)}<span>Copy</span></button>${esc(entry.command)}</div>` : ''}
        ${entry.verify ? `<div class="command-block verify-block">${icon('check', 13, 'verify-icon')}<button class="copy-mini" data-copy="${esc(entry.verify)}" aria-label="Copy check" title="Copy check">${icon('copy', 13)}<span>Copy</span></button>${esc(entry.verify)}</div>` : ''}
        <div class="step-actions">
          ${isDone ? `<button class="link-button" data-action="unfail" data-step="${esc(entry.id)}">Reopen</button>` : ''}
          <button class="fail-button" data-action="step-failed" data-step="${esc(entry.id)}">${icon('warning', 12)} This failed</button>
          ${isFailed ? `<span class="failed-tag">${state.failures.filter((item) => String(item.stepId) === String(entry.id)).length} recovery attempt${state.failures.filter((item) => String(item.stepId) === String(entry.id)).length === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>
      <input class="step-check" type="checkbox" data-step-id="${esc(key)}" ${isDone ? 'checked' : ''} aria-label="Mark ${esc(entry.title)} complete" />
    </article>`;
  }).join('');
  const hidden = state.guide?.hiddenNotes || 0;
  return `<section class="panel steps-panel" id="route-path" aria-labelledby="steps-title" data-reveal>
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('route', 15)}</div><div><h3 id="steps-title">Installation steps</h3><p class="panel-subtitle">A live path — it changes when something fails${revision > 1 ? `, now on revision ${revision}` : ''}</p></div></div><span class="panel-count">${done}/${total} complete</span></div>
    <div class="install-list" data-reveal-stagger>${rows || '<div class="fail-empty"><span>No steps were produced for this path. Try another branch of the graph.</span></div>'}</div>
    <div class="install-progress"><div class="progress-copy"><span>${percent === 100 ? 'Installation path complete — tick the contract to close it out' : 'Progress through your installation path'}</span><strong>${percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div></div>
    <div class="steps-foot">
      <span class="tempo-note">${icon('compass', 12)}${esc(profile.short)} · ${esc(profile.explanation === 'minimal' ? 'prose hidden, one copy-paste block available' : profile.explanation === 'full' ? 'every step explains why it exists' : 'one line of reasoning per step')}</span>
      ${state.guide?.fastPath ? `<button class="secondary-button" data-copy="${esc(state.guide.fastPath)}">${icon('copy', 13)} Copy whole path</button>` : ''}
      ${hidden ? `<button class="link-button" data-action="toggle-hidden-notes">${icon(state.showHiddenNotes ? 'eyeOff' : 'eye', 12)} ${state.showHiddenNotes ? 'Hide' : `Show ${hidden} quieter note${hidden === 1 ? '' : 's'}`}</button>` : ''}
      ${revision > 1 ? `<button class="link-button" data-action="path-restore">${icon('restore', 12)} Restore the original path</button>` : ''}
    </div>
  </section>`;
}

function recoveryReport() {
  const recovery = state.recovery;
  if (!recovery) return '';
  const matched = (recovery.matched || []).map((entry) => `<li><strong>${esc(entry.label || entry.id)}</strong>${entry.hit ? `<code>${esc(String(entry.hit).slice(0, 80))}</code>` : ''}</li>`).join('');
  const checks = (recovery.checks || []).map((check) => `<div class="command-block"><button class="copy-mini" data-copy="${esc(check)}" aria-label="Copy check" title="Copy check">${icon('copy', 13)}<span>Copy</span></button>${esc(check)}</div>`).join('');
  return `<section class="panel recovery-panel" aria-labelledby="recovery-title" aria-live="polite">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('lifebuoy', 15)}</div><div><h3 id="recovery-title">Recovery applied — revision ${Number(recovery.revision) || currentRevision()}</h3><p class="panel-subtitle">Completed steps are locked and untouched. Only the failing step forward was rewritten.</p></div></div><span class="panel-count">${esc(recovery.source === 'ai' ? 'AI diagnosis' : 'local rule match')} · ${esc(recovery.confidence || 'medium')} confidence</span></div>
    <div class="recovery-body">
      <p class="recovery-diagnosis">${safe(recovery.diagnosis || 'The path was rebuilt from the fault forward.')}</p>
      ${recovery.secondSuspect ? `<p class="recovery-second">${safe(recovery.secondSuspect)}</p>` : ''}
      ${matched ? `<h4>Matched signatures</h4><ul class="recovery-list">${matched}</ul>` : ''}
      ${checks ? `<h4>Prove the fix landed</h4>${checks}` : ''}
      ${(recovery.followUps || []).length ? `<h4>Answer next</h4><ul class="recovery-list">${recovery.followUps.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
      ${recovery.note ? `<p class="field-hint">${safe(recovery.note)}</p>` : ''}
      <div class="recovery-actions"><button class="secondary-button" data-action="path-restore">${icon('restore', 13)} Roll back this revision</button><button class="link-button" data-action="recovery-dismiss">Dismiss report</button></div>
    </div>
  </section>`;
}

function revisionTrail() {
  if (!state.revisions.length) return '';
  return `<section class="panel rev-panel" aria-labelledby="rev-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('history', 15)}</div><div><h3 id="rev-title">How this path changed</h3><p class="panel-subtitle">Every correction stays on the record — nothing is silently rewritten</p></div></div><span class="panel-count">${state.revisions.length} revision${state.revisions.length === 1 ? '' : 's'}</span></div>
    <ol class="rev-list">${state.revisions.map((entry) => `<li class="rev-item">
      <div class="rev-marker">v${entry.revision}</div>
      <div class="rev-body"><h4>${esc(entry.failedStepTitle)} did not work</h4><p>${esc(entry.diagnosis)}</p>
      <div class="rev-meta"><span>${esc(entry.source === 'ai' ? 'AI diagnosis' : 'local rule match')}</span><span>${esc(entry.confidence)} confidence</span>${entry.added ? `<span>+${entry.added} step${entry.added === 1 ? '' : 's'}</span>` : ''}${entry.removed ? `<span>−${entry.removed} step${entry.removed === 1 ? '' : 's'}</span>` : ''}<span>${formatDate(entry.at)}</span></div>
      </div>
    </li>`).join('')}</ol>
  </section>`;
}

// --- Feature 1: failure dialog + recovery ----------------------------------
function failureModal() {
  const step = (state.guide?.steps || []).find((entry) => String(entry.id) === String(state.failure.stepId)) || {};
  const known = (state.guide?.failureScan?.patterns || []).filter((pattern) => !state.failure.stepId || !pattern.patchStepId || pattern.patchStepId === step.id).slice(0, 4);
  const loading = state.failure.saving;
  const completedCount = activePath().findIndex((entry) => String(entry.id) === String(step.id));
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal fail-modal" role="dialog" aria-modal="true" aria-labelledby="fail-modal-title">
    <div class="modal-head"><div><h2 id="fail-modal-title">“${esc(step.title || 'This step')}” failed</h2><p>Git-Up keeps everything you already completed and rebuilds the path from here. Nothing is re-run.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close', 18)}</button></div>
    <form class="modal-body" id="failure-form">
      <label class="form-field" for="failure-error"><span class="field-label">Paste what the terminal said <em>helps most</em></span>
        <textarea id="failure-error" class="text-field failure-text" rows="7" spellcheck="false" placeholder="npm ERR! code ERESOLVE&#10;npm ERR! Could not resolve dependency tree…">${esc(state.failure.errorText)}</textarea>
        <span class="field-hint">Kept on this machine and only sent to your active AI provider when connected. Even one line usually matches a known signature. Keys that look like secrets are redacted from anything shown back.</span>
      </label>
      ${known.length ? `<div class="form-field"><span class="field-label">Or start from what this repo’s issues already show</span><div class="quick-picks">${known.map((pattern) => `<button type="button" class="quick-pick" data-failure-pick="${esc(pattern.why)}">${esc(pattern.label)}${pattern.count ? ` · ${pattern.count}` : ''}</button>`).join('')}</div></div>` : ''}
      <label class="form-field"><span class="field-label">What happened, in words (optional)</span><input id="failure-note" class="text-field" value="${esc(state.failure.note)}" placeholder="It printed a warning then exited" /></label>
      <div class="fail-expect"><span>${icon('shieldLock', 12)}</span><p>Your ${completedCount < 0 ? 0 : completedCount} completed step${completedCount === 1 ? '' : 's'}${state.revisions.length ? ` and ${state.revisions.length} earlier revision${state.revisions.length === 1 ? '' : 's'}` : ''} stay exactly as they are. Only the failing step and what follows it get rewritten.</p></div>
      ${state.failure.error ? `<div class="error-banner" role="alert">${icon('warning', 15)}<span>${safe(state.failure.error)}</span></div>` : ''}
      <div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="install-button" type="submit" ${loading ? 'disabled' : ''}>${loading ? `${icon('loader', 14, 'spinner')} Rebuilding the path` : `${icon('sparkles', 14)} Rebuild this path`}</button></div>
    </form>
  </section></div>`;
}

function openFailure(stepId) {
  state.modal = 'failure';
  state.failure = { stepId, errorText: state.failure?.errorText || '', note: '', saving: false, error: '' };
  render();
  setTimeout(() => document.querySelector('#failure-error')?.focus(), 40);
}

async function submitRecovery(event) {
  event?.preventDefault?.();
  const steps = activePath();
  const index = steps.findIndex((entry) => String(entry.id) === String(state.failure.stepId));
  const failedStep = steps[index] || steps[0];
  const textarea = document.querySelector('#failure-error');
  const noteInput = document.querySelector('#failure-note');
  const errorText = `${textarea?.value || ''}${noteInput?.value ? `\nuser note: ${noteInput.value}` : ''}`.trim();
  state.failure = { ...state.failure, errorText: textarea?.value || '', note: noteInput?.value || '', saving: true, error: '' };
  render();
  try {
    const body = {
      repoUrl: state.repoUrl,
      failedStepId: failedStep?.id || '',
      errorText,
      expertise: state.expertise,
      revision: currentRevision(),
      completedSteps: steps.slice(0, Math.max(0, index)),
      remainingSteps: steps.slice(Math.max(0, index)),
      guide: { requirements: state.guide?.requirements || [], steps: state.guide?.steps || [], failureScan: state.guide?.failureScan },
    };
    const recovery = await generateAI('recover', body);
    if (!state.guide.originalSteps) state.guide.originalSteps = state.guide.steps.map((entry) => ({ ...entry }));
    const previous = state.guide.steps;
    const revised = applyRevision(previous, recovery, failedStep?.id);
    revised.steps.forEach((entry) => {
      const origin = previous.find((item) => String(item.id) === String(entry.id));
      if (origin) entry.revision = Math.max(2, Number(origin.revision || 1));
    });
    state.guide = { ...state.guide, steps: revised.steps };
    state.superseded = [...state.superseded, ...revised.superseded];
    state.failures = [...state.failures, { stepId: failedStep?.id, at: new Date().toISOString(), errorText: errorText.slice(0, 1200), diagnosis: recovery.diagnosis, source: recovery.source, revision: recovery.revision }];
    state.revisions = [...state.revisions, revisionEntry({ revision: recovery.revision, failedStep, recovery, previousCount: previous.length, nextCount: revised.steps.length, source: recovery.source })];
    state.recovery = recovery;
    state.modal = null;
    state.failure = { stepId: '', errorText: '', note: '', saving: false, error: '' };
    persistSession();
    render();
    document.querySelector('.recovery-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast(recovery.source === 'ai' ? 'Path rebuilt from your error and the repository files.' : 'Path rebuilt from a known failure pattern. Connect an AI provider for a repo-specific diagnosis.', recovery.source === 'ai' ? 'success' : 'error');
  } catch (error) {
    state.failure = { ...state.failure, saving: false, error: error.message };
    render();
  }
}

function restoreOriginalPath() {
  if (!state.guide?.originalSteps?.length) return;
  state.guide = { ...state.guide, steps: state.guide.originalSteps.map((entry) => ({ ...entry })) };
  state.revisions = [];
  state.superseded = [];
  state.failures = [];
  state.recovery = null;
  persistSession();
  render();
  showToast('Original path restored. Completed steps were kept.');
}

function unfailStep(stepId) {
  state.failures = state.failures.filter((entry) => String(entry.stepId) !== String(stepId));
  persistSession();
  render();
}

// --- Feature 4: install contract -------------------------------------------
function contractPanel() {
  const contract = state.guide?.contract;
  if (!contract) return '';
  const items = contract.checklist || [];
  const ticked = items.filter((item) => state.contractChecked[item.id]).length;
  const riskTone = { high: 'red', medium: 'amber', low: 'mint' };
  const section = (title, body) => `<div class="contract-section"><h4>${esc(title)}</h4>${body}</div>`;
  return `<section class="panel contract-panel" id="route-contract" aria-labelledby="contract-title" data-reveal>
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('shield', 15)}</div><div><h3 id="contract-title">Install contract</h3><p class="panel-subtitle">What this path assumes, changes, and requires — check it off when the app is running</p></div></div><span class="panel-count">${ticked}/${items.length} verified</span></div>
    <div class="contract-meta">
      <span class="mono contract-id">${esc(contract.contractId)}</span>
      <span>${esc(contract.basis?.source || '')}</span>
      <span>${contract.basis?.fileCount || 0} files as evidence</span>
      <span>${formatDate(contract.issuedAt)}</span>
    </div>
    <div class="contract-grid">
      ${section('Exact versions expected', contract.expects?.length ? `<ul class="contract-list">${contract.expects.map((entry) => `<li><div><strong>${esc(entry.name)}</strong><code>${esc(entry.required)}</code></div><span class="from">${esc(entry.detectedFrom)}</span><em class="conf-${entry.confidence}">${esc(entry.confidence)}</em></li>`).join('')}</ul>` : '<p class="contract-none">Nothing is pinned by the project itself — see the gap note below.</p>')}
      ${section('What gets installed', contract.installs?.length ? `<ul class="contract-list">${contract.installs.map((entry) => `<li><div><strong>${esc(entry.what)}</strong><span>${esc(entry.detail)}</span></div><em class="scope">${esc(entry.kind)}</em></li>`).join('')}</ul>` : '<p class="contract-none">No manifest was readable, so nothing could be listed.</p>')}
      ${section('Permissions this needs', `<ul class="contract-list">${(contract.permissions || []).map((entry) => `<li><div><strong>${esc(entry.capability)}</strong><span>${esc(entry.why)}</span></div><em class="risk tone-${riskTone[entry.risk] || 'mint'}">${esc(entry.risk)}</em></li>`).join('')}</ul>`)}
      ${section('What “working” looks like', `<p class="contract-state">${esc(contract.workingState)}</p>${contract.verification?.command ? `<div class="command-block verify-block">${icon('check', 13, 'verify-icon')}<button class="copy-mini" data-copy="${esc(contract.verification.command)}" aria-label="Copy verification command" title="Copy verification">${icon('copy', 13)}<span>Copy</span></button>${esc(contract.verification.command)}</div><p class="expect-line">${icon('check', 12)}${esc(contract.verification.expect)}</p>` : ''}`)}
    </div>
    ${contract.gaps?.length ? `<div class="contract-gaps"><h4>${icon('info', 13)} What this contract could not determine</h4><ul>${contract.gaps.map((gap) => `<li><strong>${esc(gap.field)}</strong> — ${esc(gap.reason)}</li>`).join('')}</ul></div>` : ''}
    <div class="contract-check">
      <h4>After you finish, confirm</h4>
      <ul>${items.map((item) => `<li class="${state.contractChecked[item.id] ? 'ticked' : ''}"><label><input type="checkbox" data-contract-id="${esc(item.id)}" ${state.contractChecked[item.id] ? 'checked' : ''} /><span>${esc(item.label)}</span></label>${item.hint ? `<code>${esc(item.hint)}</code>` : ''}</li>`).join('')}</ul>
      ${items.length && ticked === items.length ? `<div class="contract-signed">${icon('checkCircle', 14)}<span>Contract satisfied — ${esc(contract.contractId)} verified on this machine.</span></div>` : ''}
    </div>
    <div class="contract-sign">
      <div class="sign-block"><span>sealed by</span><strong>${esc(contract.signature.by)}</strong><em>${esc(contract.signature.method)}</em></div>
      <div class="sign-hash mono">${esc(contract.contractId)}<span>${contract.signature.evidenceCount} files · health ${contract.signature.healthScore ?? '—'}</span></div>
    </div>
    <ul class="contract-guarantees">${(contract.guarantees || []).map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
  </section>`;
}

function toggleContractItem(id) {
  state.contractChecked = { ...state.contractChecked, [id]: !state.contractChecked[id] };
  persistSession();
  render();
}

function closeModal() {
  // Clean up any focus trap from the outgoing modal.
  const oldModal = root.querySelector('.modal[aria-modal="true"]');
  if (oldModal?._trapHandler) { document.removeEventListener('keydown', oldModal._trapHandler); oldModal._trapHandler = null; }
  if (state.modal === 'settings' && state.ai.busy === 'connect') aiService.cancelFreeAiConnection();
  state.modal = null;
  render();
  if (state.lastFocusId) {
    const target = document.querySelector(`[data-action="${state.lastFocusId}"]`) || (state.mode === 'analysis' ? null : document.querySelector('#repo-input'));
    target?.focus?.();
    state.lastFocusId = '';
  }
}

/** Keep Tab / Shift+Tab inside the currently open modal. */
function trapFocus() {
  const modal = root.querySelector('.modal[aria-modal="true"]');
  if (!modal) return;
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const handler = (event) => {
    if (event.key !== 'Tab') return;
    if (event.shiftKey) { if (document.activeElement === first) { event.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { event.preventDefault(); first.focus(); } }
  };
  document.addEventListener('keydown', handler);
  first?.focus?.();
  // Store the handler so it can be removed on close (leak is bounded by re-render).
  modal._trapHandler = handler;
}

function mobileBottomNav() {
  const isAnalysis = state.mode === 'analysis' && state.guide;
  const items = [
    { id: 'nav-route', label: 'Route', icon: 'route', action: 'scroll-path', show: isAnalysis },
    { id: 'nav-graph', label: 'Graph', icon: 'graph', action: 'scroll-graph', show: isAnalysis },
    { id: 'nav-contract', label: 'Contract', icon: 'shield', action: 'scroll-contract', show: isAnalysis },
    { id: 'nav-palette', label: 'Menu', icon: 'command', action: 'palette', show: true },
    { id: 'nav-settings', label: 'AI', icon: 'aiSettings', action: 'settings', show: true },
  ];
  const visible = items.filter((item) => item.show);
  return `<nav class="mobile-nav" aria-label="Mobile sections">${visible.map((item) => `<button class="mobile-nav-item" data-action="${item.action}" aria-label="${item.label}">${icon(item.icon, 18)}<span>${item.label}</span></button>`).join('')}</nav>`;
}

// --- Command palette (Ctrl/Cmd+K) -------------------------------------------
// MagicUI command-menu port: keyboard-first navigation and actions. Replaces a
// decorative dock — in a tool like this, quick keyboard access is the useful
// version of "floating navigation".
function paletteActions() {
  const analysis = state.mode === 'analysis' && state.guide;
  const scroll = (id) => () => { closeModal(); document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const actions = [
    { id: 'new-analysis', label: 'Start a new analysis', icon: 'add', group: 'Actions', run: () => { closeModal(); newAnalysis(); } },
  ];
  if (analysis) {
    actions.push(
      { id: 'go-path', label: 'Go to installation steps', icon: 'route', group: 'Sections', hint: '1', run: scroll('#route-path') },
      { id: 'go-failures', label: 'Go to failure evidence', icon: 'bug', group: 'Sections', hint: '2', run: scroll('#route-failures') },
      { id: 'go-graph', label: 'Go to path graph', icon: 'graph', group: 'Sections', hint: '3', run: scroll('#route-graph') },
      { id: 'go-contract', label: 'Go to install contract', icon: 'shield', group: 'Sections', hint: '4', run: scroll('#route-contract') },
      { id: 'go-evidence', label: 'Go to files and evidence', icon: 'book', group: 'Sections', hint: '5', run: scroll('#route-evidence') },
      { id: 'install', label: 'Generate install script', icon: 'terminal', group: 'Actions', run: () => { closeModal(); state.lastFocusId = 'install'; state.modal = 'install'; render(); } },
    );
  }
  actions.push(
    { id: 'settings', label: 'AI provider settings', icon: 'aiSettings', group: 'Actions', run: () => { closeModal(); openAiSettings(); } },
    { id: 'theme', label: state.theme === 'light' ? 'Switch to dark mode' : 'Switch to daylight mode', icon: state.theme === 'light' ? 'moon' : 'sun', group: 'Actions', run: () => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('git-up-theme', state.theme); } catch { /* ignore */ }
      closeModal();
    } },
  );
  const recent = state.history.slice(0, 4).map((entry) => ({
    id: `history-${entry.id}`,
    label: displayName(entry),
    icon: 'history',
    group: 'Recent repositories',
    run: () => { closeModal(); restoreHistory(entry.id); },
  }));
  return [...actions, ...recent];
}

function filteredPaletteActions() {
  const query = state.palette.query.trim().toLowerCase();
  const all = paletteActions();
  if (!query) return all;
  return all.filter((action) => `${action.label} ${action.group || ''}`.toLowerCase().includes(query));
}

function paletteModal() {
  const actions = filteredPaletteActions();
  const index = Math.max(0, Math.min(state.palette.index, actions.length - 1));
  const active = actions[index];
  const option = (action, position) => `
    <button class="palette-option ${position === index ? 'active' : ''}" id="palette-opt-${esc(action.id)}" role="option" aria-selected="${position === index}" data-palette-id="${esc(action.id)}">
      <span class="palette-ic">${icon(action.icon, 15)}</span><span>${esc(action.label)}</span>
      ${action.hint ? `<span class="palette-hint">${esc(action.hint)}</span>` : ''}
    </button>`;
  let listHtml = '';
  if (!actions.length) {
    listHtml = '<div class="palette-empty">Nothing matches. Try a section name, "settings", or "install".</div>';
  } else if (state.palette.query.trim()) {
    listHtml = actions.map((action, position) => option(action, position)).join('');
  } else {
    let lastGroup = '';
    actions.forEach((action, position) => {
      if (action.group !== lastGroup) {
        lastGroup = action.group;
        listHtml += `<div class="palette-group-label" role="presentation">${esc(action.group)}</div>`;
      }
      listHtml += option(action, position);
    });
  }
  return `<div class="modal-layer" data-action="close-on-backdrop">
    <section class="modal palette-modal" role="dialog" aria-modal="true" aria-label="Command menu">
      <div class="palette-input-wrap">${icon('search', 16)}<input id="palette-input" class="palette-input" role="combobox" aria-expanded="${actions.length ? 'true' : 'false'}" aria-controls="palette-list" aria-activedescendant="${active ? `palette-opt-${esc(active.id)}` : ''}" placeholder="Type a command, section, or repository…" value="${esc(state.palette.query)}" autocomplete="off" spellcheck="false" /></div>
      <div class="palette-list" id="palette-list" role="listbox" aria-label="Commands">${listHtml}</div>
      <div class="palette-foot"><span><kbd class="palette-key">↑↓</kbd> navigate</span><span><kbd class="palette-key">↵</kbd> run</span><span><kbd class="palette-key">esc</kbd> close</span><span><kbd class="palette-key">ctrl k</kbd> toggle</span></div>
    </section>
  </div>`;
}

function runPaletteAction(id) {
  const action = paletteActions().find((entry) => entry.id === id);
  if (!action) return;
  action.run();
}

function movePaletteIndex(delta) {
  const count = filteredPaletteActions().length;
  if (!count) return;
  state.palette.index = (state.palette.index + delta + count) % count;
  render();
}

function togglePalette() {
  if (state.modal === 'palette') { closeModal(); return; }
  state.palette = { query: '', index: 0 };
  state.lastFocusId = '';
  state.modal = 'palette';
  render();
}

function render() {
  // A new major view re-arms the scroll reveal; renders within one view are
  // sealed by bindReveals so checkbox ticks and branch switches never flicker.
  try {
    if (document.documentElement && render.lastMode !== state.mode) {
      document.documentElement.classList.remove('reveal-done');
      render.lastMode = state.mode;
    }
  } catch { /* ignore */ }
  let content = '';
  // The particle host lives ONLY inside <main>: navbar, sidebar, modals,
  // toasts and the mobile nav are sibling layers and stay clean. .main-inner
  // paints above the canvas (z-index 1) so every control stays interactive.
  // The particles.js engine initializes into #particles-workspace exactly
  // once (see initParticles); render() preserves the live node below.
  const workspace = (inner) => `<main class="main" id="main-content"><div id="particles-workspace" aria-hidden="true"></div><div class="main-inner">${inner}</div></main>`;
  if (state.mode === 'loading') content = workspace(`${repoForm()}${loadingView()}`);
  else if (state.mode === 'analysis' && state.guide) content = workspace(`${repoForm()}${analysisView()}`);
  else content = workspace(`${emptyView()}`);
  const mobileNav = state.mode !== 'loading' ? mobileBottomNav() : '';
  try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('data-theme', state.theme === 'light' ? 'light' : 'dark'); } catch { /* ignore */ }
  // Preserve the live particle nodes across innerHTML rebuilds so the engines
  // keep their single canvas + rAF loops instead of re-initializing.
  let liveField = null;
  let liveTopbar = null;
  try {
    if (typeof document !== 'undefined' && document.querySelector) {
      liveField = document.querySelector('#particles-workspace');
      liveTopbar = document.querySelector('#topbar-contrib');
    }
  } catch { liveField = null; liveTopbar = null; }
  root.innerHTML = `<div class="app-shell">${topbar()}<div class="layout">${sidebar()}${content}</div>${mobileNav}${state.modal === 'settings' ? settingsModal() : ''}${state.modal === 'install' ? installModal() : ''}${state.modal === 'failure' ? failureModal() : ''}${state.modal === 'palette' ? paletteModal() : ''}${toastHtml()}${oreoHtml()}<div class="sr-only" aria-live="polite">${esc(liveSummary())}</div></div>`;
  try {
    if (typeof document !== 'undefined' && document.querySelector) {
      const freshField = document.querySelector('#particles-workspace');
      if (liveField && freshField && freshField !== liveField && liveField.querySelector('.particles-js-canvas-el')) freshField.replaceWith(liveField);
      const freshTopbar = document.querySelector('#topbar-contrib');
      if (liveTopbar && freshTopbar && freshTopbar !== liveTopbar && liveTopbar.querySelector('canvas')) freshTopbar.replaceWith(liveTopbar);
    }
  } catch { /* ignore */ }
  bindEvents();
  if (state.modal) trapFocus();
}

/** Short screen-reader summary of the current route state. */
function liveSummary() {
  if (state.mode !== 'analysis' || !state.guide) return '';
  const steps = activePath();
  const { done, total } = progressOf(steps, state.checked);
  return `Route for ${shortName(state.guide)}: ${done} of ${total} steps confirmed${state.revisions.length ? `, revision ${currentRevision()}` : ''}.`;
}

function resetOreoForRepo() {
  // Keep the conversation across analyses so context is not lost; just make
  // sure the welcome exists. The header already shows the current repo name.
  ensureOreoWelcome();
}

async function analyze() {
  const input = document.querySelector('#repo-input');
  state.repoUrl = input?.value.trim() || state.repoUrl.trim();
  state.error = '';
  state.progress = { phase: '', label: '', percent: 0, error: '' };
  if (!state.repoUrl) { state.error = 'Paste a GitHub repository URL to begin.'; render(); return; }
  state.mode = 'loading';
  state.guide = null;
  state.checked = {};
  resetOreoForRepo();
  state.openMenuId = null;
  state.renamingId = null;
  render();

  const finish = (guide) => {
    state.progress = { phase: '', label: '', percent: 0, error: '' };
    state.guide = guide;
    state.mode = 'analysis';
    emptySession();
    state.pathSelections = { ...(guide.pathGraph?.defaults || {}) };
    state.recovery = null;
    state.explanationIndex = 0;
    state.expandedDirs = {};
    state.treeFilter = '';
    const historyEntry = { id: uid(), url: state.repoUrl, name: shortName(guide), label: '', analyzedAt: guide.analyzedAt, guide, session: sessionSnapshot() };
    state.history = [historyEntry, ...state.history.filter((entry) => entry.url !== state.repoUrl)].slice(0, 20);
    persistHistory();
    render();
  };

  const fail = (error) => {
    state.mode = 'empty';
    state.progress = { phase: '', label: '', percent: 0, error: '' };
    state.error = error?.message || 'Analysis failed. Check the URL and try again.';
    render();
  };

  try {
    const guide = await generateAI('analyze', { repoUrl: state.repoUrl, expertise: state.expertise }, (progress) => {
      state.progress = progress;
      render();
    });
    if (!guide) throw new Error('The repository could not be analyzed.');
    finish(guide);
  } catch (error) {
    fail(error);
  }
}

function readSettingsFromForm() {
  const baseUrl = document.querySelector('#base-url')?.value.trim() || '';
  const endpoint = document.querySelector('#endpoint')?.value.trim() || '/chat/completions';
  const apiKey = document.querySelector('#api-key')?.value.trim() || '';
  const model = document.querySelector('#model')?.value || '';
  return { baseUrl, endpoint, apiKey, model };
}
async function fetchModels() {
  const button = document.querySelector('[data-action="fetch-models"]');
  const status = document.querySelector('#settings-status');
  const values = readSettingsFromForm();
  if (!values.baseUrl || !values.apiKey) { if (status) { status.className = 'settings-status bad'; status.textContent = 'Add a base URL and API key first.'; } return; }
  if (button) { button.disabled = true; button.innerHTML = `${icon('loader', 13, 'spinner')} Fetching…`; }
  if (status) { status.className = 'settings-status'; status.textContent = 'Contacting your provider…'; }
  try {
    state.modelOptions = await aiService.fetchCustomModels({ baseUrl: values.baseUrl, apiKey: values.apiKey });
    state.settings = { ...state.settings, ...values };
    state.ai.customError = false;
    render();
    const newStatus = document.querySelector('#settings-status');
    if (newStatus) { newStatus.className = 'settings-status good'; newStatus.textContent = `${state.modelOptions.length} model${state.modelOptions.length === 1 ? '' : 's'} available. Select one below.`; }
  } catch (error) {
    state.settings = { ...state.settings, ...values };
    state.ai.customError = true;
    render();
    const newStatus = document.querySelector('#settings-status');
    if (newStatus) { newStatus.className = 'settings-status bad'; newStatus.textContent = error.message || 'Could not fetch models.'; }
  }
}

function saveSettings(event) {
  event.preventDefault();
  const values = readSettingsFromForm();
  state.settings = values;
  state.ai.activeProvider = AI_PROVIDER.CUSTOM;
  state.ai.customError = false;
  try { sessionStorage.setItem('git-up-api-key', values.apiKey); } catch { /* session-only storage may be disabled */ }
  persistAiSettings();
  closeModal();
  showToast(hasCustomAiConfig() ? 'Custom API connected for this session.' : 'Provider configuration saved. Local scan remains available.');
}

function captureCustomSettings() {
  if (!document.querySelector('#base-url')) return;
  const values = readSettingsFromForm();
  state.settings = { ...state.settings, ...values };
  try { sessionStorage.setItem('git-up-api-key', values.apiKey); } catch { /* ignore */ }
}

function switchAiProvider(nextProvider) {
  const next = normaliseAiProvider(nextProvider);
  if (state.ai.activeProvider === AI_PROVIDER.CUSTOM) captureCustomSettings();
  if (next !== AI_PROVIDER.POLLINATIONS && state.ai.busy === 'connect') aiService.cancelFreeAiConnection();
  state.ai.activeProvider = next;
  state.ai.authorization = null;
  persistAiSettings();
  render();
  if (state.modal === 'settings') setTimeout(() => document.querySelector(`[name="ai-provider"][value="${next}"]`)?.focus(), 0);
  if (next === AI_PROVIDER.POLLINATIONS
    && state.ai.busy !== 'connect'
    && state.ai.pollinationsStatus !== AI_CONNECTION.POLLINATIONS_ERROR) refreshFreeAiConnection();
}

async function refreshFreeAiConnection() {
  try {
    const connected = await aiService.isFreeAiConnected();
    state.ai.pollinationsStatus = connected ? AI_CONNECTION.POLLINATIONS_CONNECTED : AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED;
    if (connected) state.ai.message = '';
  } catch (error) {
    state.ai.pollinationsStatus = FREE_AI_AUTH_REQUIRED_CODES.has(error?.code)
      ? AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED
      : AI_CONNECTION.POLLINATIONS_ERROR;
    state.ai.message = aiService.freeAiMessage(error);
    console.error('Git-Up Free AI status check failed', { code: error?.code || 'status-failed', type: error?.name || 'Error' });
  }
  render();
}

async function connectFreeAi() {
  if (state.ai.busy) return;
  const verifyAfterConnect = state.ai.pollinationsStatus === AI_CONNECTION.POLLINATIONS_ERROR;
  state.ai.busy = 'connect';
  state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTING;
  state.ai.message = '';
  state.ai.authorization = null;
  render();
  try {
    await aiService.connectFreeAi({
      onAuthorization: (authorization) => {
        if (state.ai.activeProvider !== AI_PROVIDER.POLLINATIONS || state.ai.busy !== 'connect') {
          aiService.cancelFreeAiConnection();
          return;
        }
        state.ai.authorization = authorization;
        render();
        setTimeout(() => document.querySelector('a[href^="https://enter.pollinations.ai/"]')?.focus(), 0);
      },
    });
    if (verifyAfterConnect) await aiService.testFreeAi();
    state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTED;
    state.ai.message = 'Free AI Connected — you’re ready to use Git-Up’s AI features.';
    showToast('Free AI connected through Pollinations.');
  } catch (error) {
    state.ai.pollinationsStatus = FREE_AI_AUTH_REQUIRED_CODES.has(error?.code)
      ? AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED
      : AI_CONNECTION.POLLINATIONS_ERROR;
    state.ai.message = aiService.freeAiMessage(error);
    console.error('Git-Up Free AI connection failed', { code: error?.code || 'connect-failed', type: error?.name || 'Error' });
  } finally {
    state.ai.busy = '';
    state.ai.authorization = null;
    render();
  }
}

function cancelFreeAiConnect() {
  if (state.ai.busy !== 'connect') return;
  state.ai.message = 'Cancelling Pollinations authorization…';
  aiService.cancelFreeAiConnection();
  render();
}

async function testFreeAi() {
  if (state.ai.busy) return;
  state.ai.busy = 'test';
  state.ai.message = '';
  render();
  try {
    await aiService.testFreeAi();
    state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_CONNECTED;
    state.ai.message = 'Free AI is working. Pollinations completed the test request.';
  } catch (error) {
    state.ai.pollinationsStatus = FREE_AI_AUTH_REQUIRED_CODES.has(error?.code)
      ? AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED
      : AI_CONNECTION.POLLINATIONS_ERROR;
    state.ai.message = aiService.freeAiMessage(error);
    console.error('Git-Up Free AI test failed', { code: error?.code || 'test-failed', type: error?.name || 'Error' });
  } finally {
    state.ai.busy = '';
    render();
  }
}

async function disconnectFreeAi() {
  if (state.ai.busy) return;
  const confirmed = typeof window.confirm !== 'function' || window.confirm('Disconnect Free AI? Your Custom API configuration will remain unchanged.');
  if (!confirmed) return;
  state.ai.busy = 'disconnect';
  state.ai.message = 'Disconnecting Free AI…';
  render();
  try {
    await aiService.disconnectFreeAi();
    state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_AUTH_REQUIRED;
    state.ai.message = 'Pollinations authorization removed from this session. Your Custom API configuration is still available.';
    showToast('Pollinations authorization removed.');
  } catch (error) {
    state.ai.pollinationsStatus = AI_CONNECTION.POLLINATIONS_ERROR;
    state.ai.message = aiService.freeAiMessage(error);
    console.error('Git-Up Free AI disconnect failed', { code: error?.code || 'disconnect-failed', type: error?.name || 'Error' });
  } finally {
    state.ai.busy = '';
    render();
  }
}

function focusSettingsPrimary() {
  const selector = state.ai.activeProvider === AI_PROVIDER.POLLINATIONS ? '[data-action="connect-free-ai"], [data-action="test-free-ai"]' : '#base-url';
  setTimeout(() => document.querySelector(selector)?.focus(), 30);
}

function openAiSettings() {
  state.lastFocusId = 'settings';
  state.modal = 'settings';
  render();
  focusSettingsPrimary();
  if (state.ai.activeProvider === AI_PROVIDER.POLLINATIONS
    && state.ai.busy !== 'connect'
    && state.ai.pollinationsStatus !== AI_CONNECTION.POLLINATIONS_ERROR) refreshFreeAiConnection();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard.'); }
  catch { showToast('Copy was blocked by the browser. Select the command manually.', 'error'); }
}
function newAnalysis() { state.mode = 'empty'; state.repoUrl = ''; state.guide = null; state.checked = {}; state.error = ''; state.modal = null; state.recovery = null; emptySession(); state.openMenuId = null; state.renamingId = null; resetOreoForRepo(); render(); document.querySelector('#repo-input')?.focus(); }
function restoreHistory(id) {
  const entry = state.history.find((item) => item.id === id) || state.history[Number(id)];
  if (!entry?.guide) return;
  state.repoUrl = entry.url;
  state.guide = entry.guide;
  state.mode = 'analysis';
  state.guide = tuneGuide(entry.guide, entry.session?.expertise || state.expertise);
  hydrateSession(entry.session, entry.guide);
  state.explanationIndex = 0;
  state.error = '';
  state.openMenuId = null;
  state.renamingId = null;
  state.expandedDirs = {};
  state.treeFilter = '';
  resetOreoForRepo();
  render();
}

function bindEvents() {
  document.querySelector('#repo-form')?.addEventListener('submit', (event) => { event.preventDefault(); analyze(); });
  document.querySelector('#repo-input')?.addEventListener('input', (event) => { state.repoUrl = event.target.value; });
  document.querySelector('#settings-form')?.addEventListener('submit', saveSettings);
  document.querySelectorAll('[name="ai-provider"]').forEach((el) => el.addEventListener('change', () => { if (el.checked) switchAiProvider(el.value); }));
  document.querySelectorAll('[data-action="use-free-ai"]').forEach((el) => el.addEventListener('click', () => switchAiProvider(AI_PROVIDER.POLLINATIONS)));
  document.querySelectorAll('[data-action="use-custom-ai"]').forEach((el) => el.addEventListener('click', () => switchAiProvider(AI_PROVIDER.CUSTOM)));
  document.querySelectorAll('[data-action="connect-free-ai"]').forEach((el) => el.addEventListener('click', connectFreeAi));
  document.querySelectorAll('[data-action="cancel-free-ai-connect"]').forEach((el) => el.addEventListener('click', cancelFreeAiConnect));
  document.querySelectorAll('[data-action="test-free-ai"]').forEach((el) => el.addEventListener('click', testFreeAi));
  document.querySelectorAll('[data-action="disconnect-free-ai"]').forEach((el) => el.addEventListener('click', disconnectFreeAi));
  document.querySelectorAll('[data-action="new-analysis"]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); newAnalysis(); }));
  document.querySelectorAll('[data-action="settings"]').forEach((el) => el.addEventListener('click', openAiSettings));
  document.querySelectorAll('[data-action="theme"]').forEach((el) => el.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('git-up-theme', state.theme); } catch { /* ignore */ }
    render();
  }));
  document.querySelectorAll('[data-action="close-modal"]').forEach((el) => el.addEventListener('click', closeModal));
  document.querySelectorAll('[data-action="close-on-backdrop"]').forEach((el) => el.addEventListener('click', (event) => { if (event.target === el) closeModal(); }));
  document.querySelectorAll('[data-action="install"]').forEach((el) => el.addEventListener('click', () => { state.lastFocusId = 'install'; state.modal = 'install'; render(); }));
  document.querySelectorAll('[data-action="toggle-key"]').forEach((el) => el.addEventListener('click', () => { state.secretVisible = !state.secretVisible; render(); }));
  document.querySelectorAll('[data-action="fetch-models"]').forEach((el) => el.addEventListener('click', fetchModels));
  document.querySelectorAll('[data-example]').forEach((el) => el.addEventListener('click', () => { state.repoUrl = el.dataset.example; render(); analyze(); }));
  document.querySelectorAll('[data-history-id]').forEach((el) => el.addEventListener('click', () => restoreHistory(el.dataset.historyId)));
  // Feature 2: per-repo action menu
  document.querySelectorAll('[data-action="history-menu"]').forEach((el) => el.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = el.dataset.id;
    state.openMenuId = state.openMenuId === id ? null : id;
    render();
  }));
  document.querySelectorAll('[data-action="history-rename"]').forEach((el) => el.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = el.dataset.id;
    const entry = state.history.find((item) => item.id === id);
    state.renamingId = id;
    state.renameDraft = displayName(entry);
    state.openMenuId = null;
    render();
    const input = document.querySelector('#rename-input');
    input?.focus();
    input?.select();
  }));
  document.querySelectorAll('[data-action="history-rename-cancel"]').forEach((el) => el.addEventListener('click', () => {
    state.renamingId = null;
    state.renameDraft = '';
    render();
  }));
  document.querySelectorAll('[data-action="history-rename-save"]').forEach((el) => el.addEventListener('click', () => saveRename(el.dataset.id)));
  document.querySelector('#rename-input')?.addEventListener('input', (event) => { state.renameDraft = event.target.value; });
  document.querySelector('#rename-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); saveRename(state.renamingId); }
    if (event.key === 'Escape') { state.renamingId = null; state.renameDraft = ''; render(); }
  });
  document.querySelectorAll('[data-action="history-delete"]').forEach((el) => el.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = el.dataset.id;
    const removed = state.history.find((item) => item.id === id);
    state.history = state.history.filter((item) => item.id !== id);
    state.openMenuId = null;
    persistHistory();
    render();
    showToast(removed ? `Removed “${displayName(removed)}” from recent.` : 'Removed from recent.');
  }));
  document.querySelectorAll('[data-action="toggle-dir"]').forEach((el) => el.addEventListener('click', () => {
    const path = el.dataset.path;
    state.expandedDirs[path] = !isExpanded(path, 1);
    render();
    const filter = document.querySelector('#tree-filter');
    if (filter) { filter.focus(); filter.setSelectionRange(filter.value.length, filter.value.length); }
  }));
  document.querySelector('#tree-filter')?.addEventListener('input', (event) => {
    state.treeFilter = event.target.value;
    const pos = event.target.selectionStart;
    render();
    const next = document.querySelector('#tree-filter');
    if (next) { next.focus(); try { next.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  });
  // Oreo the cat bot: floating messenger (move / hide / mute)
  document.querySelectorAll('[data-action="oreo-toggle"]').forEach((el) => el.addEventListener('click', () => toggleOreo()));
  document.querySelectorAll('[data-action="oreo-close"]').forEach((el) => el.addEventListener('click', () => toggleOreo(false)));
  document.querySelectorAll('[data-action="oreo-mute"]').forEach((el) => el.addEventListener('click', () => setOreoMuted(!state.chat.muted)));
  document.querySelectorAll('[data-action="oreo-hide"]').forEach((el) => el.addEventListener('click', () => setOreoHidden(true)));
  document.querySelectorAll('[data-action="oreo-show"]').forEach((el) => el.addEventListener('click', () => setOreoHidden(false)));
  document.querySelectorAll('[data-action="oreo-chip"]').forEach((el) => el.addEventListener('click', () => sendOreoMessage(el.dataset.question)));
  initOreoDrag();
  initOreoPanelDrag();
  initOreoScrollWiggle();
  document.querySelector('#oreo-input')?.addEventListener('input', (event) => { state.chat.input = event.target.value; });
  document.querySelector('#oreo-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = document.querySelector('#oreo-input')?.value || '';
    if (!value.trim()) return;
    sendOreoMessage(value);
  });
  // Rotating tooltip: the robot "says" something new every few seconds.
  try {
    if (typeof window !== 'undefined' && !window.__oreoTipTimer && typeof setInterval !== 'undefined' && typeof document !== 'undefined' && document.querySelector?.('#app')) {
      window.__oreoTipTimer = setInterval(rotateOreoTip, 7000);
      if (window.__oreoTipTimer && typeof window.__oreoTipTimer.unref === 'function') window.__oreoTipTimer.unref();
    }
  } catch { /* ignore */ }
  const oreoBox = document.querySelector('#oreo-messages');
  if (oreoBox && state.chat.open) oreoBox.scrollTop = oreoBox.scrollHeight;
  document.querySelectorAll('[data-step-id]').forEach((el) => el.addEventListener('change', (event) => { state.checked[event.target.dataset.stepId] = event.target.checked; persistSession(); render(); }));
  // v2: reader mode, graph branch, failure recovery, contract ticks
  document.querySelectorAll('[data-expertise]').forEach((el) => el.addEventListener('click', () => setExpertise(el.dataset.expertise)));
  document.querySelectorAll('.graph-hit').forEach((el) => {
    el.addEventListener('click', () => setPathOption(el.dataset.axis, el.dataset.option));
    el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPathOption(el.dataset.axis, el.dataset.option); } });
  });
  document.querySelectorAll('[data-graph-axis]').forEach((el) => el.addEventListener('change', (event) => setPathOption(el.dataset.graphAxis, event.target.value)));
  document.querySelectorAll('[data-action="resume-dismiss"]').forEach((el) => el.addEventListener('click', () => { state.resumeNote = ''; render(); }));
  document.querySelectorAll('[data-action="recovery-dismiss"]').forEach((el) => el.addEventListener('click', () => { state.recovery = null; render(); }));
  document.querySelectorAll('[data-action="path-reset"]').forEach((el) => el.addEventListener('click', resetPath));
  document.querySelectorAll('[data-action="step-failed"]').forEach((el) => el.addEventListener('click', () => openFailure(el.dataset.step)));
  document.querySelectorAll('[data-action="unfail"]').forEach((el) => el.addEventListener('click', () => unfailStep(el.dataset.step)));
  document.querySelectorAll('[data-action="path-restore"]').forEach((el) => el.addEventListener('click', restoreOriginalPath));
  document.querySelectorAll('[data-action="toggle-hidden-notes"]').forEach((el) => el.addEventListener('click', () => { state.showHiddenNotes = !state.showHiddenNotes; render(); }));
  document.querySelectorAll('[data-action="close-failure"]').forEach((el) => el.addEventListener('click', closeModal));
  document.querySelector('#failure-form')?.addEventListener('submit', submitRecovery);
  document.querySelectorAll('[data-failure-pick]').forEach((el) => el.addEventListener('click', () => {
    const field = document.querySelector('#failure-error');
    if (field) { field.value = `${field.value ? `${field.value}\n` : ''}${el.dataset.failurePick}`; field.focus(); }
  }));
  document.querySelectorAll('[data-contract-id]').forEach((el) => el.addEventListener('change', (event) => toggleContractItem(event.target.dataset.contractId)));
  document.querySelectorAll('[data-action="ask-failure"]').forEach((el) => el.addEventListener('click', () => {
    const pattern = (state.guide?.failureScan?.patterns || []).find((entry) => entry.id === el.dataset.failure);
    const q = pattern ? `Why does "${pattern.label}" break this install, and what is the exact fix for my setup?` : 'What usually breaks this install?';
    console.log('Open Chat');
    ensureOreoWelcome();
    state.chat.open = true;
    render();
    sendOreoMessage(q);
  }));
  document.querySelector('#explanation-select')?.addEventListener('change', (event) => { state.explanationIndex = Number(event.target.value); render(); });
  document.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', () => copyText(el.dataset.copy)));
  // Mobile bottom nav actions
  document.querySelectorAll('[data-action="scroll-path"]').forEach((el) => el.addEventListener('click', () => { document.querySelector('#route-path')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  document.querySelectorAll('[data-action="scroll-graph"]').forEach((el) => el.addEventListener('click', () => { document.querySelector('#route-graph')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  document.querySelectorAll('[data-action="scroll-contract"]').forEach((el) => el.addEventListener('click', () => { document.querySelector('#route-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  // Command palette: open, type-to-filter, arrow/Enter to run.
  document.querySelectorAll('[data-action="palette"]').forEach((el) => el.addEventListener('click', togglePalette));
  document.querySelectorAll('.palette-option').forEach((el) => el.addEventListener('click', () => runPaletteAction(el.dataset.paletteId)));
  document.querySelector('#palette-input')?.addEventListener('input', (event) => {
    state.palette = { query: event.target.value, index: 0 };
    render();
  });
  document.querySelector('#palette-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); movePaletteIndex(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); movePaletteIndex(-1); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const actions = filteredPaletteActions();
      const action = actions[Math.min(state.palette.index, actions.length - 1)];
      if (action) action.run();
    }
  });
  // Supporting value ticker and restrained reveal hooks re-bind after each render.
  bindTickers(document);
  bindReveals(document);
  // Workspace particle field (particles.js engine): initializes exactly once
  // into <main>'s host div, behind .main-inner. No-op on repeat renders.
  initParticles();
  // Top bar GitHub-activity contribution squares: header only, behind brand +
  // controls. Initializes exactly once; no-op on repeat renders.
  initTopbarContributions();
}

function saveRename(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) { state.renamingId = null; render(); return; }
  const next = (state.renameDraft || '').trim().slice(0, 60);
  if (!next) { showToast('Give the repository a short nickname first.', 'error'); return; }
  // If the nickname matches the original name, clear the custom label.
  entry.label = next === entry.name ? '' : next;
  state.renamingId = null;
  state.renameDraft = '';
  persistHistory();
  render();
  showToast(`Saved as “${displayName(entry)}”.`);
}

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); togglePalette(); }
  if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); openAiSettings(); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && state.mode !== 'loading') { event.preventDefault(); analyze(); }
  if (event.key === 'Escape' && state.modal) { closeModal(); }
  else if (event.key === 'Escape' && state.openMenuId) { state.openMenuId = null; render(); }
  else if (event.key === 'Escape' && state.chat?.open) { state.chat.open = false; render(); }
});
document.addEventListener('click', (event) => {
  if (state.openMenuId && !event.target.closest?.('.menu-wrap')) { state.openMenuId = null; render(); }
});

/**
 * Feature 1: an install is a session, so a reload must land back in it with the
 * ticks, the chosen graph branch, and any corrections already made.
 */
function resumeActiveSession() {
  let active = '';
  try { active = localStorage.getItem('git-up-active') || ''; } catch { return; }
  if (!active) return;
  const entry = state.history.find((item) => item.url === active);
  if (!entry?.guide) return;
  state.repoUrl = entry.url;
  state.guide = tuneGuide(entry.guide, entry.session?.expertise || state.expertise);
  state.mode = 'analysis';
  hydrateSession(entry.session, entry.guide);
  const resumed = Object.keys(state.checked).filter((key) => state.checked[key]).length;
  if (resumed || state.revisions.length) {
    state.resumeNote = `Resumed this install — ${resumed} step${resumed === 1 ? '' : 's'} ticked${state.revisions.length ? `, ${state.revisions.length} correction${state.revisions.length === 1 ? '' : 's'} kept` : ''}.`;
  }
}

resumeActiveSession();
loadOreoPrefs();

render();
if (state.ai.activeProvider === AI_PROVIDER.POLLINATIONS) refreshFreeAiConnection();

// Named exports exist only so tests/render.test.mjs can drive the real client
// module in Node. The browser loads this file as a module either way.
export { state, render, activePath, installScript, setPathOption, setExpertise, emptySession, sessionSnapshot, hydrateSession, oreoMarkdown, oreoHtml, toggleOreo, sendOreoMessage, setOreoMuted, setOreoHidden, loadOreoPrefs, saveOreoPrefs, oreoClampPos, oreoShouldSuppressClick, oreoSpringStep, oreoPanelPositionStyle, switchAiProvider, aiConnection, hasAiConfig, hasCustomAiConfig, persistAiSettings, refreshFreeAiConnection, connectFreeAi, cancelFreeAiConnect, testFreeAi, disconnectFreeAi, OREO_NAME, OREO_TIPS };
