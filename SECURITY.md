# Security policy

Git-Up helps users plan and recover installation steps for public GitHub repositories. It should never become a place where secrets or private source code are accidentally collected.

## Supported versions

This repository currently tracks the application at `2.0.0` and has no formal release series or tags. Security fixes should target the default branch and be verified with:

```bash
npm ci
npm test
npm run smoke
```

## Reporting a vulnerability

Open a private GitHub security advisory if available for this repository, or contact the maintainer through the repository's GitHub issue/discussion channels and ask for a private reporting path. Do not include working exploit details, private repository URLs, real API keys, personal access tokens, or unredacted terminal logs in a public issue.

## Data and trust boundaries

- The browser never runs install commands. It renders commands for the user to review and copy.
- Public GitHub repository metadata, selected setup files, issues, pull requests, and optional discussions are read by the server during analysis.
- `GITHUB_TOKEN` is optional and should be provided only as a server environment variable. It is not sent to the browser.
- AI provider settings are optional. The browser stores them in `sessionStorage`; the server receives them only for the current request and forwards them to the configured OpenAI-compatible endpoint. The server does not persist them.
- Analysis history and checklist progress live in browser `localStorage`.
- Pasted recovery logs may contain secrets. Redact tokens, passwords, private hostnames, and customer data before sharing logs in public issues.

## Maintainer security checklist

- Keep `.env`, `.env.*`, local logs, screenshots with secrets, and generated credentials out of Git.
- Avoid new third-party scripts/CDNs unless they are necessary and reviewed. Prefer local, attributable assets.
- Keep generated shell commands safe by default: no `sudo`, no destructive paths outside the project directory, and no shelling out to remote scripts unless clearly documented.
- Keep provider/network errors actionable and non-fatal; Git-Up should fall back to local analysis where possible.
- Review SVGs before committing: no `<script>`, event handlers, remote references, or embedded secrets.
