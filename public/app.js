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
};
function icon(name, size = 17, className = '') { return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${icons[name] || icons.info}</svg>`; }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); } catch { return 'Just now'; }
}
function uid() { return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function shortName(guide) { return guide?.repository?.name || guide?.repository?.repo || 'Repository'; }
function loadJson(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function displayName(entry) { return (entry?.label || '').trim() || entry?.name || entry?.url || 'Repository'; }
function persistHistory() { try { localStorage.setItem('forgepath-history', JSON.stringify(state.history.slice(0, 20))); } catch { /* ignore */ } }
const savedSettings = loadJson('forgepath-settings', {});
const rawHistory = loadJson('forgepath-history', []);
const savedHistory = (Array.isArray(rawHistory) ? rawHistory : []).map((entry) => ({
  id: entry.id || uid(),
  url: entry.url,
  name: entry.name || entry.url,
  label: entry.label || '',
  analyzedAt: entry.analyzedAt,
  guide: entry.guide,
})).filter((entry) => entry.url && entry.guide);
const state = {
  mode: 'empty',
  repoUrl: '',
  guide: null,
  checked: {},
  explanationIndex: 0,
  modal: null,
  error: '',
  toast: null,
  settings: { baseUrl: savedSettings.baseUrl || 'https://api.openai.com/v1', endpoint: savedSettings.endpoint || '/chat/completions', model: savedSettings.model || '', apiKey: sessionStorage.getItem('forgepath-api-key') || '' },
  modelOptions: Array.isArray(savedSettings.modelOptions) ? savedSettings.modelOptions : [],
  history: savedHistory,
  secretVisible: false,
  // Feature 3 + 4: Curious Explorer + follow-ups
  insight: null,
  insightLoading: null,
  insightError: '',
  insightCache: {},
  // Feature 2: sidebar menus + file tree
  openMenuId: null,
  renamingId: null,
  renameDraft: '',
  expandedDirs: {},
  treeFilter: '',
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

function topbar() {
  const aiReady = hasAiConfig();
  return `<header class="topbar">
    <a class="brand" href="#" data-action="new-analysis" aria-label="Forgepath home">
      <span class="brand-mark">${icon('mark', 19)}</span><span class="brand-word">forge<em>path</em></span>
    </a>
    <div class="topbar-center"><span>Workspace</span><span class="slash">/</span><strong>${state.mode === 'analysis' ? esc(displayName({ label: '', name: shortName(state.guide) })) : 'New analysis'}</strong></div>
    <div class="topbar-actions">
      <div class="connection-pill"><i class="status-dot ${aiReady ? 'online' : ''}"></i><span>${aiReady ? 'AI connected' : 'Local scan ready'}</span></div>
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
      const isFile = isLast && (part.includes('.') || parts.length === 1 || !/^[A-Z_.-]+$/.test(part) || true);
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
  return `<div class="side-section">
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
        <button class="mini-btn save" data-action="history-rename-save" data-id="${esc(entry.id)}" title="Save label">${icon('check', 12)}</button>
        <button class="mini-btn" data-action="history-rename-cancel" title="Cancel">${icon('close', 12)}</button>
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
  return `<aside class="sidebar">
    <button class="new-analysis" data-action="new-analysis">${icon('plus', 16)}<span>New analysis</span></button>
    <p class="sidebar-label">Workspace</p>
    <nav class="sidebar-nav" aria-label="Workspace navigation">
      <button class="nav-item active" data-action="new-analysis"><span class="nav-icon">${icon('grid', 16)}</span><span>Analyses</span><span class="nav-count">${state.history.length || '—'}</span></button>
      <button class="nav-item" data-action="settings"><span class="nav-icon">${icon('settings', 16)}</span><span>AI provider</span></button>
    </nav>
    <div class="history"><p class="sidebar-label">Recent</p><div class="history-list">${historyHtml}</div></div>
    ${fileTreePanel()}
    <div class="sidebar-foot"><div class="local-note"><strong>Private by default</strong>Your API key stays in this browser session. Repository files are only sent to your configured AI provider.</div></div>
  </aside>`;
}

function repoForm() {
  return `<form class="repo-form" id="repo-form">
    <div class="repo-input-wrap">${icon('github', 17)}<input id="repo-input" class="repo-input" autocomplete="url" spellcheck="false" value="${esc(state.repoUrl)}" placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" required /></div>
    <button class="analyze-button ${state.mode === 'loading' ? 'loading' : ''}" type="submit" ${state.mode === 'loading' ? 'disabled' : ''}>${state.mode === 'loading' ? `${icon('refresh', 15, 'spinner')}Scanning repository` : `${icon('spark', 15)}Analyze repository`}</button>
  </form>
  <div class="form-meta"><span>${icon('github', 12)} Public repositories</span><span>${icon('key', 12)} SSH, HTTPS, and Git URLs</span><span class="shortcut">⌘ ↵</span></div>
  ${state.error ? `<div class="error-banner" role="alert">${icon('warning', 17)}<span>${esc(state.error)}</span></div>` : ''}`;
}

function emptyView() {
  return `<section class="hero">
    <div class="eyebrow"><span class="eyebrow-line"></span>Repository → ready-to-run</div>
    <h1>Make any repo<br /><span>runnable, without the archaeology.</span></h1>
    <p class="hero-copy">Forgepath reads the setup surface of a GitHub repository, finds what it needs, and turns scattered instructions into one calm, trackable installation plan.</p>
    ${repoForm()}
  </section>
  <section class="initial-content" aria-labelledby="how-it-works">
    <div class="section-kicker" id="how-it-works">How Forgepath works</div>
    <div class="how-grid">
      <article class="how-card"><span class="how-number">01 / SCAN</span><h3>Read the setup surface</h3><p>Manifests, lockfiles, Docker configs, README instructions, and environment hints.</p></article>
      <article class="how-card"><span class="how-number">02 / ORGANIZE</span><h3>Separate signal from noise</h3><p>Dependencies and requirements become distinct, while every command gets a clear purpose.</p></article>
      <article class="how-card"><span class="how-number">03 / SHIP</span><h3>Follow a clean path</h3><p>Check off each action, understand why it matters, and copy a ready-to-run script.</p></article>
    </div>
    <div class="example-row"><span>Try a public repo</span><button class="example-chip" data-example="https://github.com/expressjs/express">${icon('github', 12)} expressjs/express</button><button class="example-chip" data-example="https://github.com/tiangolo/fastapi">${icon('github', 12)} tiangolo/fastapi</button><button class="example-chip" data-example="git@github.com:golang/go.git">${icon('github', 12)} golang/go <small>SSH</small></button></div>
  </section>`;
}

function loadingView() {
  return `<section class="loading-view"><div class="loading-top"><div class="loading-orb">${icon('spark', 18)}</div><div><h2>Reading the repository surface</h2><p>Looking for manifests, lockfiles, environment templates, and the shortest path to running it.</p></div></div><div class="skeleton-grid"><div class="skeleton-panel"><div class="skeleton-line short"></div><div class="skeleton-line wide"></div><div class="skeleton-line mid"></div><div class="skeleton-line"></div><div class="skeleton-line mid"></div><div class="skeleton-line"></div></div><div class="skeleton-panel"><div class="skeleton-line short"></div><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-line mid"></div><div class="skeleton-line"></div></div></div></section>`;
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
  const sections = (state.guide?.steps || []).map((step) => [`# ${step.title}`, step.command].filter(Boolean).join('\n'));
  return ['#!/usr/bin/env bash', 'set -e', '', ...sections].join('\n\n');
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
    result = `<div class="insight-panel error" role="alert">${icon('warning', 16)}<div><strong>Could not load that idea.</strong><p>${esc(state.insightError)}</p></div></div>`;
  } else if (state.insight) {
    const insight = state.insight;
    result = `<article class="insight-panel" aria-live="polite">
      <div class="insight-head"><div class="insight-title-wrap"><span class="insight-ic">${icon(insight.mode === 'features' ? 'bulb' : insight.mode === 'bugs' ? 'shield' : 'compass', 15)}</span><div><h4>${esc(insight.title || 'Explorer result')}</h4><span class="tag ${insight.source === 'ai' ? 'ai' : 'scan'}"><i class="tag-dot"></i>${insightSourceLabel(insight.source)}</span></div></div><button class="icon-button" data-action="insight-close" aria-label="Close explorer result">${icon('close', 15)}</button></div>
      ${insight.intro ? `<p class="insight-intro">${esc(insight.intro)}</p>` : ''}
      ${(insight.bullets || []).length ? `<ul class="insight-list">${insight.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${insight.outro ? `<div class="insight-outro">${icon('check', 13)}<span>${esc(insight.outro)}</span></div>` : ''}
      ${followUpChips(insight.followUps, insight.mode === 'custom' ? 'recommendations' : insight.mode)}
    </article>`;
  }
  const guideFollowUps = state.guide?.followUps || [];
  return `<section class="panel explorer-panel" aria-labelledby="explorer-title">
    <div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('spark', 15)}</div><div><h3 id="explorer-title">Curious Explorer</h3><p class="panel-subtitle">One click, three specialist lenses — works instantly, deeper with AI connected</p></div></div></div>
    <div class="explorer-body"><div class="explorer-grid">${buttons}</div>${result}${!state.insight && !loading ? followUpChips(guideFollowUps, 'recommendations') : ''}</div>
  </section>`;
}

function analysisView() {
  const guide = state.guide;
  const repo = guide.repository || {};
  const steps = guide.steps || [];
  const doneCount = steps.filter((step) => state.checked[step.id]).length;
  const { step, explanation } = explanationFor();
  const percent = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const files = (guide.files || []).slice(0, 14);
  return `<section class="analysis-view">
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
      <div class="analysis-actions"><button class="secondary-button" data-action="new-analysis">${icon('plus', 14)} New</button><button class="install-button" data-action="install">${icon('terminal', 14)} Install</button></div>
    </div>
    ${plainOverviewPanel()}
    <div class="overview-strip"><div class="overview-cell"><div class="cell-label">Analysis summary</div><div class="cell-value overview-summary">${esc(guide.summary || 'A structured installation path for this repository.')}</div></div><div class="overview-cell"><div class="cell-label">Default branch</div><div class="cell-value mono">${esc(repo.defaultBranch || 'main')}</div></div><div class="overview-cell"><div class="cell-label">Language</div><div class="cell-value">${esc(repo.language || 'Not detected')}</div></div><div class="overview-cell"><div class="cell-label">Files inspected</div><div class="cell-value mono">${(guide.files || []).length}</div></div></div>
    ${explorerSection()}
    <div class="dashboard-grid">
      <div class="primary-stack">
        <div class="info-grid"><section class="panel info-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('layers', 15)}</div><div><h3>Dependencies</h3><p class="panel-subtitle">Installed as part of this repository</p></div></div><span class="panel-count">${guide.dependencies?.length || 0}</span></div><div class="info-list">${dependencyList(guide.dependencies)}</div></section><section class="panel info-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('key', 15)}</div><div><h3>Requirements</h3><p class="panel-subtitle">Needed before the app can work</p></div></div><span class="panel-count">${guide.requirements?.length || 0}</span></div><div class="info-list">${requirementsList(guide.requirements)}</div></section></div>
        <section class="panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('list', 15)}</div><div><h3>Installation steps</h3><p class="panel-subtitle">A clean path from clone to running locally</p></div></div><span class="panel-count">${doneCount}/${steps.length} complete</span></div><div class="install-list">${steps.map((item, index) => `<article class="step-row ${state.checked[item.id] ? 'is-done' : ''}"><div class="step-number">${String(index + 1).padStart(2, '0')}</div><div class="step-body"><h4 class="step-title">${esc(item.title)}</h4><p class="step-detail">${esc(item.detail || '')}</p>${item.command ? `<div class="command-block"><button class="copy-mini" data-copy="${esc(item.command)}" aria-label="Copy command" title="Copy command">${icon('copy', 13)}</button>${esc(item.command)}</div>` : ''}</div><input class="step-check" type="checkbox" data-step-id="${esc(item.id)}" ${state.checked[item.id] ? 'checked' : ''} aria-label="Mark ${esc(item.title)} complete" /></article>`).join('')}</div><div class="install-progress"><div class="progress-copy"><span>${percent === 100 ? 'Installation path complete' : 'Progress through your installation path'}</span><strong>${percent}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div></div></section>
        ${guide.notes?.length ? `<section class="panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('book', 15)}</div><div><h3>Notes from the scan</h3><p class="panel-subtitle">Keep these caveats close while you set up</p></div></div></div><div class="info-list">${guide.notes.map((note) => `<div class="info-item"><span class="info-bullet"></span><span>${esc(note)}</span></div>`).join('')}</div></section>` : ''}
      </div>
      <div class="sticky-column"><section class="panel explanation-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('info', 15)}</div><div><h3>Explanation</h3><p class="panel-subtitle">Understand the why, without cluttering the checklist</p></div></div></div><div class="explanation-content"><label class="explanation-step-label" for="explanation-select">Selected step</label><select class="explanation-select" id="explanation-select">${steps.map((item, index) => `<option value="${index}" ${index === state.explanationIndex ? 'selected' : ''}>${String(index + 1).padStart(2, '0')} · ${esc(item.title)}</option>`).join('')}</select><h4>${esc(explanation.title || step?.title || 'Installation step')}</h4><p>${esc(explanation.body || step?.detail || '')}</p>${guide.environment?.length ? `<div class="explanation-tip">${icon('key', 14)}<span>Environment detected: <strong>${guide.environment.map(esc).join(', ')}</strong>. Keep secrets out of Git.</span></div>` : `<div class="explanation-tip">${icon('info', 14)}<span>Commands are shown for your terminal. Forgepath never executes code on your machine.</span></div>`}</div></section>${files.length ? `<section class="panel files-panel"><div class="panel-heading"><div class="panel-title-wrap"><div class="panel-icon">${icon('book', 15)}</div><div><h3>Inspected files</h3><p class="panel-subtitle">The setup evidence behind this guide</p></div></div></div><div class="file-list">${files.map((file) => `<span class="file-chip" title="${esc(file)}">${esc(file)}</span>`).join('')}</div></section>` : ''}</div>
    </div>
  </section>`;
}

function settingsModal() {
  const models = [...new Set([...(state.modelOptions || []), state.settings.model].filter(Boolean))];
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal-head"><div><h2 id="settings-title">AI provider</h2><p>Connect an OpenAI-compatible endpoint for a deeper repository review. Keys remain in this browser session.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close settings">${icon('close', 18)}</button></div><form class="modal-body" id="settings-form"><div class="inline-fields"><div class="form-field"><label for="base-url">Base URL <span>required</span></label><input class="text-field" id="base-url" value="${esc(state.settings.baseUrl)}" placeholder="https://api.openai.com/v1" /></div><div class="form-field"><label for="endpoint">Chat endpoint <span>required</span></label><input class="text-field" id="endpoint" value="${esc(state.settings.endpoint)}" placeholder="/chat/completions" /></div></div><div class="form-field"><label for="api-key">API key <span>session only</span></label><div class="secret-field"><input class="text-field" id="api-key" type="${state.secretVisible ? 'text' : 'password'}" value="${esc(state.settings.apiKey)}" placeholder="sk-…" autocomplete="off" /> <button class="reveal-key" type="button" data-action="toggle-key" aria-label="${state.secretVisible ? 'Hide' : 'Show'} API key">${icon(state.secretVisible ? 'eyeOff' : 'eye', 15)}</button></div><p class="field-hint">Used only for requests from this session. It is never saved to the server or included in a repository guide.</p></div><div class="form-field"><label for="model">Model <span>${models.length ? `${models.length} available` : 'fetch from provider'}</span></label><div class="model-row"><select class="select-field" id="model"><option value="">Select a model…</option>${models.map((model) => `<option value="${esc(model)}" ${model === state.settings.model ? 'selected' : ''}>${esc(model)}</option>`).join('')}</select><button type="button" class="fetch-button" data-action="fetch-models">${icon('refresh', 13)} Fetch models</button></div><p class="field-hint">Forgepath requests <span class="mono">GET /models</span> from your base URL. Your provider may use a different models endpoint.</p></div><div id="settings-status" class="settings-status"></div><div class="modal-foot"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="install-button" type="submit">${icon('check', 14)} Save configuration</button></div></form></section></div>`;
}
function installModal() {
  return `<div class="modal-layer" data-action="close-on-backdrop"><section class="modal script-modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><div class="modal-head"><div><h2 id="install-title">Your install script</h2><p>Review these commands, then run them in your own terminal. Nothing runs automatically.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close install script">${icon('close', 18)}</button></div><div class="modal-body"><p class="script-copy-note">This is the same order as your checklist. If the repository requires secrets, fill those in locally before running the script.</p><div class="script-block"><button class="copy-mini script-copy" data-copy="${esc(installScript())}" aria-label="Copy install script" title="Copy install script">${icon('copy', 13)}</button>${esc(installScript())}</div><div class="modal-foot"><button class="secondary-button" data-action="close-modal">Close</button><button class="install-button" data-copy="${esc(installScript())}">${icon('copy', 14)} Copy script</button></div></div></section></div>`;
}
function toastHtml() { return state.toast ? `<div class="toast ${state.toast.type}" role="status">${icon(state.toast.type === 'error' ? 'warning' : 'check', 15)}<span>${esc(state.toast.message)}</span></div>` : ''; }

function render() {
  let content = '';
  if (state.mode === 'loading') content = `<main class="main">${repoForm()}${loadingView()}</main>`;
  else if (state.mode === 'analysis' && state.guide) content = `<main class="main">${repoForm()}${analysisView()}</main>`;
  else content = `<main class="main">${emptyView()}</main>`;
  root.innerHTML = `<div class="app-shell">${topbar()}<div class="layout">${sidebar()}${content}</div>${state.modal === 'settings' ? settingsModal() : ''}${state.modal === 'install' ? installModal() : ''}${toastHtml()}</div>`;
  bindEvents();
}

function resetExplorer() {
  state.insight = null;
  state.insightLoading = null;
  state.insightError = '';
  state.insightCache = {};
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
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repoUrl: state.repoUrl, config }) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'The repository could not be analyzed.');
    state.guide = payload.guide;
    state.mode = 'analysis';
    state.explanationIndex = 0;
    state.expandedDirs = {};
    state.treeFilter = '';
    const historyEntry = { id: uid(), url: state.repoUrl, name: shortName(state.guide), label: '', analyzedAt: state.guide.analyzedAt, guide: state.guide };
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
  sessionStorage.setItem('forgepath-api-key', values.apiKey);
  localStorage.setItem('forgepath-settings', JSON.stringify({ baseUrl: values.baseUrl, endpoint: values.endpoint, model: values.model, modelOptions: state.modelOptions }));
  state.modal = null;
  showToast(hasAiConfig() ? 'AI provider connected for this session.' : 'Provider configuration saved. Local scan remains available.');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard.'); }
  catch { showToast('Copy was blocked by the browser. Select the command manually.', 'error'); }
}
function newAnalysis() { state.mode = 'empty'; state.repoUrl = ''; state.guide = null; state.checked = {}; state.error = ''; state.modal = null; state.openMenuId = null; state.renamingId = null; resetExplorer(); render(); document.querySelector('#repo-input')?.focus(); }
function restoreHistory(id) {
  const entry = state.history.find((item) => item.id === id) || state.history[Number(id)];
  if (!entry?.guide) return;
  state.repoUrl = entry.url;
  state.guide = entry.guide;
  state.mode = 'analysis';
  state.checked = {};
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
  document.querySelectorAll('[data-action="settings"]').forEach((el) => el.addEventListener('click', () => { state.modal = 'settings'; render(); setTimeout(() => document.querySelector('#base-url')?.focus(), 30); }));
  document.querySelectorAll('[data-action="close-modal"]').forEach((el) => el.addEventListener('click', () => { state.modal = null; render(); }));
  document.querySelectorAll('[data-action="close-on-backdrop"]').forEach((el) => el.addEventListener('click', (event) => { if (event.target === el) { state.modal = null; render(); } }));
  document.querySelectorAll('[data-action="install"]').forEach((el) => el.addEventListener('click', () => { state.modal = 'install'; render(); }));
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
  document.querySelectorAll('[data-step-id]').forEach((el) => el.addEventListener('change', (event) => { state.checked[event.target.dataset.stepId] = event.target.checked; render(); }));
  document.querySelector('#explanation-select')?.addEventListener('change', (event) => { state.explanationIndex = Number(event.target.value); render(); });
  document.querySelectorAll('[data-copy]').forEach((el) => el.addEventListener('click', () => copyText(el.dataset.copy)));
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
  if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); state.modal = 'settings'; render(); setTimeout(() => document.querySelector('#base-url')?.focus(), 30); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && state.mode !== 'loading') { event.preventDefault(); analyze(); }
  if (event.key === 'Escape' && state.modal) { state.modal = null; render(); }
  else if (event.key === 'Escape' && state.openMenuId) { state.openMenuId = null; render(); }
});
document.addEventListener('click', (event) => {
  if (state.openMenuId && !event.target.closest?.('.menu-wrap')) { state.openMenuId = null; render(); }
});

render();
