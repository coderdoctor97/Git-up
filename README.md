# Git-Up

Git-Up turns a public GitHub repository URL into a **living install path** — not a README summary, but a session that reacts when something breaks.

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## Technology stack

- **Vanilla HTML / CSS / JavaScript (ES modules)** — no framework, no build step, no dependencies.
- **Node.js (built-in `http` module)** for the server; nothing to install beyond Node 18+.
- The UI is a single-page client (`public/app.js`) that renders from string templates and re-binds events after each render. `public/path-engine.js` is shared by browser and server on purpose, so a rendered checklist can never disagree with the generated script.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Start the server on `PORT` (default 3000). |
| `npm test` | Run the offline `node --test` suite (path engine, features, render, UI system). |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | Server port. Defaults to `3000`. |
| `GITHUB_TOKEN` | no | Raises GitHub API rate limits and enables Discussions scanning for the failure-first analysis. No scopes needed for public repos. |
| `E2B_SANDBOX_ID` | no | Only used to print the correct preview URL when running inside an E2B sandbox. |

See `.env.example`. Never commit real tokens.

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
public/styles.css          the design system (tokens, layout, every component, light theme)
public/magic.css           the Magic layer (tokens, reveal, card glow, marquee, palette)
public/magic.js            spotlight, tickers, scroll reveal (no top-level DOM access)
tests/features.test.mjs    offline regression tests for all of the above
tests/render.test.mjs      whole-view render tests against a DOM stub
tests/session.test.mjs     install-session persistence tests
tests/ui-system.test.mjs   smoke tests for the Magic-layer components
```

`public/path-engine.js` is imported by both sides on purpose: the browser and the server compose a path with the same function, so a rendered checklist can never disagree with the generated script.

## Design system

The visual identity is a **surveyor's route ledger**: dark paper (`--bg #0b1114`), a mint route accent (`--route #7fe0b2`), mono metadata, a ruled route spine with mileage dots, and stamped trust artifacts. A full daylight theme is provided via `[data-theme="light"]` variable overrides.

`styles.css` owns every colour, surface, and component token. `magic.css` is strictly additive: it layers animation and interaction on top without modifying base rules, so the ledger identity stays intact.

Tokens live in two additive `:root` blocks:

- Colour/surface (styles.css): `--bg`, `--panel`, `--route`, `--muted`, `--line`, `--radius-*`, `--dur-*`, `--ease`.
- Rhythm (magic.css): `--space-1…8`, `--type-*`, `--shadow-sm/md`, `--dur-reveal`, `--stagger-step`, `--ease-out`.

Avoid one-off colours and spacing values in new code — use the tokens.

## Animation system (Magic-UI-inspired, dependency-free)

All patterns are hand-built with CSS animations, CSS custom properties, `IntersectionObserver`, and `requestAnimationFrame` — no animation libraries.

| Pattern | Where | How it works |
| --- | --- | --- |
| **Magic Card** | every `.panel` | Cursor-tracked radial spotlight (`--mx`/`--my` via `pointermove`) plus a masked 1px border glow that brightens near the cursor. No layout shift. |
| **Blur Fade / scroll reveal** | panels + lists via `data-reveal` / `data-reveal-stagger` | `bindReveals()` arms the page (`reveal-armed`), reveals on intersection with batch stagger, then seals the view (`reveal-done`) so re-renders never flicker. A 4s failsafe and no-JS default keep content visible. |
| **Animated list** | install steps, failure rows | Staggered entrance through `data-reveal-stagger`; existing hover/active states. |
| **Marquee** | failure-signature strip | Pure CSS infinite loop (two identical groups, `translateX(-50%)`), pauses on hover/focus, edge fade masks, static wrap under reduced motion. Only shown with ≥3 signatures; hidden from assistive tech (the ranked list below is the source of truth). |
| **Number ticker** | health score ring | `requestAnimationFrame` count-up on visibility. |
| **Shimmer button** | `Analyze`, `New analysis` | Periodic sheen sweep, 6.5s idle cadence; reserved for the two true entry points. |
| **Bento grid** | analysis overview strip | CSS Grid `grid-template-areas`: summary anchors two rows; branch/language/files are compact ledger stamps. Stacks cleanly at 800px and 600px. |
| **Command palette** | Ctrl/Cmd+K, topbar search, mobile "Menu" | Keyboard-first navigation and actions with type-to-filter, arrow/Enter selection, `listbox`/`option` semantics, and the shared modal focus trap. Deliberately chosen over a decorative dock. |

Accessibility rules that hold across all of it:

- `prefers-reduced-motion: reduce` disables every animation (reveal, marquee, sheen, spotlight transitions) without hiding content.
- Reveal effects are opt-in per element (`data-reveal`) and never run without JavaScript.
- The marquee is `aria-hidden` with an `sr-only` text alternative; the accessible ranked list stays beneath it.
- The palette is a real dialog (`role="dialog"`, `aria-modal`, `aria-activedescendant`) sharing the existing focus trap.

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

Runs the full offline `node --test` suite: path composition, lineage keys, revision splicing, contract determinism, failure clustering, recovery matching, reader-mode idempotency, whole-view rendering, session persistence, and the Magic-layer UI components (reveal attributes, bento strip, marquee duplication, palette). No network, no API key.

## Deployment

The server is a single ESM Node process with no build step:

```bash
npm ci
GITHUB_TOKEN=... PORT=3000 node server.js
```

Any Node host works (a VM, Fly.io, Railway, Docker). There is no dynamic OG route — the app is served as-is with static Open Graph / Twitter meta tags in `public/index.html`.
