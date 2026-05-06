# Contributing to Crash Site

Thanks for wanting to help! Here's how to get started.

## Local setup

### Requirements
- Node.js 22+
- Git

### Steps

```bash
git clone https://github.com/MarekZegare4/crash-site.git
cd crash-site

# Backend
cd backend
cp .env.example .env         # fill in at least AUTH_JWT_SECRET
npm install
npm run dev                  # http://localhost:4000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

The dev backend includes a mock login (`/api/auth/mock-login`) so you don't need real OAuth credentials for development.

## Submitting a pull request

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/my-fix
   ```
2. Make your changes.
3. Make sure the build passes:
   ```bash
   cd backend && npm run build
   cd frontend && npm run build
   ```
4. Open a PR against `main` — fill in the PR template.

## Project structure

```
backend/   Express + SQLite API (TypeScript)
frontend/  React + Vite SPA (TypeScript)
nginx/     Reverse proxy config
docs/      Guides and notes
```

## Guidelines

- Keep PRs focused — one change per PR.
- Match the existing code style (no new dependencies without discussion).
- UI text goes through the i18n files (`frontend/src/i18n/en.ts` and `pl.ts`) — both languages required.
- No secrets, user data, or generated files in commits.
