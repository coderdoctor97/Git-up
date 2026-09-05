# Changelog

Git-Up does not currently publish tagged releases. This changelog records notable repository-level changes until formal release notes are adopted.

## Unreleased

- Rebuilt project documentation around the verified Node/vanilla-JS implementation and current scripts.
- Added a local smoke-test script for server startup, `/api/health`, the app shell, and key local assets.
- Added project metadata (`repository`, `bugs`, `homepage`, `engines`, and explicit `UNLICENSED` package state).
- Replaced the remote Oreo Lottie dependency with a local original SVG mascot.
- Removed browser-side CDN scripts from the default page shell.
- Added asset attribution, architecture, contributing, security, issue-template, and pull-request guidance.
- Improved GitHub network/TLS error messages and corrected raw GitHub file URL construction.

## 2.0.0

- Current application version in `package.json` and `/api/health`.
- Provides living install paths, failure-first analysis, multi-path install graph, install contracts, zero-context clone modes, and repository health scoring.
