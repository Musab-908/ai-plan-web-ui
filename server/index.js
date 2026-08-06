import express from "express";
import cors from "cors";
import pg from "pg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable. Set it in your hosting provider's dashboard.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const app = express();
app.use(cors());
app.use(express.json());

const q = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params = []) => (await q(sql, params))[0] || null;

const S = "public_api"; // all reads go through the public_api view layer

// ---------- Dashboard ----------
app.get("/api/dashboard", async (req, res, next) => {
  try {
    const meta = await one(`select * from ${S}.dataset_metadata limit 1`);
    res.json(meta);
  } catch (e) { next(e); }
});

// ---------- Companies (only ones offering plans/bundles; separate from
// providers; a company that's both a plan-offering company and a model
// provider still appears in both lists) ----------
app.get("/api/companies", async (req, res, next) => {
  try {
    res.json(
      await q(
        `select c.*
         from ${S}.companies c
         where exists (
           select 1
           from ${S}.brands b
           join ${S}.plan_records p on p.brand_id = b.brand_id
           where b.company_id = c.company_id
         )
         order by c.name`
      )
    );
  } catch (e) { next(e); }
});

app.get("/api/companies/:id", async (req, res, next) => {
  try {
    const company = await one(`select * from ${S}.companies where company_id = $1`, [req.params.id]);
    if (!company) return res.status(404).json({ error: "not found" });
    const brands = await q(`select * from ${S}.brands where company_id = $1 order by name`, [req.params.id]);
    res.json({ company, brands });
  } catch (e) { next(e); }
});

// ---------- Model Providers ----------
app.get("/api/providers", async (req, res, next) => {
  try {
    res.json(await q(`select * from ${S}.model_providers order by name`));
  } catch (e) { next(e); }
});

app.get("/api/providers/:id", async (req, res, next) => {
  try {
    const provider = await one(`select * from ${S}.model_providers where provider_id = $1`, [req.params.id]);
    if (!provider) return res.status(404).json({ error: "not found" });
    const families = await q(`select * from ${S}.model_families where provider_id = $1 order by name`, [req.params.id]);
    res.json({ provider, families });
  } catch (e) { next(e); }
});

// The `models`/`model_scores` views now resolve this via an exact
// benchmark_id join (BM-AA-INTELLIGENCE-INDEX) inside the view itself, so
// m.aa_v4_1_score is already the right number — just alias it consistently
// as aa_intelligence_index_score everywhere so the client doesn't need to
// know the underlying column name changed.
const AA_INDEX_SELECT = `m.aa_v4_1_score as aa_intelligence_index_score`;

// ---------- Model Families ----------
app.get("/api/families/:id", async (req, res, next) => {
  try {
    const family = await one(`select * from ${S}.model_families where model_family_id = $1`, [req.params.id]);
    if (!family) return res.status(404).json({ error: "not found" });
    const models = await q(
      `select m.*, ${AA_INDEX_SELECT}
       from ${S}.models m
       where m.model_family_id = $1
       order by m.version_name`,
      [req.params.id]
    );
    res.json({ family, models });
  } catch (e) { next(e); }
});

// ---------- Models (browse all + detail w/ benchmarks) ----------
app.get("/api/models", async (req, res, next) => {
  try {
    res.json(
      await q(
        `select m.*, ${AA_INDEX_SELECT}
         from ${S}.models m
         order by m.model_family_name, m.version_name`
      )
    );
  } catch (e) { next(e); }
});

app.get("/api/models/:id", async (req, res, next) => {
  try {
    const model = await one(
      `select m.*, ${AA_INDEX_SELECT} from ${S}.models m where m.model_id = $1`,
      [req.params.id]
    );
    if (!model) return res.status(404).json({ error: "not found" });
    const benchmarks = await q(
      `select * from ${S}.benchmark_scores where model_id = $1 order by benchmark_name`,
      [req.params.id]
    );
    res.json({ model, benchmarks });
  } catch (e) { next(e); }
});

// ---------- Benchmarks (browse all + detail) ----------
app.get("/api/benchmarks", async (req, res, next) => {
  try {
    res.json(await q(`select * from ${S}.benchmarks order by category, name`));
  } catch (e) { next(e); }
});

app.get("/api/benchmarks/:id", async (req, res, next) => {
  try {
    const benchmark = await one(`select * from ${S}.benchmarks where benchmark_id = $1`, [req.params.id]);
    if (!benchmark) return res.status(404).json({ error: "not found" });
    const scores = await q(
      `select * from ${S}.benchmark_scores where benchmark_id = $1 order by score_value desc nulls last`,
      [req.params.id]
    );
    res.json({ benchmark, scores });
  } catch (e) { next(e); }
});

// ---------- Plans (browse all, cheapest first) ----------
// Enriched with: company name (via brand), a deduped feature list, the top 3
// individual models the plan grants access to (best-scoring model per
// accessible family, picked from the specific models the plan actually
// grants access to now that plan_model_access is model-level rather than
// family-level, then top 3 of those overall) ranked by AA Intelligence
// Index, and the full list of accessible family names (used for filtering,
// unlike the capped top-3 used for display) — reusing AA_INDEX_SELECT so
// scores agree with what the model/family pages show.
app.get("/api/plans", async (req, res, next) => {
  try {
    res.json(
      await q(`
        with model_scores as (
          select m.model_id, ${AA_INDEX_SELECT}, m.aa_cost_per_task_usd as cost_per_task_usd
          from ${S}.models m
        )
        select
          p.*,
          co.company_id as company_id,
          co.name as company_name,
          feats.features,
          topm.top_models,
          topm.best_model_quality_score,
          topm.best_model_cost_per_task_usd,
          accfam.accessible_families
        from ${S}.plan_records p
        left join ${S}.brands b on b.brand_id = p.brand_id
        left join ${S}.companies co on co.company_id = b.company_id
        left join lateral (
          select coalesce(json_agg(t order by t.feature_category, t.feature_name), '[]'::json) as features
          from (
            select distinct on (feature_name) feature_name, feature_category,
              platform_current_supported as supported, platform_current_support_note as support_note
            from ${S}.plan_features
            where plan_id = p.plan_id
            order by feature_name, feature_category
          ) t
        ) feats on true
        left join lateral (
          select
            coalesce(json_agg(z order by z.score desc nulls last), '[]'::json) as top_models,
            -- z is already capped to the top 3 (ordered by score desc), so
            -- the first element is the plan's single best accessible model.
            -- Pulling score+cost from that same row (not a separate
            -- cheapest-model query) keeps the two numbers describing one
            -- consistent model.
            (array_agg(z.score order by z.score desc nulls last))[1] as best_model_quality_score,
            (array_agg(z.cost_per_task_usd order by z.score desc nulls last))[1] as best_model_cost_per_task_usd
          from (
            select fam_best.model_id, fam_best.version_name, fam_best.score, fam_best.cost_per_task_usd
            from (
              -- Per family, prefer a model the plan actually lets you pick
              -- (directly_selectable) over one that merely "counts as
              -- current" (e.g. routed/inferred access), then rank by score.
              select distinct on (pm.model_family_id)
                pm.model_family_id, pm.model_id, pm.model_name as version_name,
                ms.aa_intelligence_index_score as score, ms.cost_per_task_usd as cost_per_task_usd
              from ${S}.plan_models pm
              left join model_scores ms on ms.model_id = pm.model_id
              where pm.plan_id = p.plan_id
                and coalesce(pm.counts_as_current, true)
              order by pm.model_family_id, pm.directly_selectable desc nulls last, ms.aa_intelligence_index_score desc nulls last
            ) fam_best
            order by fam_best.score desc nulls last
            limit 3
          ) z
        ) topm on true
        left join lateral (
          select coalesce(json_agg(distinct pm.model_family_name), '[]'::json) as accessible_families
          from ${S}.plan_models pm
          where pm.plan_id = p.plan_id
            and coalesce(pm.counts_as_current, true)
        ) accfam on true
        order by p.base_price_usd_monthly asc nulls last, p.name
      `)
    );
  } catch (e) { next(e); }
});

// ---------- Brands -> sub-products + plans ----------
app.get("/api/brands/:id", async (req, res, next) => {
  try {
    const brand = await one(`select * from ${S}.brands where brand_id = $1`, [req.params.id]);
    if (!brand) return res.status(404).json({ error: "not found" });
    const subProducts = await q(`select * from ${S}.sub_products where brand_id = $1 order by name`, [req.params.id]);
    const plans = await q(`select * from ${S}.plan_records where brand_id = $1 order by name`, [req.params.id]);
    res.json({ brand, subProducts, plans });
  } catch (e) { next(e); }
});

// ---------- Sub-products / Products ----------
app.get("/api/products/:id", async (req, res, next) => {
  try {
    const product = await one(`select * from ${S}.sub_products where subproduct_id = $1`, [req.params.id]);
    if (!product) return res.status(404).json({ error: "not found" });
    const features = await q(
      `select * from ${S}.platform_features where subproduct_id = $1 order by feature_category, feature_name`,
      [req.params.id]
    );
    const models = await q(
      `select * from ${S}.platform_models
       where subproduct_id = $1
         and coalesce(counts_as_current, true)
       order by family_name`,
      [req.params.id]
    );
    res.json({ product, features, models });
  } catch (e) { next(e); }
});

// ---------- Plans -> model access (plan_models) + features ----------
app.get("/api/plans/:id", async (req, res, next) => {
  try {
    const plan = await one(`select * from ${S}.plan_records where plan_id = $1`, [req.params.id]);
    if (!plan) return res.status(404).json({ error: "not found" });
    // Same "best accessible model" resolution as GET /api/plans (per-family
    // best, preferring directly_selectable, ranked by AA Intelligence Index,
    // then take the single top row) so both endpoints agree.
    const best = await one(
      `with model_scores as (
         select m.model_id, ${AA_INDEX_SELECT}, m.aa_cost_per_task_usd as cost_per_task_usd
         from ${S}.models m
       )
       select fam_best.score as best_model_quality_score,
              fam_best.cost_per_task_usd as best_model_cost_per_task_usd
       from (
         select distinct on (pm.model_family_id)
           pm.model_family_id, ms.aa_intelligence_index_score as score, ms.cost_per_task_usd as cost_per_task_usd
         from ${S}.plan_models pm
         left join model_scores ms on ms.model_id = pm.model_id
         where pm.plan_id = $1
           and coalesce(pm.counts_as_current, true)
         order by pm.model_family_id, pm.directly_selectable desc nulls last, ms.aa_intelligence_index_score desc nulls last
       ) fam_best
       order by fam_best.score desc nulls last
       limit 1`,
      [req.params.id]
    );
    plan.best_model_quality_score = best?.best_model_quality_score ?? null;
    plan.best_model_cost_per_task_usd = best?.best_model_cost_per_task_usd ?? null;
    const modelAccess = await q(
      `select * from ${S}.plan_models
       where plan_id = $1
         and coalesce(counts_as_current, true)
       order by directly_selectable desc nulls last, model_family_name`,
      [req.params.id]
    );
    const features = await q(
      `select distinct on (feature_name) *,
         platform_current_supported as supported, platform_current_support_note as support_note
       from ${S}.plan_features
       where plan_id = $1
       order by feature_name, feature_category`,
      [req.params.id]
    );
    features.sort((a, b) =>
      (a.feature_category || "").localeCompare(b.feature_category || "") ||
      (a.feature_name || "").localeCompare(b.feature_name || "")
    );
    res.json({ plan, modelAccess, features });
  } catch (e) { next(e); }
});

// ---------- Coding Agents (e.g. Claude Code, Codex, Kimi Code CLI) ----------
// AGENT is a coding-agent product (brand_id links back to the same
// companies/brands used elsewhere, when known — some agents like Opencode
// have no owning brand in the catalogue and brand_id is null).
// AGENT_MODEL_BENCHMARKS holds one row per agent+model(+config) combo, with
// four score columns: the Artificial Analysis Coding Agent Index,
// DeepSWE, Terminal-Bench v2, and SWE-Atlas-QnA. The UI is model-centric —
// one flat table of agent-on-model results, no agent -> models drill-down —
// so this is the only endpoint the client needs for that page.
app.get("/api/agent-benchmarks", async (req, res, next) => {
  try {
    res.json(
      await q(`
        select
          b.*,
          a.name as agent_name,
          a.agent_type,
          a.brand_id as agent_brand_id,
          br.name as agent_brand_name,
          co.name as agent_company_name,
          m.model_family_name,
          m.provider_name
        from ${S}.agent_model_benchmarks b
        left join ${S}.agents a on a.agent_id = b.agent_id
        left join ${S}.brands br on br.brand_id = a.brand_id
        left join ${S}.companies co on co.company_id = br.company_id
        left join ${S}.models m on m.model_id = b.model_id
        order by b.model_name_raw, b.coding_agent_index_score desc nulls last
      `)
    );
  } catch (e) { next(e); }
});

// ---------- Serve the built React client (production) ----------
// In dev you still run `vite` separately with its proxy; this only kicks in
// once client/dist exists, which happens on Render's build step.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "../client/dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Anything that isn't /api/* falls through to the SPA's index.html so
  // client-side routes like /models/42 work on a hard refresh.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));