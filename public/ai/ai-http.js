function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responsePayload(response) {
  try { return await response.json(); } catch { return null; }
}

export async function postJson(path, body, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await responsePayload(response);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Request failed with status ${response.status}.`);
  return payload;
}

export async function analyzeWithStream(body, { onProgress = () => {}, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl('/api/analyze-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Stream endpoint returned ${response.status}`);
  if (!response.body?.getReader) throw new Error('Streaming is not available in this browser.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const message = JSON.parse(raw);
        if (message.phase === 'error') throw new Error(message.error || 'Stream reported an error.');
        if (message.phase === 'result') {
          onProgress({ phase: 'done', label: message.label || 'Analysis complete', percent: 100, error: '' });
          return message.guide;
        }
        onProgress({ phase: message.phase, label: message.label || '', percent: Number(message.percent) || 0, error: '' });
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
    }
  }
  throw new Error('Stream ended without a result.');
}

export async function analyzeWithPoll(body, {
  onProgress = () => {},
  aiReady = false,
  fetchImpl = globalThis.fetch,
  phaseDelay = 350,
} = {}) {
  const phases = [
    { phase: 'repository', label: 'Reading repository metadata…', percent: 10 },
    { phase: 'files', label: 'Scanning setup files…', percent: 25 },
    { phase: 'ai', label: aiReady ? 'Reviewing with AI…' : 'Building local guide…', percent: 45 },
    { phase: 'failures', label: 'Checking failure history…', percent: 55 },
    { phase: 'health', label: 'Computing health score…', percent: 65 },
    { phase: 'path', label: 'Composing install path…', percent: 78 },
    { phase: 'contract', label: 'Building install contract…', percent: 90 },
    { phase: 'tuning', label: 'Tuning for your level…', percent: 95 },
  ];
  for (const phase of phases) {
    onProgress(phase);
    if (phaseDelay > 0) await wait(phaseDelay);
  }
  const payload = await postJson('/api/analyze', body, fetchImpl);
  onProgress({ phase: 'done', label: 'Analysis complete', percent: 100, error: '' });
  return payload.guide;
}

/** Keep the existing SSE-first, JSON-fallback behavior shared by both adapters. */
export async function runAnalysis(body, options = {}) {
  try {
    return await analyzeWithStream(body, options);
  } catch {
    return analyzeWithPoll(body, options);
  }
}
