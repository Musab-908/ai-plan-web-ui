# AI Model & Plan Catalog — SPA

A drill-down explorer for your Neon Postgres catalog, matching this flow:

```
Dashboard ─┬─ Companies ── Companies/:id ── Brands/:id ─┬─ Products/:id
           │                                            └─ Plans/:id ─┬─ model access (plan_models)
           │                                                          └─ features (plan_features)
           ├─ Providers ── Providers/:id ── Families/:id ── Models/:id ── benchmark scores
           ├─ Models (browse all) ── Models/:id
           ├─ Plans (browse all) ── Plans/:id
           └─ Benchmarks (browse all) ── Benchmarks/:id ── scores by model
```

See `FEATURES.md` for the full feature list.

Changes from the original diagram, per request:
- Clicking any model (from the models list, a family page, a plan's model access table, or search) opens `/models/:id`, which shows its benchmark scores.
- The `plan_models` table's rows link to the model's family, so plan → model access → model info is reachable.
- **Companies** and **Model Providers** are separate top-level sections. An org that's both a company and a provider appears in both lists (this falls out naturally since they're read from separate tables/views).
- **Plans** now has its own top-level browse page (`/plans`) in addition to being reachable via a brand.
- A global search box (top bar, every page) jumps directly to any company, provider, model, plan, or benchmark by name.

## Structure
- `server/` — Express API that reads from the `public_api.*` views in your Neon DB, and (in production) serves the built client.
- `client/` — React + Vite SPA.

## Run it locally

1. **Backend**
   ```bash
   cd server
   npm install
   DATABASE_URL="postgres://..." npm start   # listens on :8787
   ```
   `DATABASE_URL` is required — the server exits on startup if it isn't set. There is no hardcoded fallback connection string in `server/index.js`.

2. **Frontend** (in a second terminal)
   ```bash
   cd client
   npm install
   npm run dev   # opens on :5173, proxies /api to :8787
   ```

Then open the printed `http://localhost:5173` URL.

## Deploying on Render

This repo is set up to run as a **single Render Web Service**: the Express server serves the client's built static files itself (see the `client/dist` check near the bottom of `server/index.js`), so you don't need a separate static site.

1. **Create a new Web Service** on Render, pointing at this repo.
2. **Build Command** — build the client, then install server deps:
   ```bash
   cd client && npm install && npm run build && cd ../server && npm install
   ```
3. **Start Command**:
   ```bash
   cd server && npm start
   ```
4. **Environment variables** — set these in the Render dashboard (Environment tab), not in the repo:
   - `DATABASE_URL` — your Neon Postgres connection string (Render's Neon connections typically require SSL; the pool is already configured with `ssl: { rejectUnauthorized: false }`).
   - `PORT` — Render sets this automatically; the server already reads `process.env.PORT` and falls back to `8787` locally, so no action is needed here.
5. **Health check path** — `/` works once the client build exists (it falls through to `index.html`); `/api/dashboard` also works as an API-specific check.
6. Once deployed, Render's URL serves both the API (`/api/*`) and the SPA (everything else, via the catch-all route) from the same origin, so no CORS configuration is needed between client and server in production — though `cors()` is left enabled server-side for local dev convenience.

**Redeploys:** any push to the connected branch triggers a new build. The client is rebuilt fresh each time, so there's no separate "sync client build to server" step to remember.

## Notes
- All reads go through the `public_api` schema views you already defined, so the UI stays in sync with whatever those views expose.
- No auth/write functionality — this is a read-only browsing UI.
- The in-browser `useApi` cache (10 min TTL) means repeat navigation within a session doesn't re-hit the API; a hard refresh always gets fresh data.