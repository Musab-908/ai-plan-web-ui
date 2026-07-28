import { Link, useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useApi } from "./useApi";
import { Status, CardGrid, DataTable, Bool, KV } from "./components";
import { useCompare } from "./compareContext";
import { useSetPageMeta } from "./pageMetaContext";

// ---------------- Dashboard ----------------
export function Dashboard() {
  const { data, error, loading } = useApi("dashboard");
  return (
    <div>
      <h1>AI Model & Plan Catalog</h1>
      <p className="subtitle">Explore companies, model providers, plans, sub-products, models and benchmarks.</p>

      <div className="nav-tiles">
        <Link className="nav-tile" to="/companies">Companies</Link>
        <Link className="nav-tile" to="/providers">Model Providers</Link>
        <Link className="nav-tile" to="/models">Browse all Models</Link>
        <Link className="nav-tile" to="/benchmarks">Browse all Benchmarks</Link>
      </div>

      <Status loading={loading} error={error} />
      {data && (
        <div className="dash-grid">
          {Object.entries(data).filter(([k]) => k !== "database_checked_on").map(([k, v]) => (
            <div className="dash-card" key={k}>
              <div className="num">{v}</div>
              <div className="label">{k.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      )}
      {data?.database_checked_on && (
        <p className="dash-updated">Catalog data checked on {data.database_checked_on}</p>
      )}
    </div>
  );
}

// ---------------- Companies ----------------
export function Companies() {
  const { data, error, loading } = useApi("companies");
  return (
    <div>
      <h1>Companies</h1>
      <p className="subtitle">Organizations in the catalog (listed separately from model providers).</p>
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
              ["Notes", data.model.notes],
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
              {type === "model" && (
                <tr>
                  <td className="compare-row-label">Benchmark scores</td>
                  {items.map((item) => (
                    <td key={getHref(item)}>
                      {item.benchmarks?.length > 0 ? (
                        <ul className="compare-benchmark-list">
                          {item.benchmarks.map((b) => (
                            <li key={b.benchmark_id}>
                              <Link to={`/benchmarks/${b.benchmark_id}`}>{b.benchmark_name}</Link>: {b.score_value ?? "—"}
                            </li>
                          ))}
                        </ul>
                      ) : "—"}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}