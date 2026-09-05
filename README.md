<p align="center">
  <img src="assets/logo/icon_Dark_mode.png" alt="Git-Up cat robot logo with an upward mint route arrow" width="128" />
</p>

# Git-Up

[![CI](https://github.com/coderdoctor97/Git-up/actions/workflows/ci.yml/badge.svg)](https://github.com/coderdoctor97/Git-up/actions/workflows/ci.yml)

Git-Up turns a public GitHub repository URL into a **living install path**: an evidence-backed checklist that adapts when a setup step fails.

It is for developers, maintainers, reviewers, students, and curious users who need to try an unfamiliar GitHub project without guessing which README command still works.

> **Status:** active early project, app version `2.0.0`. Node.js 20+ is supported by project metadata; CI runs on Node 20 and 22. The root project does **not** currently declare an open-source license, so do not assume redistribution rights until the maintainer adds one.

## Contents

- [Visual proof](#visual-proof)
- [Why Git-Up](#why-git-up)
- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Testing and development](#testing-and-development)
- [Deployment](#deployment)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Known limitations](#known-limitations)
- [License and acknowledgements](#license-and-acknowledgements)

## Visual proof

<video src="assets/video_demo/git-up-demo.mp4" controls width="100%"></video>

Text-only path: enter a public GitHub URL → Git-Up reads public repository evidence → the server builds a guide, health score, failure scan, path graph, and install contract → the browser renders a checklist → if a command fails, paste the redacted error and Git-Up rebuilds the remaining path.

## Why Git-Up

Most setup instructions are static. Git-Up treats installation as a session:

1. It scans the repository before giving advice.
2. It shows which failures have been reported or inferred.
3. It keeps your checked steps and chosen path branch.
4. It lets you report “this failed” and replaces only the steps that still matter.
5. It discloses what it could and could not determine before you run commands.

Git-Up **does not** run install commands for you, deploy repositories, manage secrets, or guarantee that a third-party project is safe. It produces a reviewable path for your own terminal.

## Features

### Install planning

- **Living install path:** checkbox progress persists in browser storage, and recovery revisions keep completed steps intact.
- **Zero-context clone modes:** choose novice, standard, or expert depth without re-scanning the repository.
- **Copyable command script:** export the current path branch as a shell script ending with the install-contract verification command.

### Repository evidence

- **GitHub URL normalization:** accepts HTTPS, SSH, and Git-style GitHub repository URLs.
- **Setup-file scan:** reads public README, package manifests, lockfiles, Docker/compose files, env templates, and other setup-related files when available.
- **Failure-first analysis:** samples GitHub issues, pull requests, and token-enabled discussions; reported failures stay labelled separately from file-based inference.
- **Repository health score:** computes a 0-100 install-health score from documentation, reproducibility aids, freshness, failure pressure, and default-branch CI signals.

### Path safety

- **Multi-path install graph:** derives choices such as operating system, Docker/native path, minimal/full workspace, and development/production target from repository evidence.
- **Install contract:** records expected versions, install side effects, required permissions, verification command, guarantees, and unknowns under a content-derived ID.
- **Deterministic recovery fallback:** works without an AI key by matching pasted terminal output against local recovery rules.

### Optional AI assistance

- Supports OpenAI-compatible chat APIs for deeper guide/recovery prose and model discovery through `/api/models`.
- AI is optional; local scan and recovery paths are designed to keep working when no provider is configured or the provider fails.

## Requirements

| Requirement | Version / notes | Verified in this audit |
| --- | --- | --- |
| Node.js | `>=20` (`.nvmrc` recommends Node 22) | Ran on Node `v22.22.3`; CI is configured for Node 20 and 22. |
| npm | npm with lockfile v3 support | Ran with npm `10.9.8`. |
| Browser | Modern browser with JavaScript enabled | UI is a vanilla ES-module app served by `server.js`. |
| Network | Required for analyzing GitHub repositories and optional AI calls | Local tests and smoke checks do not require external network. |
| GitHub token | Optional `GITHUB_TOKEN` server env var | Raises REST rate limits and enables Discussions scanning. Use least privilege. |
| AI provider | Optional OpenAI-compatible endpoint and API key | Configured in the UI; not needed for the default local path. |

There are no npm runtime dependencies and no build step.

## Quick start

From a clean checkout:

```bash
git clone https://github.com/coderdoctor97/Git-up.git
cd Git-up
node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('Node.js 20+ required'); process.exit(1); } console.log(process.version)"
npm ci
npm start
```

Expected server output:

```text
Git-Up listening on http://localhost:3000
Bound to 0.0.0.0:3000 for local and preview traffic.
```

Open <http://localhost:3000>, paste a public GitHub repository URL, choose your experience level, and select **Analyze repository**.

To verify the server without opening a browser:

```bash
npm run smoke
```

Expected success signal:

```text
Smoke check passed on http://127.0.0.1:<port>
```

## Usage

### 1. Analyze a repository

Use a public GitHub URL, for example:

```text
https://github.com/owner/repo
```

Git-Up reads public metadata and setup files, then returns a guide. If no AI provider is configured, the guide is built by local heuristics.

### 2. Choose the route that matches your machine

When Git-Up finds meaningful variants, it renders a path graph. Typical choices include:

- macOS, Linux, or Windows syntax;
- native install versus Docker when container files exist;
- minimal run path versus full contributor workspace;
- development versus production target when scripts support both.

Changing a graph option recomposes the visible checklist in the browser. It does not re-scan the repository.

### 3. Review the install contract

Before running commands, read the install contract. It states:

- expected runtime and package-manager versions when declared;
- what packages/images/files will be created and where;
- permissions and network access Git-Up expects;
- the final verification command;
- what the scan could not determine.

### 4. Run commands yourself

Copy one command at a time, or use **Copy whole path** in expert mode. Git-Up never executes commands from analyzed repositories.

### 5. Recover from a failed step

If a step fails:

1. Select **This failed** on that step.
2. Paste the smallest useful terminal output after redacting secrets.
3. Git-Up matches known failures locally and, if configured, asks the AI provider for a repository-aware recovery.
4. Completed steps stay untouched; only the failed step and following steps are revised.

## Configuration

`server.js` loads `.env` automatically and does not override variables already exported in your shell. Start from the safe template:

```bash
cp .env.example .env
```

| Variable / setting | Required | Where set | Safe example | Purpose and secret handling |
| --- | --- | --- | --- | --- |
| `PORT` | No | Environment or `.env` | `3000` | HTTP port. Defaults to `3000`. |
| `GITHUB_TOKEN` | No | Environment or `.env` | empty | Raises GitHub rate limits and enables Discussions scanning. Treat as a secret; do not commit it. Public-repo metadata needs no scopes, but use the least-privileged token available. |
| `E2B_SANDBOX_ID` | No | Environment or `.env` | empty | Only changes the preview URL printed when running inside an E2B/Arena sandbox. |
| AI base URL | No | Browser settings | `https://api.openai.com/v1` | Stored in `sessionStorage`; sent to the local server only for the current provider request. |
| AI chat endpoint | No | Browser settings | `/chat/completions` | OpenAI-compatible chat endpoint. |
| AI models endpoint | No | Browser settings | `/models` | Used by **Fetch models**. |
| AI API key | No | Browser settings | do not paste into docs | Stored in `sessionStorage`; proxied to the configured provider by the local server; not persisted by `server.js`. |
| AI model | No | Browser settings | provider-specific | Must be a model returned by the provider or accepted by its chat endpoint. |

## Architecture

Git-Up is a dependency-light Node server plus a vanilla browser app:

```text
server.js
  ├─ GitHub metadata/tree/raw-file/thread reads
  ├─ local guide, failure, health, graph, contract, and recovery engines
  ├─ optional AI provider proxying
  └─ static file serving for public/ and root assets/

public/app.js
  ├─ single-page UI rendered from templates
  ├─ localStorage install history and progress
  ├─ sessionStorage AI provider settings
  └─ shared path composition from public/path-engine.js
```

Important modules:

| File | Role |
| --- | --- |
| `server/failures.js` | Failure signatures, GitHub thread scoring, and file-based inference. |
| `server/health.js` | Evidence-only install-health score. |
| `server/pathgraph.js` | Repository-derived route options and failure guard insertion. |
| `server/contract.js` | Install contract and deterministic contract ID. |
| `server/recovery.js` | Local and optional AI recovery from pasted terminal output. |
| `public/path-engine.js` | Shared ordering, stable step keys, progress, path composition, and revision helpers. |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full data-flow and maintainer checklist.

## API reference

All endpoints are served by `server.js`. POST bodies and responses are JSON unless noted.

### `GET /api/health`

Returns service health and feature flags.

```json
{
  "ok": true,
  "service": "git-up",
  "version": "2.0.0",
  "features": ["living-install-path"],
  "githubToken": false
}
```

### `POST /api/analyze`

Builds a complete guide in one JSON response.

Request:

```json
{
  "repoUrl": "https://github.com/owner/repo",
  "expertise": "some",
  "config": {
    "baseUrl": "https://api.example.test/v1",
    "endpoint": "/chat/completions",
    "apiKey": "redacted",
    "model": "example-model"
  }
}
```

`config` is optional. `expertise` may be `novice`, `some`, or `expert`.

Response shape:

```json
{
  "ok": true,
  "guide": {
    "repository": {},
    "defaultPath": [],
    "health": {},
    "failureScan": {},
    "pathGraph": {},
    "contract": {},
    "session": {}
  }
}
```

### `POST /api/analyze-stream`

Same analysis as `/api/analyze`, streamed as Server-Sent Events. Progress events look like:

```text
data: {"phase":"files","label":"Scanning setup files…","percent":25}
```

The final event has `phase: "result"` and includes `guide`.

### `POST /api/recover`

Rebuilds the failed step and remaining path from pasted terminal output.

Request fields:

| Field | Required | Notes |
| --- | --- | --- |
| `repoUrl` | Yes | Public GitHub repository URL. |
| `failedStepId` | Yes | Step ID/key from the current guide. |
| `errorText` | Yes | Redacted terminal output, capped server-side. |
| `completedSteps` | No | Completed steps are preserved and not rewritten. |
| `remainingSteps` | No | The failed step and steps after it. |
| `expertise` | No | `novice`, `some`, or `expert`. |
| `guide` | No | Current guide context. |
| `config` | No | Optional AI provider config. |

Response includes `recovery.correctedSteps`, `diagnosis`, `checks`, `matched`, and `revision`.

### `POST /api/models`

Fetches model names from an OpenAI-compatible provider.

```json
{
  "baseUrl": "https://api.example.test/v1",
  "apiKey": "redacted",
  "modelsEndpoint": "/models"
}
```

### `POST /api/insight`

Asks for repo-specific insight using local heuristics or the optional AI provider.

`mode` may be `features`, `bugs`, `recommendations`, or `custom`.

## Testing and development

Install exactly from the lockfile:

```bash
npm ci
```

Run the offline regression suite:

```bash
npm test
```

Current coverage includes path composition, stable step keys, revision splicing, install-contract determinism, failure clustering, recovery matching, reader-mode shaping, full-view render checks, persisted sessions, and Oreo UI markup.

Run the local smoke check:

```bash
npm run smoke
```

Run all configured checks:

```bash
npm run check
```

Start the app for manual testing:

```bash
PORT=3000 npm start
```

There is currently no `lint`, `typecheck`, or `build` script. The app runs directly as ESM JavaScript.

## Deployment

The supported deployment shape is a long-running Node.js process:

```bash
npm ci
PORT=3000 GITHUB_TOKEN= npm start
```

Operational notes:

- Bind host is fixed to `0.0.0.0` in `server.js` for local and preview traffic.
- Set `PORT` to the value assigned by your host.
- Provide `GITHUB_TOKEN` through the host's secret manager only if you need higher rate limits or Discussions scanning.
- The app is **not** static-only; `/api/*` routes require `server.js`.
- The repository does not currently ship a Dockerfile, process manager config, or deployment-specific config.

## Security and privacy

- Git-Up never runs commands from analyzed repositories.
- Git-Up is intended for public GitHub repositories. Private repository scanning is not a documented/supported path.
- Server-side GitHub reads include public metadata, setup file contents, issues, pull requests, and optional token-enabled discussions.
- If an AI provider is configured, scanned public file excerpts and the user's recovery/error text may be sent to that provider. Do not paste secrets into recovery text.
- AI API keys are stored in browser `sessionStorage` and sent to the local server only for the current request. The server does not persist them.
- Analysis history, path selections, checkmarks, and revision history are stored in browser `localStorage`.
- `GITHUB_TOKEN` belongs only in server environment variables or `.env`, never in the browser or committed files.

See [SECURITY.md](SECURITY.md) for the reporting policy and maintainer checklist.

## Troubleshooting

| Symptom | Verified or likely fix |
| --- | --- |
| `npm ci` refuses to run because Node is too old | Use Node 20 or newer: `nvm install 22 && nvm use 22`. |
| `npm start` reports `EADDRINUSE` | Another process is using port 3000. Try `PORT=3001 npm start`. |
| Browser opens but analysis fails with a GitHub rate-limit message | Start the server with a least-privileged `GITHUB_TOKEN`. |
| Analysis fails with a TLS/certificate message | Node could not verify the GitHub certificate, often because of a proxy or missing CA bundle. Fix the system CA/proxy settings, then restart `npm start`. |
| AI model fetch returns 401/404 | Check the base URL, model endpoint, API key, and whether the provider uses OpenAI-compatible response shapes. |
| `.env` changes do not appear | Restart the server. Exported shell variables override `.env` values. |
| Generated commands use `cp` or POSIX shell syntax on Windows | Choose the Windows branch in the path graph when available, or run commands in Git Bash/WSL. |
| `npm run build` or `npm run lint` is missing | That is expected for this repo today; use `npm test`, `npm run smoke`, and `npm start`. |

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```bash
npm ci
npm test
npm run smoke
```

For pull requests, include the commands you ran, screenshots or notes for UI changes, and any new environment variables, permissions, network calls, or assets.

Issue forms are available for bugs and documentation problems. Redact tokens, private hostnames, and personal data before posting logs.

## Known limitations

- Only `github.com` repository URLs are accepted.
- The strongest path comes from public repository evidence; private repos, generated setup files, and undocumented manual services may be missed.
- GitHub Discussions scanning requires `GITHUB_TOKEN` because Discussions use GitHub GraphQL.
- The health score is a heuristic score from observable evidence, not a guarantee that installation is safe or fast.
- No root open-source license is declared yet.
- No browser automation test is configured; current UI tests render templates against a minimal DOM stub.

Recommended next steps:

1. Choose and add a root `LICENSE` if the maintainer wants open-source redistribution.
2. Add browser automation for one happy-path analysis and one recovery flow.
3. Decide whether the large `skills/` reference directories should remain in this repository or move to separate documented sources.
4. Add release tags/notes once the project has a stable distribution cadence.

## License and acknowledgements

The root repository currently has no `LICENSE` file and `package.json` is marked `UNLICENSED`. That means use, redistribution, and contribution terms are not yet defined. Maintainers should choose a license before inviting broad external reuse.

Third-party and local asset details are recorded in [docs/ASSETS.md](docs/ASSETS.md). Key acknowledgements:

- Excalifont by Excalidraw, licensed under OFL-1.1, is used only in Oreo messenger text.
- particles.js by Vincent Garreau, licensed under MIT, is vendored locally for the background particle field.
- The Oreo mascot SVG and workflow diagram added in this pass are original local project assets.
