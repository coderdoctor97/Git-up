# Forgepath

Forgepath turns a public GitHub repository URL into a focused, checkable installation workflow.

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## What is included

- HTTPS, SSH, and Git-style GitHub URL normalisation
- Public repository metadata and setup-file scanning through the GitHub API
- Lightweight fallback scan through GitHub's public raw files when the API is rate limited
- Heuristic guide generation when no AI provider is configured
- OpenAI-compatible AI endpoint support with server-side proxying
- Model discovery through `GET /models`
- Separate dependencies, requirements, steps, and explanations
- Persistent local history and checklist state for the current analysis
- Copyable per-step commands and a generated install script

## AI configuration

Open **AI provider** from the top-right settings button. Enter:

- Base URL, for example `https://api.openai.com/v1`
- Chat endpoint, usually `/chat/completions`
- API key
- A model returned by **Fetch models**

The key is kept in `sessionStorage` and is only sent to the Forgepath backend for the current request. The server does not persist it. The model request expects an OpenAI-compatible response with `data: [{ id }]`; the chat request expects `choices[0].message.content` containing the JSON guide schema.

For a private GitHub repository or higher GitHub API limits, start the server with a token:

```bash
GITHUB_TOKEN=ghp_your_token npm start
```

## API

- `GET /api/health`
- `POST /api/models` with `{ baseUrl, apiKey, modelsEndpoint? }`
- `POST /api/analyze` with `{ repoUrl, config? }` → `{ guide }` including `plainOverview { analogy, problem, audience, howItWorks[] }`, `fileTree[]`, and `followUps[]`
- `POST /api/insight` with `{ repoUrl, mode: 'features' | 'bugs' | 'recommendations' | 'custom', question?, baseMode?, config? }` → `{ insight: { mode, title, intro, bullets[], outro, followUps[], source } }`

The browser never executes install commands. The **Install** action creates a reviewable script for the user's own terminal.
