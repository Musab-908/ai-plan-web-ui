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

// AA Intelligence Index sometimes lives only in benchmark_scores (as the
// "Artificial Analysis Intelligence Index" row) and not in the models
// table's own cached column. COALESCE against the newest matching score so
// every endpoint that shows this number agrees, instead of patching it in
// the client per page.
const AA_INDEX_FALLBACK = `
  coalesce(
    m.aa_intelligence_index_score,
    (
      select bs.score_value
      from ${S}.benchmark_scores bs
      where bs.model_id = m.model_id
        and bs.benchmark_name ilike '%artificial analysis intelligence index%'
      order by bs.as_of_date desc nulls last
      limit 1
    )
  ) as aa_intelligence_index_score
`;

// ---------- Model Families ----------
app.get("/api/families/:id", async (req, res, next) => {
  try {
    const family = await one(`select * from ${S}.model_families where model_family_id = $1`, [req.params.id]);
    if (!family) return res.status(404).json({ error: "not found" });
    const models = await q(
      `select m.*, ${AA_INDEX_FALLBACK}
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
        `select m.*, ${AA_INDEX_FALLBACK}
         from ${S}.models m
         order by m.model_family_name, m.version_name`
      )
    );
  } catch (e) { next(e); }
});

app.get("/api/models/:id", async (req, res, next) => {
  try {
    const model = await one(
      `select m.*, ${AA_INDEX_FALLBACK} from ${S}.models m where m.model_id = $1`,
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
app.get("/api/plans", async (req, res, next) => {
  try {
    res.json(
      await q(
        `select p.*,
                (select count(*) from ${S}.plan_features pf where pf.plan_id = p.plan_id) as feature_count,
                (select count(*) from ${S}.plan_features pf where pf.plan_id = p.plan_id and pf.supported) as supported_feature_count
         from ${S}.plan_records p
         order by p.base_price_usd_monthly asc nulls last, p.name`
      )
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
         and coalesce(status_label, '') not ilike 'not available'
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
    const modelAccess = await q(
      `select * from ${S}.plan_models
       where plan_id = $1
         and coalesce(status_label, '') not ilike 'not available'
       order by model_family_name`,
      [req.params.id]
    );
    const features = await q(
      `select distinct on (feature_name) *
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