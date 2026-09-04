# Git-Up

Git-Up turns a public GitHub repository URL into a **living install path** — not a README summary, but a session that reacts when something breaks.

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## What is included

### The six v2 capabilities

- **Living install path.** The checklist is a session, not a one-shot list. Ticks persist across reloads, and “This failed” on any step sends the pasted terminal output plus your remaining steps to a recovery pass that rebuilds the path from the fault forward — completed steps are never rewritten, reused step ids keep their checkmarks, and every correction is recorded in a revision trail you can roll back.
- **Failure-first analysis.** Before the steps, Git-Up reads the repository’s own Issues, PRs (and Discussions when a token allows), keeps only the threads that describe setup trouble, clusters them by failure signature, and ranks by frequency. Each ranked signature is then written back into the step it would break, so the happy path arrives pre-patched.
- **Multi-path install graph.** Docker or native, macOS/Linux/Windows, minimal or full workspace, development or production — derived from what the tree actually contains and drawn as a clickable SVG graph. Choosing a branch re-composes the visible steps instantly with no re-scan.
- **Install contract.** A short, content-hashed statement of the exact versions expected, what gets installed and where, which permissions are needed, and what “working” looks like — with a verification command and a tick-list to confirm after the fact. Anything the scan could not read is listed under “what this contract could not determine” rather than quietly omitted.
- **Zero-context clone mode.** “I know nothing”, “used similar tools”, or “expert, fast path” — reshapes explanation depth, warning volume, and whether the whole path collapses into one copy-paste block. Switching levels is instant and lossless both directions.
- **Repo health score.** 0-100 from documentation quality, reproducibility aids, instruction freshness, reported install failures, and the default branch’s CI state. Computed from evidence, never from the model, with each weight disclosed and hard caps for archived repos, missing docs, or a red main branch.

### Carried over

- HTTPS, SSH, and Git-style GitHub URL normalisation
- Public repository metadata and setup-file scanning through the GitHub API, with a raw-file fallback when the API is rate limited
- Heuristic guide generation when no AI provider is configured — every panel above works without a key
- OpenAI-compatible AI endpoint support with server-side proxying, and model discovery through `GET /models`
- Persistent local history, copyable per-step commands, and a generated install script that follows your chosen path and ends on the contract check

## AI configuration

Open **AI provider** from the top-right settings button. Enter:

- Base URL, for example `https://api.openai.com/v1`
- Chat endpoint, usually `/chat/completions`
- API key
- A model returned by **Fetch models**

The key is kept in `sessionStorage` and is only sent to the Git-Up backend for the current request. The server does not persist it. The model request expects an OpenAI-compatible response with `data: [{ id }]`; the chat request expects `choices[0].message.content` containing the JSON guide schema.

For a private GitHub repository or higher GitHub API limits, start the server with a token:

```bash
GITHUB_TOKEN=ghp_your_token npm start
```

## Layout

```
server.js                  http server, GitHub access, guide assembly
server/failures.js         Feature 2 — thread scan, signatures, ranking
server/health.js           Feature 6 — evidence-based health score
server/pathgraph.js        Feature 3 — decision graph; patching steps from failures
server/contract.js         Feature 4 — install contract
server/recovery.js         Feature 1 — error matching and corrected paths
public/path-engine.js      shared composition + tuning engine (browser and server import it)
public/app.js              the whole client UI
tests/features.test.mjs    offline regression tests for all of the above
```

`public/path-engine.js` is imported by both sides on purpose: the browser and the server compose a path with the same function, so a rendered checklist can never disagree with the generated script.

## API

- `GET /api/health` → `{ ok, service, version, features[], githubToken }`
- `POST /api/models` with `{ baseUrl, apiKey, modelsEndpoint? }`
- `POST /api/analyze` with `{ repoUrl, expertise?: 'novice'|'some'|'expert', config? }` → `{ guide }` including `health`, `failureScan`, `pathGraph`, `defaultPath`, `contract`, `verdict`, `expertise`, `session`, plus the earlier `plainOverview`, `fileTree[]`, and `followUps[]`
- `POST /api/recover` with `{ repoUrl, failedStepId, errorText, completedSteps[], remainingSteps[], expertise?, revision?, guide?, config? }` → `{ recovery }` with `{ source, confidence, diagnosis, matched[], correctedSteps[], checks[], followUps[], revision }`. Falls back to the local rule engine whenever no AI is configured or the provider errors, so the button never dead-ends.
- `POST /api/insight` with `{ repoUrl, mode: 'features' | 'bugs' | 'recommendations' | 'custom', question?, baseMode?, config? }` → `{ insight }`

## Notes and limits

- The browser never executes install commands. **Install** produces a reviewable script for your own terminal.
- GitHub Discussions need a server `GITHUB_TOKEN`: they are GraphQL-only, so without a token the failure scan relies on Issues and PRs and says so in the panel.
- Without a token, unauthenticated GitHub rate limits (60 requests/hour) can shorten the failure scan; it degrades to file-derived inference and labels those items `inferred from files` rather than reporting them as user complaints.
- Scanned file bodies are capped per file, and step `id`s are drawn from a fixed vocabulary (`clone`, `toolchain`, `dependencies`, `env`, `build`, `dev`, `run`, `verify`, …) so recovery passes and graph branches can reference steps reliably.

## Tests

```bash
npm test
```

Runs `node --test tests/features.test.mjs`: path composition, lineage keys, revision splicing, contract determinism, failure clustering, recovery matching, and reader-mode idempotency. No network, no API key.
