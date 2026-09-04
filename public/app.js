import { composeSteps, keyOf, progressOf, applyRevision, revisionEntry, selectionsLabel, EXPERTISE_LEVELS, tuneGuide } from './path-engine.js';
import { bindSpotlight, bindTickers } from './magic.js';

const root = document.querySelector('#app');

const icons = {
  mark: '<path d="M7.6 4.3 10 2l2.4 2.3 3.3-.2-.2 3.3L18 10l-2.5 2.6.2 3.3-3.3-.2L10 18l-2.4-2.3-3.3.2.2-3.3L2 10l2.5-2.6-.2-3.3 3.3.2Z" fill="currentColor"/><path d="m7.2 10.1 1.8 1.8 3.9-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  github: '<path d="M9 19c-4.2 1.3-4.2-2.1-5.9-2.6M14.9 21v-3.2c0-1 .1-1.5-.5-2.1 3.3-.4 6.7-1.6 6.7-7 0-1.5-.5-2.8-1.4-3.8.1-.4.6-1.9-.1-3.8 0 0-1.2-.4-3.9 1.4a13.6 13.6 0 0 0-7.1 0C6 0.7 4.8 1.1 4.8 1.1c-.7 1.9-.2 3.4-.1 3.8-.9 1-1.4 2.3-1.4 3.8 0 5.4 3.4 6.6 6.7 7-.6.5-.6 1.1-.6 2.1V21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  settings: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .8v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.8l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.8-3H4a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .8-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.8V4a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .8l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .8 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.8.9Z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="4" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  clock: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3.2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="m5 12 4.2 4.2L19 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="8" y="8" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  key: '<rect x="3.5" y="10" width="17" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 10V7.5a5 5 0 0 1 10 0V10M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  eye: '<path d="M3.2 12s3.1-5 8.8-5 8.8 5 8.8 5-3.1 5-8.8 5-8.8-5-8.8-5Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  eyeOff: '<path d="m4 4 16 16M10.6 6.9C11 6.8 11.5 6.8 12 6.8c5.7 0 8.8 5.2 8.8 5.2a15 15 0 0 1-2.4 2.8M6.2 6.9C4.1 8.3 3.2 12 3.2 12s3.1 5.2 8.8 5.2c1.1 0 2.1-.2 3-.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  spark: '<path d="m12 2 1.4 6.6L20 10l-6.6 1.4L12 18l-1.4-6.6L4 10l6.6-1.4L12 2ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>',
  layers: '<path d="m12 3 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  list: '<path d="M8 6h11M8 12h11M8 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m7 9 3 3-3 3M13 15h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 11v5M12 8h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  warning: '<path d="m12 3 9 17H3L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9v4M12 16h.01" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14.5 4L20 15M20 19v-4h-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  download: '<path d="M12 3v11M8 10l4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21V4.5ZM5 4.5V21M8 6h7M8 9h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  dots: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
  folder: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h5l2 2.5h7A1.5 1.5 0 0 1 20.5 9v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17v-10.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  file: '<path d="M6 3.5h7L18.5 9v9.5a1 1 0 0 1-1 1h-11.5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 3.5V9h5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  bulb: '<path d="M9.5 18h5M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.2 1.3 2.2h4.6c.2-1 .6-1.6 1.3-2.2A6 6 0 0 0 12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  shield: '<path d="m12 3 7 2.8v5.4c0 4.4-3 7.6-7 9.8-4-2.2-7-5.4-7-9.8V5.8L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m9 11.5 2.2 2.2L15.5 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  compass: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  pencil: '<path d="m14.5 5.5 4 4L8 20l-5 1 1-5L14.5 5.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m12.5 7.5 4 4" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  trash: '<path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 12a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  chevron: '<path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  route: '<circle cx="6" cy="19" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.4 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  flag: '<path d="M5 21V4m0 1h12l-2.5 3.5L17 12H5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  sun: '<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
};
function icon(name, size = 17, className = '') { return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${icons[name] || icons.info}</svg>`; }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
/** Strip key-like secrets from anything rendered back to the page (banners, insights, recovery notes). */
function redactSecrets(value) {
  return String(value ?? '')
    .replace(/sk-[A-Za-z0-9-_]{8,}/g, '[redacted-key]')
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
  history: savedHistory,
  secretVisible: false,
  // Feature 3 + 4: Curious Explorer + follow-ups
  insight: null,
  insightLoading: null,
  insightError: '',
  insightCache: {},
  insightQuestion: '',
  insightBase: 'recommendations',
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
};

function hasAiConfig() { return Boolean(state.settings.baseUrl && state.settings.apiKey && state.settings.model); }
function sourceLabel() { return state.guide?.source === 'ai' ? 'AI reviewed' : 'Local scan'; }
function insightSourceLabel(source) { return source === 'ai' ? 'AI answer' : 'Smart summary'; }
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
  if (/AI provider|model|endpoint|base URL|key/i.test(text)) return { title: 'AI provider hiccup', hint: 'The heuristic guide still works with no key. Check the provider settings and retry.' };
  if (/URL|github\.com|owner/i.test(text)) return { title: 'Check the repository URL', hint: 'HTTPS, SSH, and git@ forms all work, for example https://github.com/owner/repo.' };
  if (/network|fetch|failed/i.test(text)) return { title: 'Network problem', hint: 'Check your connection and try again. Recent analyses are kept in history.' };
  return { title: 'Analysis failed', hint: 'Check the URL and try again. Nothing was saved for this attempt.' };
}

function topbar() {
  const aiReady = hasAiConfig();
  const toLight = state.theme !== 'light';
  return `<header class="topbar">
    <a class="brand" href="#" data-action="new-analysis" aria-label="Git-Up home">
      <span class="brand-mark">${icon('mark', 19)}</span><span class="brand-word">git-<em>up</em></span>
      <span class="brand-sub">living install paths</span>
    </a>
    <div class="topbar-center"><span>Route</span><span class="slash">/</span><strong>${state.mode === 'analysis' ? esc(displayName({ label: '', name: shortName(state.guide) })) : 'New analysis'}</strong></div>
    <div class="topbar-actions">
      <div class="connection-pill"><i class="status-dot ${aiReady ? 'online' : ''}"></i><span>${aiReady ? 'AI connected' : 'Local scan ready'}</span></div>
      <button class="icon-button" data-action="theme" aria-label="${toLight ? 'Switch to daylight mode' : 'Switch to dark mode'}" title="${toLight ? 'Daylight mode' : 'Dark mode'}">${icon(toLight ? 'sun' : 'moon', 18)}</button>
      <button class="icon-button" data-action="settings" aria-label="Open AI settings" title="AI settings">${icon('settings', 18)}</button>
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
    <div class="file-tree" role="tree" aria-label="Repository file tree">${treeNodeHtml(tree)}</div>
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
        <span class="history-icon">${icon('clock', 14)}</span>
        <input class="rename-input" id="rename-input" value="${esc(state.renameDraft)}" maxlength="60" aria-label="Rename repository label" />
        <button class="mini-btn save" data-action="history-rename-save" data-id="${esc(entry.id)}" title="Save label" aria-label="Save label">${icon('check', 12)}</button>
        <button class="mini-btn" data-action="history-rename-cancel" title="Cancel" aria-label="Cancel rename">${icon('close', 12)}</button>
      </div>`;
    }
    return `<div class="history-row ${isActive ? 'active' : ''}">
      <button class="history-entry" data-history-id="${esc(entry.id)}" title="${esc(entry.url)}"><span class="history-icon">${icon('clock', 14)}</span><span class="history-name">${esc(displayName(entry))}</span>${entry.label ? `<span class="history-sub">${esc(entry.name || entry.url)}</span>` : ''}</button>
      <div class="menu-wrap">
        <button class="dots-button" data-action="history-menu" data-id="${esc(entry.id)}" aria-label="Repository actions for ${esc(displayName(entry))}" aria-haspopup="menu" aria-expanded="${menuOpen}">${icon('dots', 15)}</button>
        ${menuOpen ? `<div class="menu-pop" role="menu">
          <button class="menu-item" data-action="history-rename" data-id="${esc(entry.id)}" role="menuitem">${icon('pencil', 13)}<span>Rename</span></button>
          <button class="menu-item danger" data-action="history-delete" data-id="${esc(entry.id)}" role="menuitem">${icon('trash', 13)}<span>Remove</span></button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="history-empty">Your analyzed repositories will appear here. Hover any entry for rename / remove.</div>';
  return `<aside class="sidebar" aria-label="Workspace">
    <button class="new-analysis" data-action="new-analysis">${icon('plus', 16)}<span>New analysis</span></button>
    <p class="sidebar-label">Workspace</p>
    <nav class="sidebar-nav" aria-label="Workspace navigation">
      <button class="nav-item active" data-action="new-analysis"><span class="nav-icon">${icon('grid', 16)}</span><span>Analyses</span><span class="nav-count">${state.history.length || '—'}</span></button>
      <button class="nav-item" data-action="settings"><span class="nav-icon">${icon('settings', 16)}</span><span>AI provider</span></button>
    </nav>
    <div class="history" id="route-history"><p class="sidebar-label">Recent</p><div class="history-list">${historyHtml}</div></div>
    ${fileTreePanel()}
    <div class="sidebar-foot"><div class="local-note"><strong>Private by default</strong>Your API key stays in this browser session. Repository files are only sent to your configured AI provider.</div></div>
  </aside>`;
}

function repoForm() {
  const kind = state.error ? errorKindOf(state.error) : null;
  return `<form class="repo-form" id="repo-form">
    <div class="repo-input-wrap">${icon('github', 17)}<input id="repo-input" class="repo-input" autocomplete="url" spellcheck="false" value="${esc(state.repoUrl)}" placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" required /></div>
    <button class="analyze-button ${state.mode === 'loading' ? 'loading' : ''}" type="submit" ${state.mode === 'loading' ? 'disabled' : ''}>${state.mode === 'loading' ? `${icon('refresh', 15, 'spinner')}Scanning repository` : `${icon('route', 15)}Analyze repository`}</button>
  </form>
  ${expertisePicker()}
  <div class="form-meta"><span>${icon('github', 12)} Public repositories</span><span>${icon('key', 12)} SSH, HTTPS, and Git URLs</span><span>${icon('shield', 12)} Heuristic scan works with no AI key</span><span class="shortcut">⌘ ↵</span></div>
  ${state.error ? `<div class="error-banner" role="alert">${icon('warning', 17)}<span><strong>${esc(kind.title)}.</strong> ${safe(state.error)}<br /><em>${esc(kind.hint)}</em></span></div>` : ''}`;
}

function emptyView() {
  return `<section class="hero">
    <div class="eyebrow"><span class="eyebrow-line"></span>Repository → ready-to-run</div>
    <h1>Make any repo<br /><span>runnable, without the archaeology.</span></h1>
    <p class="hero-copy">Git-Up builds a living install path from repository evidence, and helps you recover when a step fails. Paste a public GitHub URL to begin.</p>
    ${repoForm()}
  </section>
  <section class="initial-content" aria-labelledby="how-it-works">
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
  return `<section class="loading-view" aria-live="polite" aria-busy="true"><div class="loading-top"><div class="loading-orb">${icon('route', 18)}</div><div><h2>Reading the repository surface</h2><p>Following the real pipeline in order. No percentages are shown because none are measured.</p></div></div>
  <ol class="scan-phases">
    <li>Repository read<span>metadata, branches, tree</span></li>
    <li>Setup-file scan<span>manifests, lockfiles, env templates</span></li>
    <li>Failure evidence<span>issues, PRs, inferred risks</span></li>
    <li>Path composition<span>branches recomposed locally</span></li>
    <li>Contract assembly<span>versions, permissions, verification</span></li>
  </ol>
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
  return `<section class="panel plain-panel" aria-labelledby="plain-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('chat', 15)}</div><div><h3 id="plain-title">In plain English</h3><p class="panel-subtitle">No jargon — share this with anyone, even if they have never opened a project before</p></div></div><span class="panel-count">for everyone</span></div>
    <div class="plain-body">
      <div class="plain-analogy">${icon('spark', 14)}<span>${esc(overview.analogy || '')}</span></div>
      <div class="plain-grid">
        <div class="plain-card"><div class="plain-kicker">What problem it solves</div><p>${esc(overview.problem || '')}</p></div>
        <div class="plain-card"><div class="plain-kicker">Who it helps</div><p>${esc(overview.audience || '')}</p></div>
        <div class="plain-card wide"><div class="plain-kicker">How it works for you</div><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      </div>
    </div>
  </section>`;
}

// --- Features 3 + 4: Curious Explorer + follow-ups ---------------------------
const EXPLORER_MODES = [
  { id: 'features', label: 'Suggest Feature Extensions', hint: '3–5 ideas for your own copy', icon: 'bulb' },
  { id: 'bugs', label: 'Audit for Potential Bugs', hint: 'Weak spots, plainly explained', icon: 'shield' },
  { id: 'recommendations', label: 'Proactive Recommendations', hint: 'Small wins, big welcome', icon: 'compass' },
];
function followUpChips(questions, baseMode) {
  if (!questions?.length) return '';
  return `<div class="followups"><div class="followups-label">${icon('chat', 12)}<span>Keep exploring</span></div><div class="followup-chips">${questions.map((q) => `<button class="followup-chip" data-action="followup" data-question="${esc(q)}" data-basemode="${esc(baseMode || 'recommendations')}">${esc(q)}<span class="chip-arrow">${icon('arrow', 12)}</span></button>`).join('')}</div></div>`;
}
function explorerSection() {
  const loading = state.insightLoading;
  const buttons = EXPLORER_MODES.map((mode) => {
    const isActive = state.insight?.mode === mode.id || loading === mode.id;
    return `<button class="explorer-btn ${isActive ? 'active' : ''}" data-action="explorer" data-mode="${mode.id}" ${loading ? 'disabled' : ''}>
      <span class="explorer-ic">${icon(mode.icon, 16)}</span>
      <span class="explorer-text"><strong>${loading === mode.id ? 'Thinking…' : mode.label}</strong><small>${esc(mode.hint)}</small></span>
    </button>`;
  }).join('');
  let result = '';
  if (loading) {
    result = `<div class="insight-panel loading" aria-live="polite"><div class="insight-loading">${icon('refresh', 16, 'spinner')}<div><strong>Reading the project closely…</strong><p>Checking files, steps, and notes for a grounded answer.</p></div></div></div>`;
  } else if (state.insightError && !state.insight) {
    result = `<div class="insight-panel error" role="alert">${icon('warning', 16)}<div><strong>Could not load that idea.</strong><p>${safe(state.insightError)}</p></div></div>`;
  } else if (state.insight) {
    const insight = state.insight;
    result = `<article class="insight-panel" aria-live="polite">
      <div class="insight-head"><div class="insight-title-wrap"><span class="insight-ic">${icon(insight.mode === 'features' ? 'bulb' : insight.mode === 'bugs' ? 'shield' : 'compass', 15)}</span><div><h4>${esc(insight.title || 'Explorer result')}</h4><span class="tag ${insight.source === 'ai' ? 'ai' : 'scan'}"><i class="tag-dot"></i>${insightSourceLabel(insight.source)}</span></div></div><button class="icon-button" data-action="insight-close" aria-label="Close explorer result">${icon('close', 15)}</button></div>
      ${insight.intro ? `<p class="insight-intro">${safe(insight.intro)}</p>` : ''}
      ${(insight.bullets || []).length ? `<ul class="insight-list">${insight.bullets.map((b) => `<li>${safe(b)}</li>`).join('')}</ul>` : ''}
      ${insight.outro ? `<div class="insight-outro">${icon('check', 13)}<span>${safe(insight.outro)}</span></div>` : ''}
      ${followUpChips(insight.followUps, insight.mode === 'custom' ? 'recommendations' : insight.mode)}
    </article>`;
  }
  const guideFollowUps = state.guide?.followUps || [];
  return `<section class="panel explorer-panel" aria-labelledby="explorer-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('spark', 15)}</div><div><h3 id="explorer-title">Curious Explorer</h3><p class="panel-subtitle">One click, three specialist lenses — works instantly, deeper with AI connected. Never part of the install path.</p></div></div></div>
    <div class="explorer-body"><div class="explorer-grid">${buttons}</div>
    <form class="insight-custom" id="insight-custom"><label for="insight-question">Ask your own question about this repository</label><div class="insight-custom-row"><input class="text-field" id="insight-question" value="${esc(state.insightQuestion)}" placeholder="For example: does this need a database?" maxlength="2000" autocomplete="off" /><select class="select-field" id="insight-base" aria-label="Answer lens"><option value="recommendations" ${state.insightBase === 'recommendations' ? 'selected' : ''}>Recommendations lens</option><option value="features" ${state.insightBase === 'features' ? 'selected' : ''}>Features lens</option><option value="bugs" ${state.insightBase === 'bugs' ? 'selected' : ''}>Bugs lens</option></select><button class="secondary-button" type="submit" ${loading ? 'disabled' : ''}>Ask</button></div></form>
    ${result}${!state.insight && !loading ? followUpChips(guideFollowUps, 'recommendations') : ''}</div>
  </section>`;
}

function routeNav() {
  return `<nav class="route-nav" aria-label="Result sections">
    <a href="#route-path">${icon('route', 12)} Path</a>
    <a href="#route-failures">${icon('warning', 12)} Failures</a>
    <a href="#route-graph">${icon('grid', 12)} Graph</a>
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
      <div class="analysis-actions">${expertiseSwitch()}<button class="secondary-button" data-action="new-analysis">${icon('plus', 14)} New</button><button class="install-button" data-action="install">${icon('terminal', 14)} Generate install script</button></div>
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
    <div class="overview-strip"><div class="overview-cell"><div class="cell-label">Analysis summary</div><div class="cell-value overview-summary">${esc(guide.summary || 'A structured installation path for this repository.')}</div></div><div class="overview-cell"><div class="cell-label">Default branch</div><div class="cell-value mono">${esc(repo.defaultBranch || 'main')}</div></div><div class="overview-cell"><div class="cell-label">Language</div><div class="cell-value">${esc(repo.language || 'Not detected')}</div></div><div class="overview-cell"><div class="cell-label">Files inspected</div><div class="cell-value mono">${(guide.files || []).length}</div></div></div>
    ${plainOverviewPanel()}
    ${explorerSection()}
    <div class="dashboard-grid" id="route-evidence">
      <div class="primary-stack">
        <div class="info-grid"><section class="panel info-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('layers', 15)}</div><div><h3>Dependencies</h3><p class="panel-subtitle">Installed as part of this repository</p></div></div><span class="panel-count">${guide.dependencies?.length || 0}</span></div><div class="info-list">${dependencyList(guide.dependencies)}</div></section><section class="panel info-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('key', 15)}</div><div><h3>Requirements</h3><p class="panel-subtitle">Needed before the app can work</p></div></div><span class="panel-count">${guide.requirements?.length || 0}</span></div><div class="info-list">${requirementsList(guide.requirements)}</div></section></div>
        ${guide.notes?.length ? `<section class="panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('book', 15)}</div><div><h3>Notes from the scan</h3><p class="panel-subtitle">Keep these caveats close while you set up</p></div></div></div><div class="info-list">${guide.notes.map((note) => `<div class="info-item"><span class="info-bullet"></span><span>${esc(note)}</span></div>`).join('')}</div></section>` : ''}
      </div>
      <div class="sticky-column"><section class="panel explanation-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('info', 15)}</div><div><h3>Explanation</h3><p class="panel-subtitle">Understand the why, without cluttering the checklist</p></div></div></div><div class="explanation-content"><label class="explanation-step-label" for="explanation-select">Selected step</label><select class="explanation-select" id="explanation-select">${steps.map((item, index) => `<option value="${index}" ${index === state.explanationIndex ? 'selected' : ''}>${String(index + 1).padStart(2, '0')} · ${esc(item.title)}</option>`).join('')}</select><h4>${esc(explanation.title || step?.title || 'Installation step')}</h4><p>${esc(explanation.body || step?.detail || '')}</p>${guide.environment?.length ? `<div class="explanation-tip">${icon('key', 14)}<span>Environment detected: <strong>${guide.environment.map(esc).join(', ')}</strong>. Keep secrets out of Git.</span></div>` : `<div class="explanation-tip">${icon('info', 14)}<span>Commands are shown for your terminal. Git-Up never executes code on your machine.</span></div>`}</div></section>${files.length ? `<section class="panel files-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('book', 15)}</div><div><h3>Inspected files</h3><p class="panel-subtitle">The setup evidence behind this guide</p></div></div></div><div class="file-list">${files.map((file) => `<span class="file-chip" title="${esc(file)}">${esc(file)}</span>`).join('')}</div></section>` : ''}</div>
    </div>
  </section>`;
}

function settingsModal() {
  const models = [...new Set([...(state.modelOptions || []), state.settings.model].filter(Boolean))];
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal-head"><div><h2 id="settings-title">AI provider</h2><p>Connect an OpenAI-compatible endpoint for a deeper repository review. AI is optional: the heuristic scan stays fully usable without it. Keys remain in this browser session.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close settings">${icon('close', 18)}</button></div><form class="modal-body" id="settings-form"><div class="inline-fields"><div class="form-field"><label for="base-url">Base URL <span>required</span></label><input class="text-field" id="base-url" value="${esc(state.settings.baseUrl)}" placeholder="https://api.openai.com/v1" /></div><div class="form-field"><label for="endpoint">Chat endpoint <span>required</span></label><input class="text-field" id="endpoint" value="${esc(state.settings.endpoint)}" placeholder="/chat/completions" /></div></div><div class="form-field"><label for="api-key">API key <span>session only</span></label><div class="secret-field"><input class="text-field" id="api-key" type="${state.secretVisible ? 'text' : 'password'}" value="${esc(state.settings.apiKey)}" placeholder="sk-…" autocomplete="off" /> <button class="reveal-key" type="button" data-action="toggle-key" aria-label="${state.secretVisible ? 'Hide' : 'Show'} API key">${icon(state.secretVisible ? 'eyeOff' : 'eye', 15)}</button></div><p class="field-hint">Used only for requests from this session. It is never saved to the server or included in a repository guide.</p></div><div class="form-field"><label for="model">Model <span>${models.length ? `${models.length} available` : 'fetch from provider'}</span></label><div class="model-row"><select class="select-field" id="model"><option value="">Select a model…</option>${models.map((model) => `<option value="${esc(model)}" ${model === state.settings.model ? 'selected' : ''}>${esc(model)}</option>`).join('')}</select><button type="button" class="fetch-button" data-action="fetch-models">${icon('refresh', 13)} Fetch models</button></div><p class="field-hint">Git-Up requests <span class="mono">GET /models</span> from your base URL. Your provider may use a different models endpoint.</p></div><div id="settings-status" class="settings-status" aria-live="polite"></div><div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="install-button" type="submit">${icon('check', 14)} Save configuration</button></div></form></section></div>`;
}
function installModal() {
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal script-modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><div class="modal-head"><div><h2 id="install-title">Your install script</h2><p>Review these commands, then run them in your own terminal. Nothing runs automatically.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close install script">${icon('close', 18)}</button></div><div class="modal-body" aria-live="polite"><p class="script-copy-note">This is the same order as your checklist. If the repository requires secrets, fill those in locally before running the script.</p><div class="script-block"><button class="copy-mini script-copy" data-copy="${esc(installScript())}" aria-label="Copy install script" title="Copy install script">${icon('copy', 13)}<span>Copy</span></button>${esc(installScript())}</div><div class="modal-foot"><button class="secondary-button" data-action="close-modal">Close</button><button class="install-button" data-copy="${esc(installScript())}">${icon('copy', 14)} Copy script</button></div></div></section></div>`;
}
function resumeBanner() {
  if (!state.resumeNote) return '';
  const note = state.resumeNote;
  return `<div class="resume-note">${icon('clock', 13)}<span>${esc(note)}</span><button class="link-button" data-action="resume-dismiss">Dismiss</button></div>`;
}

function toastHtml() { return state.toast ? `<div class="toast ${state.toast.type}" role="status">${icon(state.toast.type === 'error' ? 'warning' : 'check', 15)}<span>${esc(state.toast.message)}</span></div>` : ''; }

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
  return `<section class="panel health-panel" aria-labelledby="health-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('shield', 15)}</div><div><h3 id="health-title">Install health</h3><p class="panel-subtitle">Scored from repository evidence before any steps are shown — ${esc(health.method)}</p></div></div><span class="panel-count">weight disclosed</span></div>
    <div class="health-body">
      <div class="health-score">${scoreRing(health.score, health.band.tone)}<div class="health-band tone-${health.band.tone}"><strong>${esc(health.band.label)}</strong><span>${esc(health.band.note)}</span></div></div>
      <div class="health-factors">${bars}</div>
    </div>
    ${health.caps?.length ? `<div class="health-caps">${health.caps.map((cap) => `<div class="cap-item">${icon('warning', 13)}<span>${esc(cap)}</span></div>`).join('')}</div>` : ''}
    <div class="health-foot"><span>${icon('clock', 12)} pushed ${evidence.ageDays === null || evidence.ageDays === undefined ? 'unknown' : `${evidence.ageDays}d ago`}</span><span>${icon('chat', 12)} ${evidence.threadsSampled || 0} threads sampled</span><span>${icon('warning', 12)} ${evidence.openIssues || 0} open issues</span><span>${icon('refresh', 12)} branch ${esc(evidence.branch || 'main')}: ${esc(evidence.ci?.state || 'no-ci')}</span><span class="mono">${esc(health.method)}</span></div>
  </section>`;
}

function bandTone(score) {
  if (score >= 85) return 'mint';
  if (score >= 68) return 'blue';
  if (score >= 48) return 'amber';
  return 'red';
}

// --- Feature 2: failure-first analysis -------------------------------------
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
  return `<section class="panel fail-panel" id="route-failures" aria-labelledby="fail-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('warning', 15)}</div><div><h3 id="fail-title">How this install usually breaks</h3><p class="panel-subtitle">Read before the steps — ranked by what ${esc(scan.totalThreads || 0)} recent ${scan.totalThreads === 1 ? 'thread' : 'threads'} actually say</p></div></div><span class="panel-count">${patterns.length} found</span></div>
    ${patterns.length ? `<div class="fail-list">${rows}</div>` : `<div class="fail-empty">${icon('check', 15)}<span>${esc(scan.notice || 'No installation failures were found in the recent threads.')}</span></div>`}
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
  return `<section class="panel graph-panel" id="route-graph" aria-labelledby="graph-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('grid', 15)}</div><div><h3 id="graph-title">Choose your path</h3><p class="panel-subtitle">${esc(graph.note || 'Pick a branch — only the relevant steps stay in the checklist.')}</p></div></div>${label ? `<span class="panel-count path-selection">${esc(label)}</span>` : ''}</div>
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
    ${Object.keys(state.pathSelections).length ? `<div class="graph-foot"><button class="link-button" data-action="path-reset">${icon('refresh', 12)} Reset to the recommended path</button></div>` : ''}
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
      <div class="step-number">${entry.revision > 1 ? icon('refresh', 13) : String(index + 1).padStart(2, '0')}</div>
      <div class="step-body">
        <h4 class="step-title"><span class="step-id mono">${esc(entry.id)}</span>${esc(entry.title)}${entry.revision > 1 ? '<span class="rev-badge">revised</span>' : ''}</h4>
        <p class="step-state">Status: ${status.label}${isDone && entry.revision > 1 ? ' · kept through revision' : ''}</p>
        ${entry.detail ? `<p class="step-detail">${esc(entry.detail)}</p>` : ''}
        ${entry.guard ? `<p class="step-guard">${icon('shield', 12)}${esc(entry.guard)}</p>` : ''}
        ${patched.length ? `<p class="step-patch">${icon('check', 12)}patched for: ${patched.map(esc).join(', ')}</p>` : ''}
        ${entry.command ? `<div class="command-block"><button class="copy-mini" data-copy="${esc(entry.command)}" aria-label="Copy command" title="Copy command">${icon('copy', 13)}<span>Copy</span></button>${esc(entry.command)}</div>` : ''}
        ${entry.verify ? `<div class="command-block verify-block"><button class="copy-mini" data-copy="${esc(entry.verify)}" aria-label="Copy check" title="Copy check">${icon('check', 13)}<span>Copy</span></button>${esc(entry.verify)}</div>` : ''}
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
  return `<section class="panel steps-panel" id="route-path" aria-labelledby="steps-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('route', 15)}</div><div><h3 id="steps-title">Installation steps</h3><p class="panel-subtitle">A live path — it changes when something fails${revision > 1 ? `, now on revision ${revision}` : ''}</p></div></div><span class="panel-count">${done}/${total} complete</span></div>
    <div class="install-list">${rows || '<div class="fail-empty"><span>No steps were produced for this path. Try another branch of the graph.</span></div>'}</div>
    <div class="install-progress"><div class="progress-copy"><span>${percent === 100 ? 'Installation path complete — tick the contract to close it out' : 'Progress through your installation path'}</span><strong>${percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div></div>
    <div class="steps-foot">
      <span class="tempo-note">${icon('compass', 12)}${esc(profile.short)} · ${esc(profile.explanation === 'minimal' ? 'prose hidden, one copy-paste block available' : profile.explanation === 'full' ? 'every step explains why it exists' : 'one line of reasoning per step')}</span>
      ${state.guide?.fastPath ? `<button class="secondary-button" data-copy="${esc(state.guide.fastPath)}">${icon('copy', 13)} Copy whole path</button>` : ''}
      ${hidden ? `<button class="link-button" data-action="toggle-hidden-notes">${icon(state.showHiddenNotes ? 'eyeOff' : 'eye', 12)} ${state.showHiddenNotes ? 'Hide' : `Show ${hidden} quieter note${hidden === 1 ? '' : 's'}`}</button>` : ''}
      ${revision > 1 ? `<button class="link-button" data-action="path-restore">${icon('refresh', 12)} Restore the original path</button>` : ''}
    </div>
  </section>`;
}

function recoveryReport() {
  const recovery = state.recovery;
  if (!recovery) return '';
  const matched = (recovery.matched || []).map((entry) => `<li><strong>${esc(entry.label || entry.id)}</strong>${entry.hit ? `<code>${esc(String(entry.hit).slice(0, 80))}</code>` : ''}</li>`).join('');
  const checks = (recovery.checks || []).map((check) => `<div class="command-block"><button class="copy-mini" data-copy="${esc(check)}" aria-label="Copy check" title="Copy check">${icon('check', 13)}<span>Copy</span></button>${esc(check)}</div>`).join('');
  return `<section class="panel recovery-panel" aria-labelledby="recovery-title" aria-live="polite">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('refresh', 15)}</div><div><h3 id="recovery-title">Recovery applied — revision ${Number(recovery.revision) || currentRevision()}</h3><p class="panel-subtitle">Completed steps are locked and untouched. Only the failing step forward was rewritten.</p></div></div><span class="panel-count">${esc(recovery.source === 'ai' ? 'AI diagnosis' : 'local rule match')} · ${esc(recovery.confidence || 'medium')} confidence</span></div>
    <div class="recovery-body">
      <p class="recovery-diagnosis">${safe(recovery.diagnosis || 'The path was rebuilt from the fault forward.')}</p>
      ${recovery.secondSuspect ? `<p class="recovery-second">${safe(recovery.secondSuspect)}</p>` : ''}
      ${matched ? `<h4>Matched signatures</h4><ul class="recovery-list">${matched}</ul>` : ''}
      ${checks ? `<h4>Prove the fix landed</h4>${checks}` : ''}
      ${(recovery.followUps || []).length ? `<h4>Answer next</h4><ul class="recovery-list">${recovery.followUps.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
      ${recovery.note ? `<p class="field-hint">${safe(recovery.note)}</p>` : ''}
      <div class="recovery-actions"><button class="secondary-button" data-action="path-restore">${icon('refresh', 13)} Roll back this revision</button><button class="link-button" data-action="recovery-dismiss">Dismiss report</button></div>
    </div>
  </section>`;
}

function revisionTrail() {
  if (!state.revisions.length) return '';
  return `<section class="panel rev-panel" aria-labelledby="rev-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('clock', 15)}</div><div><h3 id="rev-title">How this path changed</h3><p class="panel-subtitle">Every correction stays on the record — nothing is silently rewritten</p></div></div><span class="panel-count">${state.revisions.length} revision${state.revisions.length === 1 ? '' : 's'}</span></div>
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
        <span class="field-hint">Kept on this machine and only sent to the AI endpoint you configured. Even one line usually matches a known signature. Keys that look like secrets are redacted from anything shown back.</span>
      </label>
      ${known.length ? `<div class="form-field"><span class="field-label">Or start from what this repo’s issues already show</span><div class="quick-picks">${known.map((pattern) => `<button type="button" class="quick-pick" data-failure-pick="${esc(pattern.why)}">${esc(pattern.label)}${pattern.count ? ` · ${pattern.count}` : ''}</button>`).join('')}</div></div>` : ''}
      <label class="form-field"><span class="field-label">What happened, in words (optional)</span><input id="failure-note" class="text-field" value="${esc(state.failure.note)}" placeholder="It printed a warning then exited" /></label>
      <div class="fail-expect"><span>${icon('shield', 12)}</span><p>Your ${completedCount < 0 ? 0 : completedCount} completed step${completedCount === 1 ? '' : 's'}${state.revisions.length ? ` and ${state.revisions.length} earlier revision${state.revisions.length === 1 ? '' : 's'}` : ''} stay exactly as they are. Only the failing step and what follows it get rewritten.</p></div>
      ${state.failure.error ? `<div class="error-banner" role="alert">${icon('warning', 15)}<span>${safe(state.failure.error)}</span></div>` : ''}
      <div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="install-button" type="submit" ${loading ? 'disabled' : ''}>${loading ? `${icon('refresh', 14, 'spinner')} Rebuilding the path` : `${icon('spark', 14)} Rebuild this path`}</button></div>
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
      config: hasAiConfig() ? { ...state.settings } : null,
    };
    const response = await fetch('/api/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'The path could not be rebuilt.');
    const recovery = payload.recovery;
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
  return `<section class="panel contract-panel" id="route-contract" aria-labelledby="contract-title">
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
      ${section('What “working” looks like', `<p class="contract-state">${esc(contract.workingState)}</p>${contract.verification?.command ? `<div class="command-block verify-block"><button class="copy-mini" data-copy="${esc(contract.verification.command)}" aria-label="Copy verification command" title="Copy verification">${icon('copy', 13)}<span>Copy</span></button>${esc(contract.verification.command)}</div><p class="expect-line">${icon('check', 12)}${esc(contract.verification.expect)}</p>` : ''}`)}
    </div>
    ${contract.gaps?.length ? `<div class="contract-gaps"><h4>${icon('info', 13)} What this contract could not determine</h4><ul>${contract.gaps.map((gap) => `<li><strong>${esc(gap.field)}</strong> — ${esc(gap.reason)}</li>`).join('')}</ul></div>` : ''}
    <div class="contract-check">
      <h4>After you finish, confirm</h4>
      <ul>${items.map((item) => `<li class="${state.contractChecked[item.id] ? 'ticked' : ''}"><label><input type="checkbox" data-contract-id="${esc(item.id)}" ${state.contractChecked[item.id] ? 'checked' : ''} /><span>${esc(item.label)}</span></label>${item.hint ? `<code>${esc(item.hint)}</code>` : ''}</li>`).join('')}</ul>
      ${items.length && ticked === items.length ? `<div class="contract-signed">${icon('check', 14)}<span>Contract satisfied — ${esc(contract.contractId)} verified on this machine.</span></div>` : ''}
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
  state.modal = null;
  render();
  if (state.lastFocusId) {
    const target = document.querySelector(`[data-action="${state.lastFocusId}"]`) || document.querySelector('#repo-input');
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
    { id: 'nav-graph', label: 'Graph', icon: 'grid', action: 'scroll-graph', show: isAnalysis },
    { id: 'nav-contract', label: 'Contract', icon: 'shield', action: 'scroll-contract', show: isAnalysis },
    { id: 'nav-settings', label: 'AI', icon: 'settings', action: 'settings', show: true },
  ];
  const visible = items.filter((item) => item.show);
  return `<nav class="mobile-nav" aria-label="Mobile sections">${visible.map((item) => `<button class="mobile-nav-item" data-action="${item.action}" aria-label="${item.label}">${icon(item.icon, 18)}<span>${item.label}</span></button>`).join('')}</nav>`;
}

function render() {
  let content = '';
  if (state.mode === 'loading') content = `<main class="main" id="main-content">${repoForm()}${loadingView()}</main>`;
  else if (state.mode === 'analysis' && state.guide) content = `<main class="main" id="main-content">${repoForm()}${analysisView()}</main>`;
  else content = `<main class="main" id="main-content">${emptyView()}</main>`;
  const mobileNav = state.mode !== 'loading' ? mobileBottomNav() : '';
  try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.setAttribute('data-theme', state.theme === 'light' ? 'light' : 'dark'); } catch { /* ignore */ }
  root.innerHTML = `<div class="app-shell">${topbar()}<div class="layout">${sidebar()}${content}</div>${mobileNav}${state.modal === 'settings' ? settingsModal() : ''}${state.modal === 'install' ? installModal() : ''}${state.modal === 'failure' ? failureModal() : ''}${toastHtml()}<div class="sr-only" aria-live="polite">${esc(liveSummary())}</div></div>`;
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

function resetExplorer() {
  state.insight = null;
  state.insightLoading = null;
  state.insightError = '';
  state.insightCache = {};
  state.insightQuestion = '';
}

async function analyze() {
  const input = document.querySelector('#repo-input');
  state.repoUrl = input?.value.trim() || state.repoUrl.trim();
  state.error = '';
  if (!state.repoUrl) { state.error = 'Paste a GitHub repository URL to begin.'; render(); return; }
  state.mode = 'loading';
  state.guide = null;
  state.checked = {};
  resetExplorer();
  state.openMenuId = null;
  state.renamingId = null;
  render();
  try {
    const config = hasAiConfig() ? { ...state.settings } : null;
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repoUrl: state.repoUrl, expertise: state.expertise, config }) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'The repository could not be analyzed.');
    state.guide = payload.guide;
    state.mode = 'analysis';
    emptySession();
    state.pathSelections = { ...(state.guide.pathGraph?.defaults || {}) };
    state.recovery = null;
    state.explanationIndex = 0;
    state.expandedDirs = {};
    state.treeFilter = '';
    const historyEntry = { id: uid(), url: state.repoUrl, name: shortName(state.guide), label: '', analyzedAt: state.guide.analyzedAt, guide: state.guide, session: sessionSnapshot() };
    state.history = [historyEntry, ...state.history.filter((entry) => entry.url !== state.repoUrl)].slice(0, 20);
    persistHistory();
    render();
  } catch (error) {
    state.mode = 'empty';
    state.error = error.message || 'Analysis failed. Check the URL and try again.';
    render();
  }
}

async function runInsight(mode, question = '', baseMode = '') {
  if (state.mode !== 'analysis' || !state.guide) return;
  const cacheKey = mode === 'custom' ? `custom:${question}` : mode;
  if (state.insightCache[cacheKey]) {
    state.insight = state.insightCache[cacheKey];
    state.insightLoading = null;
    state.insightError = '';
    render();
    document.querySelector('.insight-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  state.insightLoading = mode;
  state.insightError = '';
  render();
  try {
    const config = hasAiConfig() ? { ...state.settings } : null;
    const response = await fetch('/api/insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: state.repoUrl, mode, question, baseMode: baseMode || undefined, config }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'The explorer could not answer right now.');
    state.insight = payload.insight;
    state.insightCache[cacheKey] = payload.insight;
    state.insightLoading = null;
    render();
    document.querySelector('.insight-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    state.insightLoading = null;
    state.insightError = error.message || 'Explorer request failed.';
    render();
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
  if (button) { button.disabled = true; button.innerHTML = `${icon('refresh', 13, 'spinner')} Fetching…`; }
  if (status) { status.className = 'settings-status'; status.textContent = 'Contacting your provider…'; }
  try {
    const response = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: values.baseUrl, apiKey: values.apiKey }) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not fetch models.');
    state.modelOptions = payload.models || [];
    state.settings = { ...state.settings, ...values };
    render();
    const newStatus = document.querySelector('#settings-status');
    if (newStatus) { newStatus.className = 'settings-status good'; newStatus.textContent = `${state.modelOptions.length} model${state.modelOptions.length === 1 ? '' : 's'} available. Select one below.`; }
  } catch (error) {
    if (status) { status.className = 'settings-status bad'; status.textContent = error.message || 'Could not fetch models.'; }
    if (button) { button.disabled = false; button.innerHTML = `${icon('refresh', 13)} Fetch models`; }
  }
}
function saveSettings(event) {
  event.preventDefault();
  const values = readSettingsFromForm();
  state.settings = values;
  sessionStorage.setItem('git-up-api-key', values.apiKey);
  localStorage.setItem('git-up-settings', JSON.stringify({ baseUrl: values.baseUrl, endpoint: values.endpoint, model: values.model, modelOptions: state.modelOptions }));
  closeModal();
  showToast(hasAiConfig() ? 'AI provider connected for this session.' : 'Provider configuration saved. Local scan remains available.');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard.'); }
  catch { showToast('Copy was blocked by the browser. Select the command manually.', 'error'); }
}
function newAnalysis() { state.mode = 'empty'; state.repoUrl = ''; state.guide = null; state.checked = {}; state.error = ''; state.modal = null; state.recovery = null; emptySession(); state.openMenuId = null; state.renamingId = null; resetExplorer(); render(); document.querySelector('#repo-input')?.focus(); }
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
  resetExplorer();
  render();
}

function bindEvents() {
  document.querySelector('#repo-form')?.addEventListener('submit', (event) => { event.preventDefault(); analyze(); });
  document.querySelector('#repo-input')?.addEventListener('input', (event) => { state.repoUrl = event.target.value; });
  document.querySelector('#settings-form')?.addEventListener('submit', saveSettings);
  document.querySelectorAll('[data-action="new-analysis"]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); newAnalysis(); }));
  document.querySelectorAll('[data-action="settings"]').forEach((el) => el.addEventListener('click', () => { state.lastFocusId = 'settings'; state.modal = 'settings'; render(); setTimeout(() => document.querySelector('#base-url')?.focus(), 30); }));
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
  // Features 3 + 4: explorer + follow-ups
  document.querySelectorAll('[data-action="explorer"]').forEach((el) => el.addEventListener('click', () => runInsight(el.dataset.mode)));
  document.querySelectorAll('[data-action="followup"]').forEach((el) => el.addEventListener('click', () => runInsight('custom', el.dataset.question, el.dataset.basemode)));
  document.querySelectorAll('[data-action="insight-close"]').forEach((el) => el.addEventListener('click', () => { state.insight = null; state.insightError = ''; render(); }));
  document.querySelector('#insight-question')?.addEventListener('input', (event) => { state.insightQuestion = event.target.value; });
  document.querySelector('#insight-base')?.addEventListener('change', (event) => { state.insightBase = event.target.value; });
  document.querySelector('#insight-custom')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = document.querySelector('#insight-question')?.value.trim() || '';
    if (!question) { showToast('Type a question about this repository first.', 'error'); return; }
    state.insightQuestion = question;
    runInsight('custom', question, document.querySelector('#insight-base')?.value || 'recommendations');
  });
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
    if (pattern) runInsight('custom', `Why does "${pattern.label}" break this install, and what is the exact fix for my setup?`, 'bugs');
  }));
  document.querySelector('#explanation-select')?.addEventListener('change', (event) => { state.explanationIndex = Number(event.target.value); render(); });
  document.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', () => copyText(el.dataset.copy)));
  // Mobile bottom nav actions
  document.querySelectorAll('[data-action="scroll-path"]').forEach((el) => el.addEventListener('click', () => { document.querySelector('#route-path')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  document.querySelectorAll('[data-action="scroll-graph"]').forEach((el) => el.addEventListener('click', () => { document.querySelector('#route-graph')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  document.querySelectorAll('[data-action="scroll-contract"]').forEach((el) => el.addEventListener('click', () => { document.querySelector('#route-contract')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  // Magic UI ports: cursor spotlight on cards, count-up tickers (re-bind each render).
  bindSpotlight(document);
  bindTickers(document);
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
  if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); state.lastFocusId = 'settings'; state.modal = 'settings'; render(); setTimeout(() => document.querySelector('#base-url')?.focus(), 30); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && state.mode !== 'loading') { event.preventDefault(); analyze(); }
  if (event.key === 'Escape' && state.modal) { closeModal(); }
  else if (event.key === 'Escape' && state.openMenuId) { state.openMenuId = null; render(); }
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

render();

// Named exports exist only so tests/render.test.mjs can drive the real client
// module in Node. The browser loads this file as a module either way.
export { state, render, activePath, installScript, setPathOption, setExpertise, emptySession, sessionSnapshot, hydrateSession };
