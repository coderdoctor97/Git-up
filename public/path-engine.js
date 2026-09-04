// ---------------------------------------------------------------------------
// Git-Up path engine
// Shared by the server (building the default path + install script) and the
// browser (live re-composition when a graph node is clicked). No DOM access.
//
// Responsibilities:
//   - stable step identity across revisions (lineage keys)
//   - composing an active path from a base step list + graph selections
//   - progress / revision helpers used by the living install session
// ---------------------------------------------------------------------------

/** Rough slot for well-known step ids so inserts land in the right place. */
export const STEP_ORDER = {
  preflight: 5,
  clone: 10,
  toolchain: 15,
  services: 18,
  docker: 20,
  dependencies: 25,
  database: 30,
  env: 35,
  secrets: 38,
  migrate: 45,
  build: 50,
  seed: 55,
  dev: 60,
  run: 65,
  start: 66,
  verify: 75,
  contract: 80,
};

/** Numeric sort key for a step. Falls back to slot name, then position. */
export function orderOf(step, index) {
  if (typeof step?.order === 'number' && Number.isFinite(step.order)) return step.order;
  const named = STEP_ORDER[String(step?.id || '').toLowerCase()];
  if (typeof named === 'number') return named;
  return index === undefined ? 50 : (index + 1) * 10;
}

/**
 * Lineage key. Survives recovery rewrites so checkboxes stay put:
 * `key` is copied onto a replacement step by the recovery pass, and the AI is
 * instructed to reuse the id of any step it keeps.
 */
export function keyOf(step, index) {
  const raw = step?.key || step?.id;
  if (raw) return String(raw);
  return `step-${(index ?? 0) + 1}`;
}

/** Stamp every step with a stable key + order so the UI has something to bind to. */
export function decorateSteps(steps = [], prefix = '') {
  return steps.map((step, index) => ({
    ...step,
    id: String(step.id || `${prefix || 'step'}-${index + 1}`),
    key: String(step.key || step.id || `${prefix || 'step'}-${index + 1}`),
    order: orderOf(step, index),
    revision: step.revision || 1,
  }));
}

function axisMatches(when, selections) {
  if (!when || typeof when !== 'object') return true;
  return Object.entries(when).every(([axisId, value]) => {
    const chosen = selections?.[axisId];
    if (chosen === undefined || chosen === null) return true;
    const allowed = Array.isArray(value) ? value : [value];
    return allowed.map(String).includes(String(chosen));
  });
}

/** Active option for an axis, honouring the caller's pick then the axis default. */
export function optionFor(axis, selections) {
  const wanted = selections?.[axis.id];
  return (
    (wanted !== undefined && wanted !== null ? axis.options.find((option) => option.id === wanted) : null) ||
    axis.options.find((option) => option.default) ||
    axis.options[0] ||
    null
  );
}

/**
 * Compose the visible path.
 *
 * `graph.axes[]`    decision axes; the chosen option contributes `adds[]`,
 *                   drops `removes[]` ids, and seeds `selections` defaults.
 * `step.when`       include only when the live selections match
 *                   (e.g. `{ os: 'windows' }`, `{ method: ['native','dev'] }`).
 * `step.unless`     exclude when those selections match.
 */
export function composeSteps(baseSteps = [], graph = {}, selections = {}) {
  const axes = Array.isArray(graph?.axes) ? graph.axes : [];
  const resolved = { ...(graph?.defaults || {}) };
  const adds = [];
  const removes = new Set();
  const notes = [];

  for (const axis of axes) {
    const option = optionFor(axis, { ...resolved, ...selections });
    if (!option) continue;
    resolved[axis.id] = option.id;
    for (const extra of option.adds || []) adds.push(extra);
    for (const drop of option.removes || []) removes.add(String(drop));
    if (option.warning) notes.push(option.warning);
  }

  const effective = { ...resolved, ...(selections || {}) };
  const merged = [...baseSteps, ...adds].filter((step, index, all) => {
    if (!step) return false;
    if (all.indexOf(step) !== index) return false;
    if (removes.has(String(step.id)) || removes.has(String(step.key || ''))) return false;
    if (!axisMatches(step.when, effective)) return false;
    if (step.unless && axisMatches(step.unless, effective)) return false;
    return true;
  });

  return merged
    .map((step, index) => ({ ...step, order: orderOf(step, index) }))
    .sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
    .map((step, index) => ({ ...step, position: index + 1 }));
}

/** Ticks for the composed path plus anything checked in earlier revisions. */
export function progressOf(steps = [], checked = {}) {
  const total = steps.length;
  const done = steps.filter((step) => checked[keyOf(step)]).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** A flat copy-paste block for expert mode / the Install action. */
export function fastPathFrom(steps = []) {
  return steps
    .map((step) => String(step.command || '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Selected path as human-readable labels, used in the script header + contract. */
export function selectionsLabel(axes = [], selections = {}) {
  return axes
    .map((axis) => {
      const option = optionFor(axis, selections);
      return option ? option.label : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * Splice a corrected path into the live one (Feature 1).
 *
 * Everything up to and including the failed step stays exactly as it was — the
 * user already did it. From the failed step forward, the recovery pass supplies
 * replacement steps. A replacement carrying an existing id is treated as the
 * same step, so its checkmark and history survive; unmatched old steps are
 * retired into `superseded` rather than deleted, so the revision trail can show
 * what the path used to be.
 */
export function applyRevision(steps = [], recovery = {}, failedId = '') {
  const failedIndex = steps.findIndex((entry) => String(entry.id) === String(failedId) || keyOf(entry) === String(failedId));
  const at = failedIndex < 0 ? 0 : failedIndex;
  const before = steps.slice(0, at);
  const tail = steps.slice(at);
  const replacements = (recovery.correctedSteps || []).map((entry, index) => ({
    ...entry,
    key: String(entry.key || entry.id || `rev-replacement-${index}`),
    order: typeof entry.order === 'number' ? entry.order : 10 + index,
    revision: (recovery.revision || 2),
  }));
  const incoming = new Set(replacements.map((entry) => String(entry.id)));
  const superseded = tail.filter((entry) => !incoming.has(String(entry.id))).map((entry) => ({ id: entry.id, key: keyOf(entry), title: entry.title }));
  const revised = [...before, ...replacements].map((entry, index) => ({ ...entry, position: index + 1 }));
  return { steps: revised, superseded, revision: recovery.revision || 2, changedFrom: at };
}

/** A revision log entry, shaped for the timeline in the UI. */
export function revisionEntry({ revision, failedStep, recovery, previousCount, nextCount, source }) {
  return {
    revision,
    at: new Date().toISOString(),
    source: source || recovery?.source || 'local-rules',
    failedStepId: failedStep?.id || '',
    failedStepTitle: failedStep?.title || 'a step',
    diagnosis: recovery?.diagnosis || '',
    confidence: recovery?.confidence || 'medium',
    added: Math.max(0, nextCount - previousCount),
    removed: Math.max(0, previousCount - nextCount),
    matched: (recovery?.matched || []).map((entry) => entry.id),
    note: recovery?.note || '',
  };
}


// ---------------------------------------------------------------------------
// Feature 5 — Zero-context clone mode
// Shared so the browser can switch reader levels instantly (no re-scan, no API
// call) while the server applies the identical shaping when it builds the
// guide. Same function on both sides means the two can never disagree.
// ---------------------------------------------------------------------------

/** Expertise levels for Feature 5 — depth of explanation and warning volume. */
export const EXPERTISE_LEVELS = [
  { id: 'novice', label: 'I know nothing about this project', short: 'New here', detail: 'Every step explains why it exists, all safety notes stay on, and the verification step is spelled out.', explanation: 'full', warnings: 'all', tempo: 'one action at a time', reveal: ['plainOverview', 'explanations', 'contract'] },
  { id: 'some', label: 'I’ve used similar tools before', short: 'Some experience', detail: 'Standard depth: commands plus a one-line reason, warnings limited to what could actually bite you.', explanation: 'normal', warnings: 'relevant', tempo: 'a normal terminal session', reveal: ['explanations', 'contract'] },
  { id: 'expert', label: 'I’m an expert, just give me the fast path', short: 'Expert', detail: 'Dense commands first. Prose hidden, low-risk warnings dropped, and one copy-paste block for the whole path.', explanation: 'minimal', warnings: 'critical', tempo: 'fastest possible', reveal: ['contract'] },
];

export function expertiseFor(level) {
  return EXPERTISE_LEVELS.find((entry) => entry.id === level) || EXPERTISE_LEVELS[1];
}

/**
 * Shape a guide for one reader. Deterministic — it drops, tightens, and
 * reorders what the scan already produced instead of asking the model again.
 */
export function tuneGuide(guide, level) {
  const profile = expertiseFor(level);
  // Reshaping is destructive to `detail`/`notes`, so the pristine values are kept
  // on the guide and every switch starts from them — flipping novice → expert →
  // novice can never compound truncation or lose text that was already dropped.
  const pristine = guide.tuning || { steps: guide.steps, notes: guide.notes, plainOverview: guide.plainOverview, notesWithSeverity: guide.notesWithSeverity };
  const source = { ...guide, steps: pristine.steps, notes: pristine.notes, plainOverview: pristine.plainOverview, notesWithSeverity: pristine.notesWithSeverity };
  const tuned = { ...source, expertise: { ...profile }, tuning: pristine };
  const isExpert = profile.explanation === 'minimal';
  const isNovice = profile.explanation === 'full';

  tuned.steps = (source.steps || []).map((entry) => {
    const next = { ...entry };
    if (isExpert) {
      next.detail = String(entry.detail || '').split(/(?<=\.)\s/)[0] || '';
      next.explanation = next.detail;
    } else if (isNovice) {
      const explained = (source.explanations || []).find((item) => item.stepId === entry.id);
      next.detail = [entry.detail, explained?.body].filter(Boolean).join(' ').slice(0, 620);
      next.why = explained?.body || entry.detail || '';
      if (next.command) next.tips = [`Paste the command, wait for it to finish, then read the last three lines before continuing.`];
    }
    return next;
  });

  if (isExpert && tuned.steps.length > 2) {
    tuned.fastPath = tuned.steps.map((entry) => String(entry.command || '').trim()).filter(Boolean).join('\n');
  }
  const severityRank = { high: 3, medium: 2, low: 1 };
  const classify = (note) => (typeof note === 'string'
    ? { text: note, severity: /sudo|secret|password|destructive|rm -rf|never commit|production/i.test(note) ? 'high' : /rate limit|unavailable|fallback|inferred|could not/i.test(note) ? 'low' : 'medium' }
    : { ...note, severity: note.severity || 'medium' });
  const notes = (source.notesWithSeverity && source.notesWithSeverity.length) ? source.notesWithSeverity.map(classify) : (source.notes || []).map(classify);
  tuned.notesWithSeverity = notes;
  tuned.notes = notes
    .filter((note) => (profile.warnings === 'critical' ? note.severity === 'high' : profile.warnings === 'relevant' ? note.severity !== 'low' : true))
    .map((note) => note.text);
  tuned.hiddenNotes = notes.length - tuned.notes.length;
  if (isNovice) {
    tuned.notes = [
      'Start at step one and only move on when the previous command finished without red text — skipping ahead is where most of this breaks.',
      ...tuned.notes,
    ];
  }
  if (tuned.plainOverview && !isExpert) tuned.plainOverview = { ...source.plainOverview };
  if (isExpert) tuned.plainOverview = { analogy: source.plainOverview?.analogy || '', problem: source.plainOverview?.problem || '', audience: '', howItWorks: [] };
  return tuned;
}
