# Contributing to Git-Up

Thanks for helping make repository setup less painful. Git-Up is intentionally small: a Node HTTP server, vanilla browser modules, local assets, and offline tests.

## Before you start

1. Use Node.js 20 or newer. Node 22 is the preferred local version in `.nvmrc`.
2. Install from a clean checkout:

   ```bash
   npm ci
   ```

3. Run the checks once before editing:

   ```bash
   npm test
   npm run smoke
   ```

## Development loop

```bash
npm start
```

Open `http://localhost:3000`. The app can analyze public GitHub repositories without any AI provider. Set `GITHUB_TOKEN` only when you need higher GitHub API limits or Discussions scanning.

## Project conventions

- Keep the runtime dependency-free unless a dependency is clearly worth the long-term maintenance cost.
- Keep command generation and path composition in `public/path-engine.js` so the browser, server, and generated install script agree.
- Preserve the distinction between **reported** failures from GitHub threads and **inferred** findings from repository files.
- Keep AI optional. A failing provider must fall back to deterministic local analysis or recovery.
- Do not add remote README/app visuals unless their source, creator, license, and attribution are verified in `docs/ASSETS.md`.
- Do not commit secrets, real tokens, private logs, or screenshots containing user data.

## Tests to run

| Change | Minimum checks |
| --- | --- |
| Server route, static asset route, startup behavior | `npm run smoke` plus relevant manual curl check |
| Path composition, health, contract, failure scan, recovery | `npm test` |
| Browser rendering, session state, Oreo chat UI | `npm test` |
| Documentation-only change | Link/path check and `npm test` if commands or API examples changed |

`npm run check` runs `npm test` and `npm run smoke` together.

## Pull request checklist

Before opening a pull request, include:

- What changed and why.
- The commands you ran and their actual result.
- Screenshots or notes for UI changes when a browser check is possible.
- Any new environment variables, permissions, network calls, or asset licenses.
- Known limitations or follow-up work.

## Reporting bugs

Please include:

- The repository URL you analyzed.
- Your Node version (`node --version`).
- Whether `GITHUB_TOKEN` or an AI provider was configured. Do not paste token values.
- The step that failed and the smallest redacted terminal output that reproduces the issue.
- Browser and operating system if the issue is UI-related.
