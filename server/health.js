// ---------------------------------------------------------------------------
// Feature 6 — Repository health score for installation
//
// Deliberately NOT produced by the model: every number here comes from
// observable repository evidence (README structure, commit dates, thread
// volume, CI rollups) so the score stays honest when a weak AI is connected.
// Each factor carries its own measurement, so the UI can show *why*.
// ---------------------------------------------------------------------------

const DAY = 1000 * 60 * 60 * 24;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
const round2 = (value) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);

function ageInDays(iso) {
  const time = Date.parse(iso || '');
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / DAY);
}

function freshnessFrom(days) {
  if (days === null) return { score: 45, detail: 'Last change could not be read, so freshness is unknown.' };
  if (days <= 30) return { score: 100, detail: `Pushed ${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'} ago.` };
  if (days <= 120) return { score: 88, detail: `Pushed about ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'} ago.` };
  if (days <= 365) return { score: 68, detail: `Last push was ${Math.round(days / 30)} months ago.` };
  if (days <= 365 * 2) return { score: 45, detail: `Quiet for ${Math.round(days / 30)} months — install instructions tend to drift.` };
  return { score: 22, detail: `Nothing pushed in ${Math.round(days / 36.5) / 10} years; expect the setup path to have rotted.` };
}

function documentationScore(files, metadata) {
  const readmeFile = files.find((file) => /^readme(\.|$)/i.test(String(file.path).split('/').pop() || ''));
  const readme = readmeFile?.content || '';
  if (!readme.trim()) {
    return { score: 15, detail: 'No README was found in the scanned tree.', signals: ['missing readme'] };
  }
  const signals = [];
  let score = 30;
  const words = readme.split(/\s+/).filter(Boolean).length;
  if (words > 120) { score += 12; signals.push(`${words} words`); }
  if (/\b(install|getting started|quick ?start|setup)\b/i.test(readme)) { score += 22; signals.push('install section'); }
  const fenced = [...readme.matchAll(/```[\s\S]{0,4000}?```/g)];
  const commandBlocks = fenced.filter((block) => /\b(npm|pnpm|yarn|pip|pip3|cargo|go |make|docker|brew|apt|git clone|cp \.env|python)/i.test(block[0]));
  if (commandBlocks.length) { score += Math.min(18, commandBlocks.length * 6); signals.push(`${commandBlocks.length} command block${commandBlocks.length === 1 ? '' : 's'}`); }
  const hasVersionClaim = /(node(\.js)?\s*v?\d|python\s*\d\.\d|go\s*1\.\d|rust\s*1\.|requires|prerequisite)/i.test(readme);
  if (hasVersionClaim) { score += 8; signals.push('version requirements stated'); }
  if (/(troubleshoot|common (issue|error)|faq)/i.test(readme)) { score += 6; signals.push('troubleshooting section'); }
  if (/(\.env|environment variable|API_KEY|token)/i.test(readme)) { score += 6; signals.push('environment explained'); }
  const hasContributing = files.some((file) => /^contributing(\.|$)/i.test(String(file.path).split('/').pop() || ''));
  if (hasContributing) { score += 4; signals.push('CONTRIBUTING present'); }
  if (metadata?.homepage) { score += 3; signals.push('documented homepage'); }
  return { score: clamp(score), detail: `README quality: ${signals.length ? signals.join(', ') : 'prose only, no runnable commands'}.`, signals };
}

function reproducibilityScore(files, metadata) {
  const names = new Set(files.map((file) => String(file.path).toLowerCase().split('/').pop()));
  const signals = [];
  let score = 34;
  const lockfiles = ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'bun.lockb', 'bun.lock', 'poetry.lock', 'pipfile.lock', 'cargo.lock', 'go.sum', 'uv.lock'];
  const presentLock = lockfiles.filter((name) => names.has(name));
  if (presentLock.length) { score += 20; signals.push(`lockfile (${presentLock[0]})`); }
  else if (names.has('package.json') || names.has('requirements.txt') || names.has('pyproject.toml') || names.has('go.mod')) {
    signals.push('no lockfile committed');
  }
  if (names.has('.env.example') || names.has('.env.sample')) { score += 12; signals.push('env template'); }
  if (names.has('dockerfile') || names.has('docker-compose.yml') || names.has('docker-compose.yaml')) { score += 14; signals.push('container definition'); }
  if (names.has('makefile') || names.has('justfile')) { score += 8; signals.push('task runner file'); }
  if (names.has('package.json')) {
    let parsed = null;
    try { parsed = JSON.parse(files.find((file) => file.path.toLowerCase().endsWith('package.json'))?.content || 'null'); } catch { /* ignore */ }
    if (parsed?.engines) { score += 10; signals.push('engines pinned'); }
    if (parsed?.scripts?.setup || parsed?.scripts?.bootstrap) { score += 6; signals.push('setup script'); }
    if (parsed?.packageManager) { score += 6; signals.push('packageManager declared'); }
  }
  if (metadata?.topics?.length) { score += Math.min(6, metadata.topics.length); signals.push(`${metadata.topics.length} topics`); }
  return { score: clamp(score), detail: signals.length ? `Reproducibility aids: ${signals.join(', ')}.` : 'No lockfile, container file, or task runner was found.', signals };
}

function failurePressureScore(failureScan) {
  if (!failureScan?.available) {
    const inferred = failureScan?.patterns?.length || 0;
    return {
      score: inferred >= 4 ? 52 : inferred >= 2 ? 66 : 74,
      detail: failureScan?.notice || 'Thread scan was skipped, so reported failure pressure is unknown.',
      signals: [`sampled: ${failureScan?.sampled?.issues || 0} issues`],
    };
  }
  const reported = (failureScan.patterns || []).filter((pattern) => pattern.origin === 'reported');
  const hits = reported.reduce((sum, pattern) => sum + pattern.count, 0);
  const open = reported.reduce((sum, pattern) => sum + pattern.openCount, 0);
  const sampled = Math.max(1, failureScan.sampled.issues + failureScan.sampled.pulls);
  const ratio = hits / sampled;
  let score = 100 - Math.min(64, Math.round(ratio * 150)) - Math.min(14, open * 2);
  const signals = [`${hits} install-failure thread${hits === 1 ? '' : 's'} in the last ${sampled}`, `${failureScan.installRelated} of ${failureScan.totalThreads} recent threads mention setup`];
  if (!hits) score = 92;
  return { score: clamp(score), detail: hits ? `${hits} of the last ${sampled} threads describe a setup failure.` : 'No installation failures among the threads sampled.', signals };
}

function ciToSignal(payload) {
  const runs = payload?.check_runs || [];
  if (!runs.length) return null;
  const failing = runs.filter((run) => run.conclusion && !['success', 'skipped', 'neutral'].includes(run.conclusion));
  const passing = runs.filter((run) => run.conclusion === 'success');
  const pending = runs.filter((run) => run.status !== 'completed');
  if (failing.length) return { state: 'failing', failing: failing.length, total: runs.length, names: failing.slice(0, 4).map((run) => run.name) };
  if (pending.length && pending.length === runs.length) return { state: 'pending', pending: pending.length, total: runs.length };
  if (passing.length) return { state: 'passing', passing: passing.length, total: runs.length };
  return { state: 'unknown', total: runs.length };
}

export async function fetchCiSignal({ repo, github, metadata }) {
  if (typeof github !== 'function') return { state: 'unavailable' };
  const branch = metadata?.default_branch || 'HEAD';
  const commit = await (async () => {
    try { return await github(`/repos/${repo.apiPath}/commits?sha=${encodeURIComponent(branch)}&per_page=1`); } catch { return null; }
  })();
  const sha = Array.isArray(commit) ? commit[0]?.sha : commit?.sha;
  if (!sha) return { state: 'unavailable', branch };
  const checks = await (async () => {
    try { return ciToSignal(await github(`/repos/${repo.apiPath}/commits/${sha}/check-runs?per_page=30`)); } catch { return null; }
  })();
  const status = await (async () => {
    try {
      const payload = await github(`/repos/${repo.apiPath}/commits/${sha}/status`);
      const contexts = payload?.statuses || [];
      if (!contexts.length) return null;
      const failing = contexts.filter((item) => item.state === 'failure' || item.state === 'error');
      return failing.length ? { state: 'failing', failing: failing.length, total: contexts.length, names: failing.slice(0, 4).map((item) => item.context) } : { state: 'passing', total: contexts.length };
    } catch { return null; }
  })();
  const rollup = checks || status;
  return {
    state: rollup?.state || 'no-ci',
    branch,
    sha,
    committedAt: (Array.isArray(commit) ? commit[0]?.commit?.committer?.date : commit?.commit?.committer?.date) || null,
    failing: rollup?.failing || 0,
    passing: rollup?.passing || 0,
    failingNames: (rollup?.names || []).slice(0, 3),
    total: rollup?.total || 0,
  };
}

function mainBranchScore(ci, readmeDays) {
  if (!ci || ci.state === 'unavailable') {
    return { score: 58, detail: 'No CI or status API was readable for the default branch, so “main is green” cannot be confirmed.', signals: [] };
  }
  if (ci.state === 'failing') {
    const names = ci.failingNames?.length ? ` (${ci.failingNames.join(', ')})` : '';
    return { score: 24, detail: `${ci.failing} check${ci.failing === 1 ? '' : 's'} failing on ${ci.branch}${names} — the default branch is currently rough.`, signals: ci.failingNames || [] };
  }
  if (ci.state === 'passing') return { score: 96, detail: `${ci.passing || ci.total} check(s) passing on ${ci.branch}.`, signals: [] };
  if (ci.state === 'pending') return { score: 70, detail: `Checks on ${ci.branch} are still running.`, signals: [] };
  return { score: 62, detail: `${ci.branch} has no CI configured, so install breakage is only caught by people trying it.`, signals: [] };
}

export const BANDS = [
  { id: 'smooth', min: 85, label: 'Usually installs clean', tone: 'mint', note: 'Follow the path top to bottom and it should land.' },
  { id: 'workable', min: 68, label: 'Workable with care', tone: 'blue', note: 'Expect one or two small corrections; the failure list tells you where.' },
  { id: 'attention', min: 48, label: 'Needs attention', tone: 'amber', note: 'Plan for manual fixes — check the contract before installing anything.' },
  { id: 'rough', min: 0, label: 'Rough install', tone: 'red', note: 'This one usually costs an afternoon. Read the failure points first.' },
];

function bandFor(score) {
  return BANDS.find((band) => score >= band.min) || BANDS[BANDS.length - 1];
}

/**
 * Weighted 0-100 score. `weights` are fixed and disclosed in the payload so a
 * user (or a future tuning pass) can see exactly how the number was earned.
 */
export function computeHealth({ repo, metadata, files, failureScan, ci }) {
  const readmeDays = ageInDays(metadata?.pushed_at);
  const documentation = documentationScore(files, metadata);
  const reproducibility = reproducibilityScore(files, metadata);
  const freshness = freshnessFrom(readmeDays);
  const failurePressure = failurePressureScore(failureScan);
  const mainBranch = mainBranchScore(ci, readmeDays);

  const weights = { documentation: 0.26, reproducibility: 0.22, freshness: 0.16, failurePressure: 0.2, mainBranch: 0.16 };
  const raw =
    documentation.score * weights.documentation +
    reproducibility.score * weights.reproducibility +
    freshness.score * weights.freshness +
    failurePressure.score * weights.failurePressure +
    mainBranch.score * weights.mainBranch;

  const caps = [];
  let score = clamp(raw);
  if (metadata?.archived) { score = Math.min(score, 42); caps.push('This repository is archived — nothing here will be fixed for you.'); }
  if (documentation.score <= 20) { score = Math.min(score, 58); caps.push('No usable install documentation, so the score is capped.'); }
  if (ci?.state === 'failing') { score = Math.min(score, 64); caps.push(`Default branch checks are failing on ${ci.branch}.`); }

  const band = bandFor(score);
  return {
    score,
    band: { id: band.id, label: band.label, tone: band.tone, note: band.note },
    computedAt: new Date().toISOString(),
    method: 'evidence-only',
    weights,
    caps,
    factors: [
      { id: 'documentation', label: 'Documentation quality', score: documentation.score, weight: weights.documentation, detail: documentation.detail, signals: documentation.signals },
      { id: 'reproducibility', label: 'Reproducible setup', score: reproducibility.score, weight: weights.reproducibility, detail: reproducibility.detail, signals: reproducibility.signals },
      { id: 'freshness', label: 'Instruction freshness', score: freshness.score, weight: weights.freshness, detail: freshness.detail, signals: [] },
      { id: 'failurePressure', label: 'Reported install failures', score: failurePressure.score, weight: weights.failurePressure, detail: failurePressure.detail, signals: failurePressure.signals },
      { id: 'mainBranch', label: 'Main branch status', score: mainBranch.score, weight: weights.mainBranch, detail: mainBranch.detail, signals: mainBranch.signals },
    ],
    evidence: {
      repository: repo?.canonicalUrl || '',
      branch: metadata?.default_branch || 'main',
      pushedAt: metadata?.pushed_at || null,
      ageDays: readmeDays === null ? null : Math.round(readmeDays),
      openIssues: round2(metadata?.open_issues_count || 0),
      stars: metadata?.stargazers_count || 0,
      ci: ci ? { state: ci.state, branch: ci.branch, failing: ci.failing || 0, total: ci.total || 0 } : null,
      threadsSampled: (failureScan?.sampled?.issues || 0) + (failureScan?.sampled?.pulls || 0) + (failureScan?.sampled?.discussions || 0),
    },
  };
}

/** Plain sentence used in the summary + install script header. */
export function healthVerdict(health) {
  if (!health) return '';
  const weakest = [...health.factors].sort((a, b) => a.score - b.score)[0];
  return `Install health ${health.score}/100 (${health.band.label}). Weakest factor: ${weakest.label.toLowerCase()} — ${weakest.detail}`;
}
