# AI Model & Plan Catalog — SPA

A drill-down explorer for your Neon Postgres catalog, matching this flow:

```
Dashboard ─┬─ Companies ── Companies/:id ── Brands/:id ─┬─ Products/:id
           │                                            └─ Plans/:id ─┬─ model access (plan_models)
           │                                                          └─ features (plan_features)
           ├─ Providers ── Providers/:id ── Families/:id ── Models/:id ── benchmark scores
           ├─ Models (browse all) ── Models/:id
           └─ Benchmarks (browse all) ── Benchmarks/:id ── scores by model
```

Changes from the original diagram, per request:
- Clicking any model (from the models list, a family page, or a plan's model access table) opens `/models/:id`, which shows its benchmark scores.
- The `plan_models` table's rows link to the model's family, so plan → model access → model info is reachable.
- **Companies** and **Model Providers** are separate top-level sections. An org that's both a company and a provider appears in both lists (this falls out naturally since they're read from separate tables/views).

## Structure
- `server/` — Express API that reads from the `public_api.*` views in your Neon DB.
- `client/` — React + Vite SPA.

## Run it

1. **Backend**
   ```bash
   cd server
   npm install   # already done for you if you unzip as-is with node_modules; otherwise run this
   npm start     # listens on :8787
   ```
   The Neon connection string is already set as a default in `server/index.js`. To override, set `DATABASE_URL` in your environment instead.

2. **Frontend** (in a second terminal)
   ```bash
   cd client
   npm install
   npm run dev   # opens on :5173, proxies /api to :8787
   ```

Then open the printed `http://localhost:5173` URL.

## Notes
- All reads go through the `public_api` schema views you already defined, so the UI stays in sync with whatever those views expose.
- No auth/write functionality — this is a read-only browsing UI.
