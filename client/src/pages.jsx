import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { useApi } from "./useApi";
import { Status, CardGrid, DataTable, Bool, KV } from "./components";
import { useCompare } from "./compareContext";
import { useSetPageMeta } from "./pageMetaContext";

// ---------------- Dashboard ----------------

// These are raw DB-record counts that are noisy on a landing page (join-table
// row counts, evidence/status bookkeeping, etc.) — matched by substring so we
// don't have to hardcode every exact column name from dataset_metadata.
const DASH_STAT_EXCLUDE = [
  "model_family", "benchmark_source", "benchmark_score", "benchmark",
  "platform_model_record", "platform_feature_record",
  "plan_family_access", "plan_entitlement", "status", "evidence",
  "feature", "subproduct", "brand",
];

// Best-effort mapping from a stat's key name to the section it summarizes,
// so the curated cards can double as nav tiles.
function dashStatHref(key) {
  const k = key.toLowerCase();
  if (k.includes("company") || k.includes("companies")) return "/companies";
  if (k.includes("provider")) return "/providers";
  if (k.includes("model") && !k.includes("family")) return "/models";
  if (k.includes("plan")) return "/plans";
  if (k.includes("brand")) return "/companies";
  return null;
}

function DashboardStats() {
  const { data, error, loading } = useApi("dashboard");
  const navigate = useNavigate();

  if (loading || error) return <Status loading={loading} error={error} />;
  if (!data) return null;

  const stats = Object.entries(data).filter(([k]) => {
    if (k === "database_checked_on") return false;
    const lower = k.toLowerCase();
    return !DASH_STAT_EXCLUDE.some((needle) => lower.includes(needle));
  });

  return (
    <>
      <div className="dash-grid">
        {stats.map(([k, v]) => {
          const href = dashStatHref(k);
          const card = (
            <>
              <div className="num">{v}</div>
              <div className="label">{k.replace(/_/g, " ")}</div>
            </>
          );
          return href ? (
            <div
              className="dash-card dash-card-link"
              key={k}
              role="button"
              tabIndex={0}
              onClick={() => navigate(href)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(href); }}
            >
              {card}
            </div>
          ) : (
            <div className="dash-card" key={k}>{card}</div>
          );
        })}
      </div>
      {data.database_checked_on && (
        <p className="dash-updated">Catalog data checked on {data.database_checked_on}</p>
      )}
    </>
  );
}

function TopModelsLeaderboard() {
  const { data, error, loading } = useApi("models");

  const top = (data || [])
    .filter((m) => m.aa_intelligence_index_score != null)
    .sort((a, b) => Number(b.aa_intelligence_index_score) - Number(a.aa_intelligence_index_score))
    .slice(0, 8);

  const maxScore = top.length > 0 ? Number(top[0].aa_intelligence_index_score) : 1;

  return (
    <div className="dash-panel dash-panel-wide">
      <div className="dash-panel-head">
        <h2>Top Models · Intelligence Index</h2>
        <Link to="/models" className="dash-panel-more">See all →</Link>
      </div>
      <Status loading={loading} error={error} />
      {!loading && !error && top.length === 0 && <div className="empty">No scored models yet.</div>}
      {top.length > 0 && (
        <ol className="leaderboard">
          {top.map((m, i) => {
            const score = Number(m.aa_intelligence_index_score);
            const pct = maxScore > 0 ? Math.max(6, (score / maxScore) * 100) : 0;
            return (
              <li key={m.model_id}>
                <Link to={`/models/${m.model_id}`}>
                  <span className="leaderboard-rank">{i + 1}</span>
                  <span className="leaderboard-main">
                    <span className="leaderboard-name-row">
                      <span className="leaderboard-name">{m.version_name}</span>
                      <span className="leaderboard-score">{m.aa_intelligence_index_score}</span>
                    </span>
                    <span className="leaderboard-sub">{m.model_family_name}{m.provider_name ? ` · ${m.provider_name}` : ""}</span>
                    <span className="leaderboard-bar-track">
                      <span className="leaderboard-bar-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function Dashboard() {
  return (
    <div>
      <h1>AI Model & Plan Catalog</h1>
      <p className="subtitle">Explore companies, model providers, plans, sub-products, models and benchmarks.</p>

      <DashboardStats />

      <div className="dash-panels">
        <TopModelsLeaderboard />
      </div>
      <p className="dash-attribution">
        Intelligence Index scores sourced from{" "}
        <a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer">
          Artificial Analysis
        </a>.
      </p>
    </div>
  );
}

// ---------------- Companies ----------------
export function Companies() {
  const { data, error, loading } = useApi("companies");
  return (
    <div>
      <h1>Companies</h1>
      <p className="subtitle">Organizations that offer plans/bundles (listed separately from model providers — a company that's both appears in both lists).</p>
      <Status loading={loading} error={error} />
      <CardGrid
        items={data}
        getKey={(c) => c.company_id}
        getTitle={(c) => c.name}
        getMeta={(c) => c.notes}
        getHref={(c) => `/companies/${c.company_id}`}
      />
    </div>
  );
}

export function CompanyDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`companies/${id}`);

  useSetPageMeta({
    label: data?.company?.name,
    upTo: { path: "/companies", label: "Companies" },
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.company.name}</h1>
          {data.company.notes && <p className="subtitle">{data.company.notes}</p>}
          <h2>Brands</h2>
          <CardGrid
            items={data.brands}
            getKey={(b) => b.brand_id}
            getTitle={(b) => b.name}
            getMeta={(b) => b.notes}
            getHref={(b) => `/brands/${b.brand_id}`}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Model Providers ----------------
export function Providers() {
  const { data, error, loading } = useApi("providers");
  return (
    <div>
      <h1>Model Providers</h1>
      <p className="subtitle">Entities that provide AI models (listed separately from companies).</p>
      <Status loading={loading} error={error} />
      <CardGrid
        items={data}
        getKey={(p) => p.provider_id}
        getTitle={(p) => p.name}
        getMeta={(p) => p.type}
        getHref={(p) => `/providers/${p.provider_id}`}
      />
    </div>
  );
}

export function ProviderDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`providers/${id}`);

  useSetPageMeta({
    label: data?.provider?.name,
    upTo: { path: "/providers", label: "Providers" },
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.provider.name}</h1>
          <p className="subtitle">{data.provider.type}{data.provider.company_name ? ` · ${data.provider.company_name}` : ""}</p>
          <h2>Model Families</h2>
          <CardGrid
            items={data.families}
            getKey={(f) => f.model_family_id}
            getTitle={(f) => f.name}
            getMeta={(f) => f.current_flagship ? `Flagship: ${f.current_flagship}` : null}
            getHref={(f) => `/families/${f.model_family_id}`}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Model Families ----------------
export function FamilyDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`families/${id}`);

  useSetPageMeta({
    label: data?.family?.name,
    upTo: data ? { path: `/providers/${data.family.provider_id}`, label: data.family.provider_name } : undefined,
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.family.name}</h1>
          <p className="subtitle">{data.family.provider_name}{data.family.company_name ? ` · ${data.family.company_name}` : ""}</p>
          {data.family.grouping_note && <div className="detail-block">{data.family.grouping_note}</div>}
          <h2>Models</h2>
          <DataTable
            columns={[
              { key: "version_name", label: "Version", sortable: true },
              { key: "status", label: "Status", sortable: true },
              {
                key: "aa_intelligence_index_score",
                label: "AA Intelligence Index",
                sortable: true,
                sortValue: (m) => (m.aa_intelligence_index_score != null ? Number(m.aa_intelligence_index_score) : null),
              },
            ]}
            rows={data.models}
            rowKey={(m) => m.model_id}
            rowHref={(m) => `/models/${m.model_id}`}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Models ----------------
export function ModelsBrowse() {
  const { data, error, loading } = useApi("models");
  const { toggle, isSelected } = useCompare();

  return (
    <div>
      <h1>All Models</h1>
      <p className="subtitle">Click a model to view its benchmark scores. Check up to 4 to compare, or click a column header to sort.</p>
      <Status loading={loading} error={error} />
      <DataTable
        columns={[
          { key: "version_name", label: "Model", sortable: true },
          { key: "model_family_name", label: "Family", sortable: true },
          { key: "provider_name", label: "Provider", sortable: true },
          { key: "status", label: "Status", sortable: true },
          {
            key: "aa_intelligence_index_score",
            label: "Intelligence Index",
            sortable: true,
            sortValue: (m) => (m.aa_intelligence_index_score != null ? Number(m.aa_intelligence_index_score) : null),
          },
        ]}
        rows={data}
        rowKey={(m) => m.model_id}
        rowHref={(m) => `/models/${m.model_id}`}
        selectable={{
          isSelected: (m) => isSelected("model", m.model_id),
          onToggle: (m) => toggle({ type: "model", id: m.model_id, label: m.version_name }),
        }}
      />
    </div>
  );
}

export function ModelDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`models/${id}`);
  const { toggle, isSelected } = useCompare();

  // The `models` row has its own cached summary columns (aa_intelligence_index_score,
  // performance_vs_* etc). Sometimes those are null even though the same number
  // already exists in benchmark_scores (e.g. the "Artificial Analysis Intelligence
  // Index" row) — that's why the card could show "—" while the table below has
  // real data. Fall back to the benchmarks list so the card doesn't go blank.
  const aaIndexFromBenchmarks = data?.benchmarks?.find((b) =>
    (b.benchmark_name || "").toLowerCase().includes("artificial analysis intelligence index")
  )?.score_value;
  const aaIndex = data?.model.aa_intelligence_index_score ?? aaIndexFromBenchmarks ?? null;

  // Per-record "last updated": newest as_of_date among this model's benchmark scores.
  const lastUpdated = data?.benchmarks?.reduce(
    (max, b) => (b.as_of_date && (!max || b.as_of_date > max) ? b.as_of_date : max),
    null
  );

  useSetPageMeta({
    label: data?.model?.version_name,
    upTo: data ? { path: `/families/${data.model.model_family_id}`, label: data.model.model_family_name } : undefined,
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <div className="detail-header-row">
            <div>
              <h1>{data.model.version_name}</h1>
              <p className="subtitle">
                <Link to={`/families/${data.model.model_family_id}`}>{data.model.model_family_name}</Link>
                {" · "}
                <Link to={`/providers/${data.model.provider_id}`}>{data.model.provider_name}</Link>
              </p>
            </div>
            <label className="compare-toggle">
              <input
                type="checkbox"
                checked={isSelected("model", data.model.model_id)}
                onChange={() => toggle({ type: "model", id: data.model.model_id, label: data.model.version_name })}
              />
              Compare this model
            </label>
          </div>
          <div className="detail-block">
            <KV pairs={[
              ["Status", data.model.status],
              ["AA Intelligence Index", aaIndex],
              ["vs Opus 4.8", data.model.performance_vs_opus_4_8_pct != null ? `${data.model.performance_vs_opus_4_8_pct}%` : null],
              ["vs GPT-5.6 Sol", data.model.performance_vs_gpt_5_6_sol_pct != null ? `${data.model.performance_vs_gpt_5_6_sol_pct}%` : null],
              ["vs Fable 5", data.model.performance_vs_fable_5_pct != null ? `${data.model.performance_vs_fable_5_pct}%` : null],
              ["Data last updated", lastUpdated],
            ]} />
          </div>
          <h2>Benchmark Scores</h2>
          <DataTable
            columns={[
              { key: "benchmark_name", label: "Benchmark", sortable: true },
              { key: "benchmark_source_name", label: "Source", sortable: true },
              {
                key: "score_value",
                label: "Score",
                sortable: true,
                sortValue: (r) => (r.score_value != null ? Number(r.score_value) : null),
                render: (r) => r.score_value ?? "—",
              },
              { key: "rank", label: "Rank" },
              { key: "as_of_date", label: "As of", sortable: true },
            ]}
            rows={data.benchmarks}
            rowKey={(b) => `${b.benchmark_id}-${b.model_id}`}
            rowHref={(b) => `/benchmarks/${b.benchmark_id}`}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Benchmarks ----------------
export function BenchmarksBrowse() {
  const { data, error, loading } = useApi("benchmarks");
  return (
    <div>
      <h1>All Benchmarks</h1>
      <p className="subtitle">Click a column header to sort.</p>
      <Status loading={loading} error={error} />
      <DataTable
        columns={[
          { key: "name", label: "Benchmark", sortable: true },
          { key: "category", label: "Category", sortable: true },
          { key: "scale_type", label: "Scale", sortable: true },
          { key: "unit_label", label: "Unit" },
        ]}
        rows={data}
        rowKey={(b) => b.benchmark_id}
        rowHref={(b) => `/benchmarks/${b.benchmark_id}`}
      />
    </div>
  );
}

export function BenchmarkDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`benchmarks/${id}`);

  useSetPageMeta({
    label: data?.benchmark?.name,
    upTo: { path: "/benchmarks", label: "Benchmarks" },
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.benchmark.name}</h1>
          <p className="subtitle">{data.benchmark.category} · {data.benchmark.description}</p>
          <h2>Scores by Model</h2>
          <DataTable
            columns={[
              { key: "model_name", label: "Model", sortable: true },
              { key: "model_family_name", label: "Family", sortable: true },
              {
                key: "score_value",
                label: "Score",
                sortable: true,
                sortValue: (r) => (r.score_value != null ? Number(r.score_value) : null),
                render: (r) => r.score_value ?? "—",
              },
              { key: "rank", label: "Rank" },
              { key: "as_of_date", label: "As of", sortable: true },
            ]}
            rows={data.scores}
            rowKey={(s) => s.model_id}
            rowHref={(s) => `/models/${s.model_id}`}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Brands ----------------
export function BrandDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`brands/${id}`);
  const { toggle, isSelected } = useCompare();

  useSetPageMeta({
    label: data?.brand?.name,
    upTo: data ? { path: `/companies/${data.brand.company_id}`, label: data.brand.company_name } : undefined,
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.brand.name}</h1>
          <p className="subtitle">
            <Link to={`/companies/${data.brand.company_id}`}>{data.brand.company_name}</Link>
          </p>
          <h2>Sub-products</h2>
          <CardGrid
            items={data.subProducts}
            getKey={(s) => s.subproduct_id}
            getTitle={(s) => s.name}
            getMeta={(s) => s.category}
            getHref={(s) => `/products/${s.subproduct_id}`}
          />
          <h2>Plans</h2>
          <p className="subtitle">Check up to 4 to compare plans.</p>
          <CardGrid
            items={data.plans}
            getKey={(p) => p.plan_id}
            getTitle={(p) => p.name}
            getMeta={(p) => p.base_price_usd_monthly != null ? `$${p.base_price_usd_monthly}/mo` : p.audience}
            getHref={(p) => `/plans/${p.plan_id}`}
            selectable={{
              isSelected: (p) => isSelected("plan", p.plan_id),
              onToggle: (p) => toggle({ type: "plan", id: p.plan_id, label: p.name }),
            }}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Sub-products / Products ----------------
export function ProductDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`products/${id}`);

  useSetPageMeta({
    label: data?.product?.name,
    upTo: data ? { path: `/brands/${data.product.brand_id}`, label: data.product.brand_name } : undefined,
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.product.name}</h1>
          <p className="subtitle">
            <Link to={`/brands/${data.product.brand_id}`}>{data.product.brand_name}</Link>
            {" · "}{data.product.category}
          </p>
          <div className="detail-block">
            <KV pairs={[
              ["AI-native IDE", data.product.ai_native_ide === null ? null : (data.product.ai_native_ide ? "Yes" : "No")],
              ["IDE-integrated copilot", data.product.ide_integrated_copilot === null ? null : (data.product.ide_integrated_copilot ? "Yes" : "No")],
              ["Offering company", data.product.offering_company],
              ["Notes", data.product.notes],
            ]} />
          </div>
          {data.models?.length > 0 && (
            <>
              <h2>Model Access</h2>
              <DataTable
                columns={[
                  { key: "family_name", label: "Model Family" },
                  { key: "provider_name", label: "Provider" },
                  { key: "status_label", label: "Status" },
                ]}
                rows={data.models}
                rowKey={(m) => `${m.platform_id}-${m.model_family_id}`}
                rowHref={(m) => `/families/${m.model_family_id}`}
              />
            </>
          )}
          {data.features?.length > 0 && (
            <>
              <h2>Features</h2>
              <DataTable
                columns={[
                  { key: "feature_name", label: "Feature" },
                  { key: "feature_category", label: "Category" },
                  { key: "supported", label: "Supported", render: (r) => <Bool value={r.supported} /> },
                  { key: "support_note", label: "Notes" },
                ]}
                rows={data.features}
                rowKey={(f) => `${f.platform_id}-${f.feature_id}`}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Plans ----------------
export function PlansBrowse() {
  const { data, error, loading } = useApi("plans");
  const { toggle, isSelected } = useCompare();

  return (
    <div>
      <h1>All Plans</h1>
      <p className="subtitle">Click a plan for pricing details, model access, and features. Check up to 4 to compare.</p>
      <Status loading={loading} error={error} />
      <DataTable
        columns={[
          { key: "name", label: "Plan", sortable: true },
          { key: "brand_name", label: "Brand", sortable: true },
          { key: "audience", label: "Audience", sortable: true },
          {
            key: "base_price_usd_monthly",
            label: "Price / seat / mo",
            sortable: true,
            sortValue: (p) => (p.base_price_usd_monthly != null ? Number(p.base_price_usd_monthly) : null),
            render: (p) => (p.base_price_usd_monthly != null ? `$${p.base_price_usd_monthly}` : "Custom"),
          },
        ]}
        rows={data}
        rowKey={(p) => p.plan_id}
        rowHref={(p) => `/plans/${p.plan_id}`}
        selectable={{
          isSelected: (p) => isSelected("plan", p.plan_id),
          onToggle: (p) => toggle({ type: "plan", id: p.plan_id, label: p.name }),
        }}
      />
    </div>
  );
}

export function PlanDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`plans/${id}`);
  const { toggle, isSelected } = useCompare();

  useSetPageMeta({
    label: data?.plan?.name,
    upTo: data ? { path: `/brands/${data.plan.brand_id}`, label: data.plan.brand_name } : undefined,
  });

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <div className="plan-hero">
            <div className="plan-hero-main">
              <p className="subtitle">
                <Link to={`/brands/${data.plan.brand_id}`}>{data.plan.brand_name}</Link>
                {" · "}{data.plan.audience}
              </p>
              <h1>{data.plan.name}</h1>
              <label className="compare-toggle">
                <input
                  type="checkbox"
                  checked={isSelected("plan", data.plan.plan_id)}
                  onChange={() => toggle({ type: "plan", id: data.plan.plan_id, label: data.plan.name })}
                />
                Compare this plan
              </label>
            </div>
            <div className="plan-price">
              <div className="plan-price-value">
                {data.plan.base_price_usd_monthly != null ? `$${data.plan.base_price_usd_monthly}` : "Custom"}
              </div>
              {data.plan.base_price_usd_monthly != null && <div className="plan-price-period">/ seat / month</div>}
              {data.plan.team_seats && <div className="plan-price-seats">{data.plan.team_seats} seats</div>}
            </div>
          </div>

          <div className="detail-block">
            <KV pairs={[
              ["Usage credits", data.plan.usage_credits_summary],
              ["Best suited for", data.plan.best_suited_for],
              ["Model access summary", data.plan.model_access_summary],
              ["Not included", data.plan.not_included],
            ]} />
          </div>

          <h2>Model Access (plan_models)</h2>
          <p className="subtitle">Click a row to see the model family and its models.</p>
          <DataTable
            columns={[
              { key: "model_family_name", label: "Model Family", sortable: true },
              { key: "provider_name", label: "Provider", sortable: true },
              { key: "status_label", label: "Status", sortable: true },
              { key: "directly_selectable", label: "Directly selectable", render: (r) => <Bool value={r.directly_selectable} /> },
            ]}
            rows={data.modelAccess}
            rowKey={(m) => m.plan_family_access_id}
            rowHref={(m) => `/families/${m.model_family_id}`}
          />

          <h2>Features (plan_features)</h2>
          <DataTable
            columns={[
              { key: "feature_name", label: "Feature", sortable: true },
              { key: "feature_category", label: "Category", sortable: true },
              { key: "supported", label: "Supported", render: (r) => <Bool value={r.supported} /> },
              { key: "support_note", label: "Notes" },
            ]}
            rows={data.features}
            rowKey={(f) => f.feature_name}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Compare ----------------
const MODEL_ROWS = [
  { key: "status", label: "Status", get: (m) => m.model.status },
  {
    key: "aa_index",
    label: "AA Intelligence Index",
    get: (m) => {
      const fromBenchmarks = m.benchmarks?.find((b) =>
        (b.benchmark_name || "").toLowerCase().includes("artificial analysis intelligence index")
      )?.score_value;
      return m.model.aa_intelligence_index_score ?? fromBenchmarks ?? null;
    },
  },
  { key: "vs_opus", label: "vs Opus 4.8", get: (m) => (m.model.performance_vs_opus_4_8_pct != null ? `${m.model.performance_vs_opus_4_8_pct}%` : null) },
  { key: "vs_gpt", label: "vs GPT-5.6 Sol", get: (m) => (m.model.performance_vs_gpt_5_6_sol_pct != null ? `${m.model.performance_vs_gpt_5_6_sol_pct}%` : null) },
  { key: "vs_fable", label: "vs Fable 5", get: (m) => (m.model.performance_vs_fable_5_pct != null ? `${m.model.performance_vs_fable_5_pct}%` : null) },
  {
    key: "last_updated",
    label: "Data last updated",
    get: (m) => m.benchmarks?.reduce((max, b) => (b.as_of_date && (!max || b.as_of_date > max) ? b.as_of_date : max), null),
  },
];

const PLAN_ROWS = [
  { key: "price", label: "Base price / mo", get: (p) => (p.plan.base_price_usd_monthly != null ? `$${p.plan.base_price_usd_monthly}` : "Custom") },
  { key: "seats", label: "Team seats", get: (p) => p.plan.team_seats },
  { key: "credits", label: "Usage credits", get: (p) => p.plan.usage_credits_summary },
  { key: "best_for", label: "Best suited for", get: (p) => p.plan.best_suited_for },
  { key: "model_access", label: "Model access summary", get: (p) => p.plan.model_access_summary },
  { key: "not_included", label: "Not included", get: (p) => p.plan.not_included },
];

export function ComparePage() {
  const [params] = useSearchParams();
  const type = params.get("type") === "plan" ? "plan" : "model";
  const ids = (params.get("ids") || "").split(",").filter(Boolean);

  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const endpoint = type === "plan" ? "plans" : "models";
    Promise.all(
      ids.map((id) =>
        fetch(`/api/${endpoint}/${id}`).then((r) => {
          if (!r.ok) throw new Error(`Request failed (${r.status})`);
          return r.json();
        })
      )
    )
      .then((results) => { if (!cancelled) setItems(results); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ids.join(",")]);

  const rows = type === "plan" ? PLAN_ROWS : MODEL_ROWS;
  const getName = (item) => (type === "plan" ? item.plan.name : item.model.version_name);
  const getHref = (item) => (type === "plan" ? `/plans/${item.plan.plan_id}` : `/models/${item.model.model_id}`);

  // Union of every benchmark that appears on any compared model, sorted by
  // name — so each benchmark gets exactly one row and scores line up in the
  // same row across columns, instead of each model showing its own
  // independently-ordered list (which made side-by-side comparison hard).
  const benchmarkRows = useMemo(() => {
    if (type !== "model" || !items) return [];
    const byId = new Map();
    items.forEach((item) => {
      (item.benchmarks || []).forEach((b) => {
        if (!byId.has(b.benchmark_id)) {
          byId.set(b.benchmark_id, { benchmark_id: b.benchmark_id, benchmark_name: b.benchmark_name });
        }
      });
    });
    return [...byId.values()].sort((a, b) =>
      (a.benchmark_name || "").localeCompare(b.benchmark_name || "")
    );
  }, [items, type]);

  return (
    <div>
      <h1>Compare {type === "plan" ? "Plans" : "Models"}</h1>
      <Status loading={loading} error={error} />
      {items && items.length === 0 && !loading && (
        <div className="empty">
          Nothing to compare yet. Check items on the {type === "plan" ? "Plans" : "Models"} list, then use the compare tray to get here.
        </div>
      )}
      {items && items.length > 0 && (
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th></th>
                {items.map((item) => (
                  <th key={getHref(item)}>
                    <Link to={getHref(item)}>{getName(item)}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="compare-row-label">{row.label}</td>
                  {items.map((item) => (
                    <td key={getHref(item)}>{row.get(item) ?? "—"}</td>
                  ))}
                </tr>
              ))}
              {type === "model" && benchmarkRows.length > 0 && (
                <tr>
                  <td className="compare-row-label compare-row-section" colSpan={items.length + 1}>
                    Benchmark scores
                  </td>
                </tr>
              )}
              {type === "model" && benchmarkRows.map((bRow) => (
                <tr key={bRow.benchmark_id}>
                  <td className="compare-row-label">
                    <Link to={`/benchmarks/${bRow.benchmark_id}`}>{bRow.benchmark_name}</Link>
                  </td>
                  {items.map((item) => {
                    const match = item.benchmarks?.find((b) => b.benchmark_id === bRow.benchmark_id);
                    return <td key={getHref(item)}>{match?.score_value ?? "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}