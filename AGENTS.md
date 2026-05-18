# AGENTS.md

## Project Shape

- This is a React + TypeScript + Vite frontend in `src/`.
- The API server is `server.ts`, using Express and the MySQL pool from `src/lib/dbconnect.ts`.
- npm is the package manager for this repo; `package-lock.json` is committed.
- Do not edit generated or reference output unless the task explicitly asks for it, especially `dist/` and existing preview images.

## Commands

- Install dependencies: `npm install`
- Start the Vite dev server: `npm run dev`
- Start the Express API server: `npm start`
- Build frontend assets: `npm run build`
- Run lint: `npm run lint`
- Preview the built app: `npm run preview`

For local development, run the API with `npm start` and the frontend with `npm run dev`. Vite proxies `/api` to `VITE_API_PROXY_TARGET` when set, otherwise to `http://127.0.0.1:3001`.

## Environment

- `src/lib/dbconnect.ts` loads `.env` with `dotenv`.
- Database overrides read by the app: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- API server port override: `PORT`.
- Dev proxy override: `VITE_API_PROXY_TARGET`.
- Frontend API base override: `VITE_API_BASE_URL`.
- Avatar upload script override: `GOOGLE_AVATAR_UPLOAD_SCRIPT_URL`.

Do not add secrets to docs. Prefer environment variables over hardcoding new credentials.

## Ad Hoc Checks

These files are direct `tsx` scripts, not npm scripts:

- `npx tsx test-api.ts` checks login against the deployed API URL.
- `npx tsx test-db.ts`, `npx tsx test-db2.ts`, and `npx tsx check-users.ts` query the configured MySQL database.
- `npx tsx test-login.ts` checks a sample database login flow.
- `npx tsx test-db3.ts` alters the `user` table; do not run it unless the task explicitly requires that schema change.

## Integrations

- `api/google-monitor-data.ts` is a Vercel-style API handler that proxies Google Apps Script monitor data.
- `google-apps-script/monitor_data_webapp.gs` contains the matching Apps Script web app implementation.
- `vercel.json` rewrites `/api/:path*` to `http://region8.duckdns.org/api/:path*` and falls back other routes to `index.html`.
