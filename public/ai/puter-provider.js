// Puter provider - browser-side AI via Puter.js
import { ensurePuter, getPuter, isPuterSdkLoaded } from './puter-loader.js';

export const PUTER_DEFAULT_MODEL = 'gpt-4o-mini';
export const PUTER_FALLBACK_MODEL = 'claude-3-5-sonnet';

function parseJsonSafe(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function extractText(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (response.message && typeof response.message.content === 'string') return response.message.content;
  if (response.message && Array.isArray(response.message.content)) {
    return response.message.content.map(c => c.text || '').join('\n');
  }
  if (response.content) {
    if (typeof response.content === 'string') return response.content;
    if (Array.isArray(response.content)) return response.content.map(c => c.text || '').join('\n');
  }
  if (response.text) return response.text;
  return String(response);
}

export async function isPuterSignedIn() {
  try {
    const puter = await ensurePuter();
    if (!puter) return false;
    if (typeof puter.auth?.isSignedIn === 'function') {
      return !!puter.auth.isSignedIn();
    }
    if (typeof puter.auth?.getUser === 'function') {
      try {
        const user = await puter.auth.getUser();
        return !!user;
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function signIn() {
  const puter = await ensurePuter();
  if (!puter) throw new Error('Puter SDK not available');
  if (!puter.auth?.signIn) throw new Error('Puter auth not available');
  const result = await puter.auth.signIn();
  return result;
}

export async function signOut() {
  const puter = getPuter() || await ensurePuter().catch(() => null);
  if (!puter) return;
  try {
    if (puter.auth?.signOut) await puter.auth.signOut();
  } catch {}
}

export async function getUser() {
  const puter = await ensurePuter();
  if (!puter?.auth?.getUser) return null;
  try {
    return await puter.auth.getUser();
  } catch {
    return null;
  }
}

export async function chat(request = {}) {
  const puter = await ensurePuter();
  if (!puter?.ai?.chat) throw new Error('Puter AI not available');

  const model = request.model || PUTER_DEFAULT_MODEL;
  const options = {};
  if (model) options.model = model;
  if (request.temperature !== undefined) options.temperature = request.temperature;
  if (request.maxTokens !== undefined) options.max_tokens = request.maxTokens;

  let prompt;
  if (request.messages && Array.isArray(request.messages) && request.messages.length) {
    prompt = request.messages;
  } else if (request.prompt) {
    prompt = request.prompt;
  } else if (request.systemPrompt && request.messages) {
    prompt = [{ role: 'system', content: request.systemPrompt }, ...request.messages];
  } else if (request.systemPrompt) {
    prompt = request.systemPrompt;
  } else {
    throw new Error('No prompt or messages provided');
  }

  try {
    const response = await puter.ai.chat(prompt, options);
    return extractText(response);
  } catch (e) {
    try {
      const response = await puter.ai.chat(prompt, false, options);
      return extractText(response);
    } catch (e2) {
      throw e;
    }
  }
}

export async function generate(request) {
  return await chat(request);
}

export async function testConnection() {
  const result = await chat({
    prompt: 'Reply with exactly: Git-Up connection successful.',
    model: PUTER_DEFAULT_MODEL,
    temperature: 0,
    maxTokens: 20,
  });
  const trimmed = result.trim();
  if (trimmed.includes('Git-Up connection successful') || trimmed.length) {
    return { ok: true, text: trimmed, message: trimmed.includes('Git-Up connection successful') ? 'Git-Up connection successful.' : trimmed.slice(0, 80) };
  }
  throw new Error('Empty response from Free AI');
}

export async function generateGuide(context, expertise = 'some') {
  const repo = context.repo || {};
  const metadata = context.metadata || {};
  const files = context.files || [];

  const fileList = files.slice(0, 24).map(f => {
    const path = f.path || f;
    const content = f.content ? `\n${String(f.content).slice(0, 4000)}` : '';
    return `--- ${path}${content}`;
  }).join('\n');

  const prompt = `You are Git-Up, a meticulous senior developer advocate who can also explain anything to a 12-year-old. Analyze this public GitHub repository and return only valid JSON. Do not invent commands or requirements. Use the repository files as your source of truth. If uncertain, say so in notes.

JSON schema:
{"summary":"string","confidence":"high|medium|low","dependencies":[{"name":"string","version":"string|null","kind":"runtime|dev|tooling|service"}],"requirements":["string"],"environment":["ENV_KEY"],"steps":[{"id":"stable-id","title":"action title","command":"shell commands or empty string","detail":"what to do"}],"explanations":[{"stepId":"matching step id","title":"short title","body":"why this matters"}],"notes":["caveat"],"anticipatedFailures":[{"signature":"short label of the failure","stepId":"which step id it breaks","symptom":"error text people actually paste","fix":"the command or action that avoids it"}],"plainOverview":{"analogy":"one vivid real-world analogy sentence","problem":"what everyday problem this solves, zero jargon","audience":"who benefits, in everyday roles","howItWorks":["step 1 in plain words","step 2","step 3"]},"followUps":["contextual follow-up question 1","question 2","question 3"]}

Install-path rules (never break these):
- steps[].id must be chosen from this vocabulary when the action matches it: clone, toolchain, services, docker, dependencies, database, env, build, dev, run, verify. Reuse the same id for the same action across revisions so progress is not lost.
- steps[].order is an integer 0-90 placing the step in the sequence; steps with the same action must keep the same order slot.
- anticipatedFailures: the 2-4 ways installers most often break for THIS repository, each pointing at the step id it breaks. Base them on the README, lockfiles, and Dockerfile — not on generic advice. Return an empty array if nothing specific is known.

STRICT plainOverview rules (never break these):
- ZERO technical jargon. Never use: API, endpoints, serialization, dependencies, CI/CD, manifest, lockfile, toolchain, middleware, SDK, CLI, interface, schema, runtime, framework, repository (say "project" instead).
- Write at a 12-year-old reading level. Use real-world analogies (kitchen, recipe box, library, workshop, garden, lunchbox, toolbox).
- Cover exactly: what everyday problem it solves, who benefits (parents, teachers, shop owners, students…), how it works from a visitor's point of view in 3 short steps.
- followUps: 2–3 short clickable questions specific to THIS project (e.g. ideas to build next, what to be careful about). Never generic filler.

Repository: ${repo.canonicalUrl || ''}
Metadata: ${JSON.stringify({ name: metadata.name, description: metadata.description, language: metadata.language, default_branch: metadata.default_branch, topics: metadata.topics })}
Expertise: ${expertise}

Files:
${fileList}`;

  const text = await chat({
    prompt,
    model: PUTER_DEFAULT_MODEL,
    temperature: 0.1,
  });

  const parsed = parseJsonSafe(text);
  if (!parsed) throw new Error('Free AI did not return valid JSON');
  return parsed;
}

// Overloaded: generateInsight can be called as (question, session, meta) from app.js
// or as (context, mode, question, baseMode, session) from ai-service.js
export async function generateInsight(...args) {
  let context = {};
  let mode = 'recommendations';
  let question = '';
  let baseMode = 'recommendations';
  let session = null;

  if (typeof args[0] === 'string') {
    // Signature: (question, session, meta)
    question = args[0] || '';
    session = args[1] || null;
    const meta = args[2] || {};
    context = { repo: { canonicalUrl: meta.repoUrl || '' }, metadata: {}, files: [] };
    if (meta.guide) {
      context.metadata = { name: meta.guide?.repository?.name || '', description: meta.guide?.summary || '' };
      context.files = (meta.guide?.files || []).slice(0, 20).map(p => ({ path: p }));
    }
    mode = 'recommendations';
    baseMode = 'recommendations';
  } else {
    // Signature: (context, mode, question, baseMode, session)
    context = args[0] || {};
    mode = args[1] || 'recommendations';
    question = args[2] || '';
    baseMode = args[3] || mode;
    session = args[4] || null;
  }

  const repo = context.repo || {};
  const metadata = context.metadata || {};
  const files = context.files || [];

  const modeDescriptions = {
    features: 'Suggest 3–5 practical new directions for a fresh copy of this project.',
    bugs: 'Audit this project for edge cases, weak spots, and places likely to break.',
    recommendations: 'Recommend plain-language improvements to ease of use, guidance, and untapped potential.',
  };

  const metaTitle = {
    features: 'Feature extensions',
    bugs: 'Potential trouble spots',
    recommendations: 'Proactive recommendations',
  }[mode] || 'Proactive recommendations';

  const effectiveMode = modeDescriptions[baseMode] ? baseMode : mode;
  const task = question || modeDescriptions[effectiveMode] || modeDescriptions.recommendations;

  const fileList = files.slice(0, 20).map(f => {
    const path = f.path || f;
    const content = f.content ? `\n${String(f.content).slice(0, 3000)}` : '';
    return `--- ${path}${content}`;
  }).join('\n');

  const sessionInfo = session ? `\nSession: ${JSON.stringify(session).slice(0, 2000)}` : '';

  const prompt = `You are Git-Up, a kind senior product engineer. Analyse this public GitHub repository and return ONLY valid JSON.

JSON schema:
{"title":"string","intro":"2-sentence plain-language intro","bullets":["4-6 specific bullets, each 1-3 sentences"],"outro":"one-sentence suggested first step","followUps":["follow-up question 1","follow-up question 2","follow-up question 3"]}

Rules:
- Reference actual files/steps from the context (e.g. package.json scripts, missing tests, env handling).
- Task (${effectiveMode}): ${task}
- Plain, warm tone. Avoid heavy jargon where possible.
- followUps must be 2–3 short, clickable, contextual questions that continue THIS topic, not generic filler.

Repository: ${repo.canonicalUrl || ''}
Metadata: ${JSON.stringify({ name: metadata.name, description: metadata.description, language: metadata.language, default_branch: metadata.default_branch, topics: metadata.topics })}
${sessionInfo}

Files:
${fileList}`;

  const text = await chat({
    prompt,
    model: PUTER_DEFAULT_MODEL,
    temperature: 0.35,
  });

  const parsed = parseJsonSafe(text);
  if (!parsed || !Array.isArray(parsed.bullets)) throw new Error('Free AI insight was not valid JSON');

  return {
    mode,
    title: String(parsed.title || metaTitle).slice(0, 120),
    intro: String(parsed.intro || '').slice(0, 1200),
    bullets: parsed.bullets.map(b => String(b)).filter(Boolean).slice(0, 7),
    outro: String(parsed.outro || '').slice(0, 600),
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map(q => String(q)).filter(Boolean).slice(0, 3) : [],
    source: 'puter',
  };
}

export async function generateRecovery(context) {
  // Support both shapes: {failedStepId, errorText, ...} and {failedStep, errorText, ...}
  const repo = context.repo || {};
  const metadata = context.metadata || {};
  const files = context.files || [];
  const failedStep = context.failedStep || { id: context.failedStepId || '', title: context.failedStepId || 'failed step' };
  const errorText = context.errorText || '';
  const remainingSteps = context.remainingSteps || [];
  const completedSteps = context.completedSteps || [];
  const requirements = context.requirements || context.guide?.requirements || [];

  const fileList = files.slice(0, 20).map(f => {
    const path = f.path || f;
    const content = f.content ? `\n${String(f.content).slice(0, 3000)}` : '';
    return `--- ${path}${content}`;
  }).join('\n');

  const prompt = `You are Git-Up recovery. A step failed during installation. Diagnose and return ONLY valid JSON.

JSON schema:
{"diagnosis":"1-2 sentence diagnosis of what went wrong","confidence":"high|medium|low","correctedSteps":[{"id":"same-id-as-failed-or-new","title":"action title","command":"fixed shell commands","detail":"what to do now","order":number}],"checks":["shell command to verify fix"],"followUps":["what to try next"],"matched":[{"id":"signature-id","label":"matched failure pattern","hit":"error substring"}],"secondSuspect":"alternative explanation if first fix fails","note":"extra context"}

Rules:
- Keep completed steps untouched - only rewrite from failed step forward.
- correctedSteps should replace remaining steps from failed step onward.
- Reuse same id for same action so progress is preserved.
- Be specific to THIS repository and error.
- If uncertain, confidence low.

Repository: ${repo.canonicalUrl || context.repoUrl || ''}
Metadata: ${JSON.stringify({ name: metadata.name, description: metadata.description })}
Failed step: ${JSON.stringify({ id: failedStep.id, title: failedStep.title, command: failedStep.command })}
Error text: ${errorText.slice(0, 4000)}
Requirements: ${requirements.join(', ')}
Completed steps: ${completedSteps.map(s => s.title).join(' | ').slice(0, 500)}
Remaining steps: ${remainingSteps.map(s => s.title).join(' | ').slice(0, 500)}

Files:
${fileList}`;

  const text = await chat({
    prompt,
    model: PUTER_DEFAULT_MODEL,
    temperature: 0.2,
  });

  const parsed = parseJsonSafe(text);
  if (!parsed) throw new Error('Free AI recovery was not valid JSON');

  return {
    source: 'puter',
    diagnosis: parsed.diagnosis || 'Path rebuilt from your error.',
    confidence: parsed.confidence || 'medium',
    correctedSteps: Array.isArray(parsed.correctedSteps) ? parsed.correctedSteps : [],
    checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
    matched: Array.isArray(parsed.matched) ? parsed.matched : [],
    secondSuspect: parsed.secondSuspect || '',
    note: parsed.note || '',
    revision: context.revision || 2,
  };
}
