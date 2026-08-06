import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { useApi } from "./useApi";
import { Status, CardGrid, DataTable, Bool, KV, PctDiff, sortTableRows, SourceLink, sourceColumn, InfoTip } from "./components";
import { useCompare } from "./compareContext";
import { useSetPageMeta } from "./pageMetaContext";
import { exportToCsv, exportToXlsx } from "./exportUtils";
import {
  PRESETS, PRESET_LABELS, VARIABLES, VARIABLE_META, MIN_WEIGHT, MAX_WEIGHT,
  rankPlans, weightsToFractions,
  createDefaultWeights, setWeight, isLastNonZero,
} from "./rankingUtils";

// ---------------- Dashboard ----------------

// These are raw DB-record counts that are noisy on a landing page (join-table
// row counts, evidence/status bookkeeping, etc.) — matched by substring so we
// don't have to hardcode every exact column name from dataset_metadata.
const DASH_STAT_EXCLUDE = [
  "model_family", "benchmark_source", "benchmark_score", "benchmark",
  "platform_model_record", "platform_feature_record",
  "plan_model_access", "plan_entitlement", "status", "evidence",
  "feature", "subproduct", "brand",
  "use_case_count", "recommendation_policy_count",
  "agent_model_benchmark",
];

// Best-effort mapping from a stat's key name to the section it summarizes,
// so the curated cards can double as nav tiles.
function dashStatHref(key) {
  const k = key.toLowerCase();
  if (k.includes("company") || k.includes("companies")) return "/companies";
  if (k.includes("provider")) return "/providers";
  if (k.includes("agent")) return "/agents";
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
    <div className="dash-panel">
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

// Top plans by Match Score (see RANK_PRESETS / bestModelScore / isFreePlan
// further down this file — reused here so the dashboard preview and the
// full Plans ranking stay in sync). Uses the "balanced" preset since the
// dashboard doesn't expose a preset picker. Free plans, and plans missing a
// price or a scored model, are excluded from ranking entirely.
function TopPlansLeaderboard() {
  const { data, error, loading } = useApi("plans");
  const preset = RANK_PRESETS.balanced;

  const ranked = useMemo(() => {
    const eligible = (data || []).filter(
      (p) => p.base_price_usd_monthly != null && !isFreePlan(p) && bestModelScore(p) != null
    );
    if (eligible.length === 0) return [];
    const scores = eligible.map(bestModelScore);
    const prices = eligible.map((p) => Number(p.base_price_usd_monthly));
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const scoreRange = maxScore - minScore;
    const priceRange = maxPrice - minPrice;

    return eligible
      .map((p) => {
        const modelQuality = scoreRange === 0 ? 1 : (bestModelScore(p) - minScore) / scoreRange;
        const affordability = priceRange === 0 ? 1 : 1 - (Number(p.base_price_usd_monthly) - minPrice) / priceRange;
        const rankScore = preset.w1 * modelQuality + preset.w2 * affordability;
        return { ...p, __rankScore: rankScore };
      })
      .sort((a, b) => b.__rankScore - a.__rankScore)
      .slice(0, 8);
  }, [data]);

  const maxRankScore = ranked.length > 0 ? ranked[0].__rankScore : 1;

  return (
    <div className="dash-panel">
      <div className="dash-panel-head">
        <h2>Top Plans · Match Score</h2>
        <Link to="/plans" className="dash-panel-more">See all →</Link>
      </div>
      <p className="dash-panel-note" title="Match Score blends how capable a plan's best accessible model is and how affordable the plan is, normalized 0-100% against the other eligible plans. Free plans and plans missing a price or a scored model aren't ranked.">
        Blend of model quality &amp; price. Free plans excluded.
      </p>
      <Status loading={loading} error={error} />
      {!loading && !error && ranked.length === 0 && <div className="empty">No rankable plans yet.</div>}
      {ranked.length > 0 && (
        <ol className="leaderboard">
          {ranked.map((p, i) => {
            const pct = maxRankScore > 0 ? Math.max(6, (p.__rankScore / maxRankScore) * 100) : 0;
            return (
              <li key={p.plan_id}>
                <Link to={`/plans/${p.plan_id}`}>
                  <span className="leaderboard-rank">{i + 1}</span>
                  <span className="leaderboard-main">
                    <span className="leaderboard-name-row">
                      <span className="leaderboard-name">{p.brand_name} — {p.name}</span>
                      <span className="leaderboard-score">{Math.round(p.__rankScore * 100)}%</span>
                    </span>
                    <span className="leaderboard-sub">
                      {p.company_name}
                      {p.base_price_usd_monthly != null ? ` · $${p.base_price_usd_monthly}/mo` : ""}
                    </span>
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

// Top agent+model combos by Artificial Analysis Coding Agent Index score.
function TopAgentsLeaderboard() {
  const { data, error, loading } = useApi("agent-benchmarks");

  const top = (data || [])
    .filter((b) => b.coding_agent_index_score != null)
    .sort((a, b) => Number(b.coding_agent_index_score) - Number(a.coding_agent_index_score))
    .slice(0, 8);

  const maxScore = top.length > 0 ? Number(top[0].coding_agent_index_score) : 1;

  return (
    <div className="dash-panel">
      <div className="dash-panel-head">
        <h2>Top Coding Agents · AA Coding Agent Index</h2>
        <Link to="/agents" className="dash-panel-more">See all →</Link>
      </div>
      <Status loading={loading} error={error} />
      {!loading && !error && top.length === 0 && <div className="empty">No scored agents yet.</div>}
      {top.length > 0 && (
        <ol className="leaderboard">
          {top.map((b, i) => {
            const score = Number(b.coding_agent_index_score);
            const pct = maxScore > 0 ? Math.max(6, (score / maxScore) * 100) : 0;
            return (
              <li key={b.agent_model_benchmark_id}>
                <Link to="/agents">
                  <span className="leaderboard-rank">{i + 1}</span>
                  <span className="leaderboard-main">
                    <span className="leaderboard-name-row">
                      <span className="leaderboard-name">{b.model_name_raw}</span>
                      <span className="leaderboard-score">{score}</span>
                    </span>
                    <span className="leaderboard-sub">
                      {b.agent_name}
                      {b.config_label ? ` (${b.config_label})` : ""}
                    </span>
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
      <p className="subtitle">Explore companies, model providers, plans, sub-products, models, coding agents, and benchmarks.</p>

      <DashboardStats />

      <div className="dash-panels dash-panels-cols-2">
        <TopModelsLeaderboard />
        <TopPlansLeaderboard />
        <TopAgentsLeaderboard />
      </div>
      <p className="dash-attribution">
        Intelligence Index and Coding Agent Index scores sourced from{" "}
        <a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer">
          Artificial Analysis
        </a>. Match Score is a blend of model quality and plan price — see the Plans page for details.
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
  const [types, setTypes] = useState([]);

  const allTypes = useMemo(() => {
    const names = new Set((data || []).map((p) => p.type).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    let rows = data || [];
    if (types.length > 0) rows = rows.filter((p) => types.includes(p.type));
    return rows;
  }, [data, types]);

  return (
    <div>
      <h1>Model Providers</h1>
      <p className="subtitle">Entities that provide AI models (listed separately from companies).</p>
      <Status loading={loading} error={error} />
      <div className="filterbar">
        <CheckboxDropdown
          label="Type"
          options={allTypes}
          selected={types}
          onChange={setTypes}
          getKey={(t) => t}
          getLabel={(t) => t}
        />
        {types.length > 0 && (
          <button className="filter-clear" onClick={() => setTypes([])}>
            Clear filters ({types.length})
          </button>
        )}
      </div>
      <CardGrid
        items={filteredRows}
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
  const [statusFilter, setStatusFilter] = useState("");

  useSetPageMeta({
    label: data?.family?.name,
    upTo: data ? { path: `/providers/${data.family.provider_id}`, label: data.family.provider_name } : undefined,
  });

  const allStatuses = useMemo(() => {
    const names = new Set((data?.models || []).map((m) => m.status).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredModels = useMemo(() => {
    let rows = data?.models || [];
    if (statusFilter) rows = rows.filter((m) => m.status === statusFilter);
    return rows;
  }, [data, statusFilter]);

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.family.name}<SourceLink url={data.family.evidence_url} /></h1>
          <p className="subtitle">{data.family.provider_name}{data.family.company_name ? ` · ${data.family.company_name}` : ""}</p>
          {data.family.grouping_note && <div className="detail-block">{data.family.grouping_note}</div>}
          <h2>Models</h2>
          <div className="filterbar">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Any status</option>
              {allStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {statusFilter && (
              <button className="filter-clear" onClick={() => setStatusFilter("")}>Clear filter</button>
            )}
          </div>
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
              sourceColumn((m) => m.evidence_url),
            ]}
            rows={filteredModels}
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
  const [providers, setProviders] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const allProviders = useMemo(() => {
    const names = new Set((data || []).map((m) => m.provider_name).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const allStatuses = useMemo(() => {
    const names = new Set((data || []).map((m) => m.status).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    let rows = data || [];
    if (providers.length > 0) rows = rows.filter((m) => providers.includes(m.provider_name));
    if (statuses.length > 0) rows = rows.filter((m) => statuses.includes(m.status));
    return rows;
  }, [data, providers, statuses]);

  const activeFilterCount = providers.length + statuses.length;

  return (
    <div>
      <h1>All Models</h1>
      <p className="subtitle">Click a model to view its benchmark scores. Check up to 4 to compare, or click a column header to sort.</p>
      <Status loading={loading} error={error} />
      <div className="filterbar">
        <CheckboxDropdown
          label="Provider"
          options={allProviders}
          selected={providers}
          onChange={setProviders}
          getKey={(p) => p}
          getLabel={(p) => p}
        />
        <CheckboxDropdown
          label="Status"
          options={allStatuses}
          selected={statuses}
          onChange={setStatuses}
          getKey={(s) => s}
          getLabel={(s) => s}
        />
        {activeFilterCount > 0 && (
          <button className="filter-clear" onClick={() => { setProviders([]); setStatuses([]); }}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>
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
          sourceColumn((m) => m.evidence_url),
        ]}
        rows={filteredRows}
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
  const [category, setCategory] = useState("");

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

  const allCategories = useMemo(() => {
    const names = new Set((data?.benchmarks || []).map((b) => b.benchmark_category).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredBenchmarks = useMemo(() => {
    let rows = data?.benchmarks || [];
    if (category) rows = rows.filter((b) => b.benchmark_category === category);
    return rows;
  }, [data, category]);

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <div className="detail-header-row">
            <div>
              <h1>{data.model.version_name}<SourceLink url={data.model.evidence_url} /></h1>
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
              ["vs Opus 4.8", data.model.aa_v4_1_vs_opus_4_8_pct != null ? <PctDiff value={data.model.aa_v4_1_vs_opus_4_8_pct} /> : null],
              ["vs GPT-5.6 Sol", data.model.aa_v4_1_vs_gpt_5_6_sol_pct != null ? <PctDiff value={data.model.aa_v4_1_vs_gpt_5_6_sol_pct} /> : null],
              ["vs Fable 5", data.model.aa_v4_1_vs_fable_5_pct != null ? <PctDiff value={data.model.aa_v4_1_vs_fable_5_pct} /> : null],
              ["Data last updated", lastUpdated],
              ["Underlying model", data.model.underlying_model_summary, data.model.underlying_model_evidence_url],
              ["Source", data.model.evidence_url ? "View evidence" : null, data.model.evidence_url],
            ]} />
          </div>
          <h2>Benchmark Scores</h2>
          <div className="filterbar">
            <select
              className="filter-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Any category</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {category && (
              <button className="filter-clear" onClick={() => setCategory("")}>Clear filter</button>
            )}
          </div>
          <DataTable
            columns={[
              { key: "benchmark_name", label: "Benchmark", sortable: true },
              { key: "benchmark_source_name", label: "Publisher", sortable: true },
              {
                key: "score_value",
                label: "Score",
                sortable: true,
                sortValue: (r) => (r.score_value != null ? Number(r.score_value) : null),
                render: (r) => r.score_value ?? "—",
              },
              { key: "rank", label: "Rank" },
              { key: "as_of_date", label: "As of", sortable: true },
              sourceColumn((r) => r.evidence_url),
            ]}
            rows={filteredBenchmarks}
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
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);

  const allCategories = useMemo(() => {
    const names = new Set((data || []).map((b) => b.category).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const allSources = useMemo(() => {
    const names = new Set((data || []).map((b) => b.source_name).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    let rows = data || [];
    if (categories.length > 0) rows = rows.filter((b) => categories.includes(b.category));
    if (sources.length > 0) rows = rows.filter((b) => sources.includes(b.source_name));
    return rows;
  }, [data, categories, sources]);

  const activeFilterCount = categories.length + sources.length;

  return (
    <div>
      <h1>All Benchmarks</h1>
      <p className="subtitle">Click a column header to sort.</p>
      <Status loading={loading} error={error} />
      <div className="filterbar">
        <CheckboxDropdown
          label="Category"
          options={allCategories}
          selected={categories}
          onChange={setCategories}
          getKey={(c) => c}
          getLabel={(c) => c}
        />
        <CheckboxDropdown
          label="Source"
          options={allSources}
          selected={sources}
          onChange={setSources}
          getKey={(s) => s}
          getLabel={(s) => s}
        />
        {activeFilterCount > 0 && (
          <button className="filter-clear" onClick={() => { setCategories([]); setSources([]); }}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>
      <DataTable
        columns={[
          { key: "name", label: "Benchmark", sortable: true },
          { key: "category", label: "Category", sortable: true },
          { key: "source_name", label: "Source", sortable: true },
          { key: "scale_type", label: "Scale", sortable: true },
          { key: "unit_label", label: "Unit" },
          sourceColumn((b) => b.definition_evidence_url),
        ]}
        rows={filteredRows}
        rowKey={(b) => b.benchmark_id}
        rowHref={(b) => `/benchmarks/${b.benchmark_id}`}
      />
    </div>
  );
}

export function BenchmarkDetail() {
  const { id } = useParams();
  const { data, error, loading } = useApi(`benchmarks/${id}`);
  const [provider, setProvider] = useState("");

  useSetPageMeta({
    label: data?.benchmark?.name,
    upTo: { path: "/benchmarks", label: "Benchmarks" },
  });

  const allProviders = useMemo(() => {
    const names = new Set((data?.scores || []).map((s) => s.provider_name).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredScores = useMemo(() => {
    let rows = data?.scores || [];
    if (provider) rows = rows.filter((s) => s.provider_name === provider);
    return rows;
  }, [data, provider]);

  return (
    <div>
      <Status loading={loading} error={error} />
      {data && (
        <>
          <h1>{data.benchmark.name}<SourceLink url={data.benchmark.definition_evidence_url} /></h1>
          <p className="subtitle">{data.benchmark.category} · {data.benchmark.description}</p>
          <h2>Scores by Model</h2>
          <div className="filterbar">
            <select
              className="filter-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="">Any provider</option>
              {allProviders.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {provider && (
              <button className="filter-clear" onClick={() => setProvider("")}>Clear filter</button>
            )}
          </div>
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
              sourceColumn((r) => r.evidence_url),
            ]}
            rows={filteredScores}
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
            getHref={(s) => `/products/${s.subproduct_id}`}
          />
          <h2>Plans</h2>
          <p className="subtitle">Check up to 4 to compare plans.</p>
          <CardGrid
            items={[...(data.plans || [])].sort((a, b) => {
              const av = a.base_price_usd_monthly != null ? Number(a.base_price_usd_monthly) : null;
              const bv = b.base_price_usd_monthly != null ? Number(b.base_price_usd_monthly) : null;
              if (av == null && bv == null) return 0;
              if (av == null) return 1; // custom/null pricing sorts last
              if (bv == null) return -1;
              return av - bv;
            })}
            getKey={(p) => p.plan_id}
            getTitle={(p) => p.name}
            getMeta={(p) => (isFreePlan(p) ? "Free" : p.base_price_usd_monthly != null ? `$${p.base_price_usd_monthly}/mo` : "Custom")}
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
                  { key: "model_name", label: "Model" },
                  { key: "family_name", label: "Model Family" },
                  { key: "provider_name", label: "Provider" },
                  { key: "directly_selectable", label: "Directly Selectable", render: (m) => <Bool value={m.directly_selectable} /> },
                  { key: "counts_as_current", label: "Counts as Current", render: (m) => <Bool value={m.counts_as_current} /> },
                ]}
                rows={data.models}
                rowKey={(m) => `${m.platform_id}-${m.model_id}`}
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

// ---------------- Coding Agents ----------------
// Model-centric on purpose (per request): one flat, sortable/filterable
// table of agent-on-model results — no agent -> models drill-down page.
// Each row is a single agent+model(+config) combo.
const AGENT_SCORE_COLUMNS = [
  {
    key: "coding_agent_index_score",
    label: "AA Coding Agent Index",
    hint: "Artificial Analysis Coding Agent Index — higher is better.",
  },
  {
    key: "deepswe_score",
    label: "DeepSWE",
    hint: "DeepSWE benchmark score — higher is better.",
  },
  {
    key: "terminal_bench_v2_score",
    label: "Terminal-Bench v2",
    hint: "Terminal-Bench v2 score — higher is better.",
  },
  {
    key: "swe_atlas_qna_score",
    label: "SWE-Atlas-QnA",
    hint: "SWE-Atlas-QnA score — higher is better.",
  },
];

export function AgentsBrowse() {
  const { data, error, loading } = useApi("agent-benchmarks");
  const [agentNames, setAgentNames] = useState([]);
  const [families, setFamilies] = useState([]);
  const [sort, setSort] = useState({ key: "coding_agent_index_score", dir: "desc" });

  const allAgentNames = useMemo(() => {
    const names = new Set((data || []).map((b) => b.agent_name).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const allFamilies = useMemo(() => {
    const names = new Set((data || []).map((b) => b.model_family_name).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    let rows = data || [];
    if (agentNames.length > 0) rows = rows.filter((b) => agentNames.includes(b.agent_name));
    if (families.length > 0) rows = rows.filter((b) => families.includes(b.model_family_name));
    return rows;
  }, [data, agentNames, families]);

  const activeFilterCount = agentNames.length + families.length;

  const columns = useMemo(
    () => [
      {
        key: "model_name_raw",
        label: "Model",
        sortable: true,
        render: (b) => (b.model_family_id ? <Link to={`/families/${b.model_family_id}`}>{b.model_name_raw}</Link> : b.model_name_raw),
      },
      { key: "provider_name", label: "Provider", sortable: true },
      { key: "agent_name", label: "Agent", sortable: true },
      { key: "config_label", label: "Config", render: (b) => b.config_label || "—" },
      ...AGENT_SCORE_COLUMNS.map((c) => ({
        key: c.key,
        label: (
          <>
            {c.label}
            <InfoTip text={c.hint} />
          </>
        ),
        sortable: true,
        sortValue: (b) => (b[c.key] != null ? Number(b[c.key]) : null),
        render: (b) => b[c.key] ?? "—",
      })),
      { key: "as_of_date", label: "As of", sortable: true },
      sourceColumn((b) => b.evidence_url),
    ],
    []
  );

  return (
    <div>
      <h1>Coding Agents</h1>
      <p className="subtitle">
        How coding agents like Claude Code, Codex, and Kimi Code CLI perform on each model they support — one
        row per agent+model(+config) combo. Scores: Artificial Analysis Coding Agent Index, DeepSWE,
        Terminal-Bench v2, and SWE-Atlas-QnA.
      </p>
      <Status loading={loading} error={error} />
      <div className="filterbar">
        <CheckboxDropdown
          label="Agent"
          options={allAgentNames}
          selected={agentNames}
          onChange={setAgentNames}
          getKey={(a) => a}
          getLabel={(a) => a}
        />
        <CheckboxDropdown
          label="Model family"
          options={allFamilies}
          selected={families}
          onChange={setFamilies}
          getKey={(f) => f}
          getLabel={(f) => f}
        />
        {activeFilterCount > 0 && (
          <button className="filter-clear" onClick={() => { setAgentNames([]); setFamilies([]); }}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>
      {!loading && !error && filteredRows.length === 0 && <div className="empty">No results match the current filters.</div>}
      {filteredRows.length > 0 && (
        <DataTable
          columns={columns}
          rows={filteredRows}
          rowKey={(b) => b.agent_model_benchmark_id}
          sort={sort}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}

// ---------------- Plans ----------------

// Heuristic only (per request) — plan `audience` is free text, not an enum,
// so this maps common wording to a coarse Individual/Organization split.
const AUDIENCE_ORG_WORDS = ["team", "business", "enterprise", "organization", "org", "company", "commercial", "group"];
const AUDIENCE_INDIVIDUAL_WORDS = ["individual", "personal", "pro", "free", "solo", "consumer", "student"];
function audienceCategory(raw) {
  if (!raw) return "Unspecified";
  const t = raw.toLowerCase();
  if (AUDIENCE_ORG_WORDS.some((w) => t.includes(w))) return "Organization";
  if (AUDIENCE_INDIVIDUAL_WORDS.some((w) => t.includes(w))) return "Individual";
  return "Unspecified";
}

// Custom/contact-sales pricing counts as Paid, not Free (per request) — only
// an explicit $0 price is Free.
function isFreePlan(p) {
  if (p.base_price_usd_monthly == null) return false; // null/"Custom" pricing is Paid, not Free
  return Number(p.base_price_usd_monthly) === 0;
}

function CheckboxDropdown({ label, options, selected, onChange, getKey, getLabel }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const toggleValue = (key) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="col-picker" ref={boxRef}>
      <button className="filter-btn" onClick={() => setOpen((o) => !o)}>
        {label} {selected.length > 0 ? `(${selected.length})` : ""}
      </button>
      {open && (
        <div className="col-picker-panel">
          {options.length === 0 && <div className="col-picker-empty">Nothing to filter on.</div>}
          {options.map((opt) => {
            const key = getKey(opt);
            return (
              <label className="col-picker-item" key={key}>
                <input type="checkbox" checked={selected.includes(key)} onChange={() => toggleValue(key)} />
                <span>{getLabel(opt)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColumnPicker({ baseColumns, hiddenBase, onToggleBase, allFeatures, selectedFeatures, onToggleFeature, onReset }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const optionalBaseColumns = baseColumns.filter((c) => c.optional);
  const shownCount = optionalBaseColumns.filter((c) => !hiddenBase.includes(c.key)).length + selectedFeatures.length;
  const canReset = hiddenBase.length > 0 || selectedFeatures.length > 0;

  return (
    <div className="col-picker" ref={boxRef}>
      <button className="col-picker-btn" onClick={() => setOpen((o) => !o)}>
        Columns {shownCount > 0 ? `(+${shownCount})` : ""}
      </button>
      {open && (
        <div className="col-picker-panel col-picker-panel-wide">
          <div className="col-picker-section-row">
            <div className="col-picker-section">Table columns</div>
            <button className="col-picker-reset" onClick={onReset} disabled={!canReset}>Reset</button>
          </div>
          {optionalBaseColumns.length === 0 && <div className="col-picker-empty">No optional columns.</div>}
          {optionalBaseColumns.map((c) => (
            <label className="col-picker-item" key={c.key}>
              <input
                type="checkbox"
                checked={!hiddenBase.includes(c.key)}
                onChange={() => onToggleBase(c.key)}
              />
              <span>{c.label}</span>
            </label>
          ))}
          <div className="col-picker-section">Feature columns</div>
          {allFeatures.length === 0 && <div className="col-picker-empty">No features found.</div>}
          {allFeatures.map((f) => (
            <label className="col-picker-item" key={f.feature_name}>
              <input
                type="checkbox"
                checked={selectedFeatures.includes(f.feature_name)}
                onChange={() => onToggleFeature(f.feature_name)}
              />
              <span>{f.feature_name}</span>
              {f.feature_category && <span className="col-picker-cat">{f.feature_category}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_FILTERS = {
  companies: [],
  audiences: [],
  freePaid: "all", // 'all' | 'free' | 'paid'
  feature: "",
  family: "",
};

// Weighted plan ranking: score = w1*model_quality + w2*affordability.
// Only plans with a known price and at least one scored model are ranked;
// everything else is excluded rather than scored as 0, since a missing
// signal isn't the same as a bad one.
const RANK_PRESETS = {
  value: { label: "Best Value", w1: 0.4, w2: 0.6 },
  balanced: { label: "Balanced", w1: 0.5, w2: 0.5 },
  capability: { label: "Best Capability", w1: 0.8, w2: 0.2 },
};

function bestModelScore(p) {
  const s = p.top_models?.[0]?.score;
  return s != null ? Number(s) : null;
}

export function PlansBrowse() {
  const { data, error, loading } = useApi("plans");
  const { toggle, isSelected } = useCompare();
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [hiddenBase, setHiddenBase] = useState([]);
  const [sort, setSort] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const toggleFeatureCol = (name) => {
    setSelectedFeatures((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };
  const toggleBaseCol = (key) => {
    setHiddenBase((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  // Every distinct feature name/category seen across any plan — powers the
  // column picker and the "has feature" filter. Plans that don't list a
  // given feature simply show "—" for it rather than a false "No".
  const allFeatures = useMemo(() => {
    const byName = new Map();
    (data || []).forEach((p) => {
      (p.features || []).forEach((f) => {
        if (!byName.has(f.feature_name)) byName.set(f.feature_name, f);
      });
    });
    return [...byName.values()].sort((a, b) => a.feature_name.localeCompare(b.feature_name));
  }, [data]);

  const allCompanies = useMemo(() => {
    const names = new Set((data || []).map((p) => p.company_name).filter(Boolean));
    return [...names].sort();
  }, [data]);

  const allFamilies = useMemo(() => {
    const names = new Set();
    (data || []).forEach((p) => (p.accessible_families || []).forEach((f) => names.add(f)));
    return [...names].sort();
  }, [data]);

  const filteredRows = useMemo(() => {
    let rows = data || [];
    if (filters.companies.length > 0) rows = rows.filter((p) => filters.companies.includes(p.company_name));
    if (filters.audiences.length > 0) rows = rows.filter((p) => filters.audiences.includes(audienceCategory(p.audience)));
    if (filters.freePaid === "free") rows = rows.filter(isFreePlan);
    if (filters.freePaid === "paid") rows = rows.filter((p) => !isFreePlan(p));
    if (filters.feature) {
      rows = rows.filter((p) => p.features?.some((f) => f.feature_name === filters.feature && f.supported));
    }
    if (filters.family) {
      rows = rows.filter((p) => (p.accessible_families || []).includes(filters.family));
    }
    return rows;
  }, [data, filters]);

  const activeFilterCount =
    filters.companies.length +
    filters.audiences.length +
    (filters.freePaid !== "all" ? 1 : 0) +
    (filters.feature ? 1 : 0) +
    (filters.family ? 1 : 0);

  const baseColumnDefs = useMemo(
    () => [
      {
        key: "company_name",
        label: "Company",
        optional: false,
        sortable: true,
        exportValue: (p) => p.company_name || "",
      },
      {
        key: "name",
        label: "Plan",
        optional: false,
        sortable: true,
        sortValue: (p) => p.brand_name || "",
        render: (p) => (
          <>
            {p.brand_name}
            <span className="plan-cell-brand"> — {p.name}</span>
          </>
        ),
        exportValue: (p) => `${p.brand_name} — ${p.name}`,
      },
      {
        key: "audience_category",
        label: "Audience",
        optional: true,
        sortable: true,
        sortValue: (p) => audienceCategory(p.audience),
        render: (p) => <span title={p.audience || ""}>{audienceCategory(p.audience)}</span>,
        exportValue: (p) => audienceCategory(p.audience),
      },
      {
        key: "base_price_usd_monthly",
        label: "Price / seat / mo",
        optional: true,
        sortable: true,
        sortValue: (p) => (p.base_price_usd_monthly != null ? Number(p.base_price_usd_monthly) : null),
        render: (p) => (isFreePlan(p) ? "Free" : p.base_price_usd_monthly != null ? `$${p.base_price_usd_monthly}` : "Custom"),
        exportValue: (p) => (isFreePlan(p) ? "Free" : p.base_price_usd_monthly != null ? p.base_price_usd_monthly : "Custom"),
      },
      {
        key: "free_or_paid",
        label: "Free / Paid",
        optional: true,
        sortable: true,
        sortValue: (p) => (isFreePlan(p) ? 0 : 1),
        render: (p) => <span className={`badge ${isFreePlan(p) ? "yes" : "no"}`}>{isFreePlan(p) ? "Free" : "Paid"}</span>,
        exportValue: (p) => (isFreePlan(p) ? "Free" : "Paid"),
      },
      {
        key: "top_models",
        label: "Top Models · AA Index",
        optional: true,
        sortValue: (p) => p.top_models?.[0]?.score ?? null,
        render: (p) => (p.top_models?.length > 0 ? p.top_models.map((m) => m.version_name).join(", ") : "—"),
        exportValue: (p) => (p.top_models?.length > 0 ? p.top_models.map((m) => m.version_name).join("; ") : ""),
      },
      {
        key: "best_model",
        label: "Best Model",
        optional: true,
        sortable: true,
        sortValue: (p) => p.top_models?.[0]?.score ?? null,
        render: (p) => {
          const best = p.top_models?.[0];
          return best ? `${best.version_name} (${best.score ?? "—"})` : "—";
        },
        exportValue: (p) => {
          const best = p.top_models?.[0];
          return best ? `${best.version_name} (${best.score ?? "—"})` : "";
        },
      },
      {
        key: "evidence_url",
        label: "Source",
        optional: true,
        render: (p) =>
          p.evidence_url ? (
            <a className="evidence-link" href={p.evidence_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              Source
            </a>
          ) : (
            "—"
          ),
        exportValue: (p) => p.evidence_url || "",
      },
    ],
    []
  );

  const columns = useMemo(() => {
    const visibleBase = baseColumnDefs.filter((c) => !c.optional || !hiddenBase.includes(c.key));
    const featureCols = selectedFeatures.map((name) => ({
      key: `feature:${name}`,
      label: name,
      sortable: true,
      sortValue: (p) => {
        const match = p.features?.find((f) => f.feature_name === name);
        if (!match) return 0;
        return match.supported ? 2 : 1;
      },
      render: (p) => {
        const match = p.features?.find((f) => f.feature_name === name);
        return match ? <Bool value={match.supported} /> : "—";
      },
      exportValue: (p) => {
        const match = p.features?.find((f) => f.feature_name === name);
        if (!match) return "";
        return match.supported ? "Yes" : "No";
      },
    }));
    return [...visibleBase, ...featureCols];
  }, [baseColumnDefs, hiddenBase, selectedFeatures]);

  const sortedRows = useMemo(
    () => sortTableRows(filteredRows, columns, sort),
    [filteredRows, columns, sort]
  );

  const handleExportCsv = () => exportToCsv(columns, sortedRows, "plans.csv");
  const handleExportXlsx = () => exportToXlsx(columns, sortedRows, "plans.xlsx");

  return (
    <div>
      <h1>All Plans</h1>
      <p className="subtitle">Click a plan for pricing details, model access, and features. Check up to 4 to compare.</p>

      <div className="filterbar">
        <CheckboxDropdown
          label="Company"
          options={allCompanies}
          selected={filters.companies}
          onChange={(v) => setFilters((f) => ({ ...f, companies: v }))}
          getKey={(c) => c}
          getLabel={(c) => c}
        />
        <CheckboxDropdown
          label="Audience"
          options={["Individual", "Organization", "Unspecified"]}
          selected={filters.audiences}
          onChange={(v) => setFilters((f) => ({ ...f, audiences: v }))}
          getKey={(a) => a}
          getLabel={(a) => a}
        />
        <select
          className="filter-select"
          value={filters.freePaid}
          onChange={(e) => setFilters((f) => ({ ...f, freePaid: e.target.value }))}
        >
          <option value="all">Free & Paid</option>
          <option value="free">Free only</option>
          <option value="paid">Paid only</option>
        </select>
        <select
          className="filter-select"
          value={filters.feature}
          onChange={(e) => setFilters((f) => ({ ...f, feature: e.target.value }))}
        >
          <option value="">Any feature</option>
          {allFeatures.map((f) => (
            <option key={f.feature_name} value={f.feature_name}>{f.feature_name}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.family}
          onChange={(e) => setFilters((f) => ({ ...f, family: e.target.value }))}
        >
          <option value="">Any model family</option>
          {allFamilies.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {activeFilterCount > 0 && (
          <button className="filter-clear" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      <div className="plans-toolbar">
        <ColumnPicker
          baseColumns={baseColumnDefs}
          hiddenBase={hiddenBase}
          onToggleBase={toggleBaseCol}
          allFeatures={allFeatures}
          selectedFeatures={selectedFeatures}
          onToggleFeature={toggleFeatureCol}
          onReset={() => { setHiddenBase([]); setSelectedFeatures([]); }}
        />
        <div className="plans-toolbar-export">
          <button className="export-btn" onClick={handleExportCsv} disabled={sortedRows.length === 0}>
            Export CSV
          </button>
          <button className="export-btn" onClick={handleExportXlsx} disabled={sortedRows.length === 0}>
            Export Excel
          </button>
        </div>
      </div>

      <Status loading={loading} error={error} />
      {!loading && !error && data && filteredRows.length === 0 && (
        <div className="empty">No plans match the current filters.</div>
      )}
      {filteredRows.length > 0 && (
        <DataTable
          columns={columns}
          rows={filteredRows}
          rowKey={(p) => p.plan_id}
          rowHref={(p) => `/plans/${p.plan_id}`}
          sort={sort}
          onSortChange={setSort}
          selectable={{
            isSelected: (p) => isSelected("plan", p.plan_id),
            onToggle: (p) => toggle({ type: "plan", id: p.plan_id, label: p.name }),
          }}
        />
      )}
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
              <h1>{data.plan.name}<SourceLink url={data.plan.evidence_url} /></h1>
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
              ["Source", data.plan.evidence_url ? "View evidence" : null, data.plan.evidence_url],
            ]} />
          </div>

          <h2>Model Access (plan_model_access)</h2>
          <p className="subtitle">All models this plan grants access to. Click a row to see the model's details and benchmarks.</p>
          <DataTable
            columns={[
              { key: "model_name", label: "Model", sortable: true },
              { key: "model_family_name", label: "Model Family", sortable: true },
              { key: "provider_name", label: "Provider", sortable: true },
              { key: "status_label", label: "Status", sortable: true },
              { key: "directly_selectable", label: "Directly selectable", render: (r) => <Bool value={r.directly_selectable} /> },
              sourceColumn((r) => r.evidence_url),
            ]}
            rows={data.modelAccess || []}
            rowKey={(m) => m.plan_model_access_id}
            rowHref={(m) => `/models/${m.model_id}`}
          />

          <h2>Features (plan_features)</h2>
          <DataTable
            columns={[
              { key: "feature_name", label: "Feature", sortable: true },
              { key: "feature_category", label: "Category", sortable: true },
              { key: "supported", label: "Supported", render: (r) => <Bool value={r.supported} /> },
              { key: "support_note", label: "Notes" },
              sourceColumn((r) => r.evidence_url),
            ]}
            rows={data.features}
            rowKey={(f) => f.feature_name}
          />
        </>
      )}
    </div>
  );
}

// ---------------- Rankings ----------------
// Client-side-only ranking tool: hard-filters plans by required features,
// then scores the remaining set with a weighted blend (see rankingUtils.js
// for the actual math — kept out of this component so it's unit-testable on
// its own). Nothing here persists — weights and the feature filter reset on
// reload/navigation by design.

function formatUsd(n, digits = 2) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  return `$${num.toFixed(digits)}`;
}

export function Rankings() {
  const { data, error, loading } = useApi("plans");
  const [selectedAudiences, setSelectedAudiences] = useState([]);
  const [showFormula, setShowFormula] = useState(false);

  const [weights, setWeights] = useState(createDefaultWeights);
  const [activePreset, setActivePreset] = useState("best_value"); // preset key | "custom"

  const audienceOptions = useMemo(() => {
    const cats = new Set((data || []).map((p) => audienceCategory(p.audience)));
    return [...cats].sort().map((c) => ({ audience_category: c }));
  }, [data]);

  const selectPreset = (key) => {
    setActivePreset(key);
    setWeights(PRESETS[key]);
  };

  const handleWeightChange = (key, newValue) => {
    setActivePreset("custom");
    setWeights((prev) => setWeight(prev, key, newValue));
  };

  const fractions = useMemo(() => weightsToFractions(weights), [weights]);
  const totalWeight = useMemo(
    () => VARIABLES.reduce((s, k) => s + (Number(weights[k]) || 0), 0),
    [weights]
  );

  // Base candidate set: excludes free plans entirely (per request — a $0
  // plan doesn't meaningfully compete on price/cost-per-task), and applies
  // the individual/organization filter.
  const filteredPlans = useMemo(() => {
    return (data || []).filter((p) => {
      if (isFreePlan(p)) return false;
      if (selectedAudiences.length > 0 && !selectedAudiences.includes(audienceCategory(p.audience))) return false;
      return true;
    });
  }, [data, selectedAudiences]);

  // Normalization is recomputed against filteredPlans (not the full plan
  // set) every time the filter changes, per spec — and live on every
  // dropdown change since `fractions` is derived straight from state.
  const rankedRows = useMemo(
    () => rankPlans(filteredPlans, fractions).map((p, i) => ({ ...p, __rank: i + 1 })),
    [filteredPlans, fractions]
  );

  const columns = useMemo(() => {
    const base = [
      { key: "rank", label: "#", render: (p) => p.__rank },
      {
        key: "name",
        label: "Plan",
        render: (p) => (
          <>
            {p.brand_name}
            <span className="plan-cell-brand"> — {p.name}</span>
          </>
        ),
      },
      { key: "company_name", label: "Company", render: (p) => p.company_name || "—" },
      {
        key: "price",
        label: (
          <>
            Price / mo
            <InfoTip text="The plan's base monthly price. 'Custom' means the provider doesn't publish a fixed price (e.g. contact-sales enterprise pricing) — these plans still count as ranked, since only $0 plans are treated as Free and excluded." />
          </>
        ),
        render: (p) => (p.base_price_usd_monthly != null ? formatUsd(p.base_price_usd_monthly, 0) : "Custom"),
      },
      {
        key: "quality",
        label: (
          <>
            Quality score
            <InfoTip text="The AA Intelligence Index score of the single best model this plan grants access to (not an average across all accessible models). Higher is better." />
          </>
        ),
        render: (p) =>
          p.__noModelData ? (
            <span className="badge no" title="This plan has no accessible model with a scored quality index.">
              No model data
            </span>
          ) : (
            p.best_model_quality_score
          ),
      },
      {
        key: "cost_per_task",
        label: (
          <>
            Cost / task
            <InfoTip text="Estimated cost per task (USD) for that same best-accessible model — i.e. the model behind the Quality score column, not a plan-wide average. Lower is better. Plans where this is missing or $0 are ranked below plans that have real cost data." />
          </>
        ),
        render: (p) =>
          p.__noCostData ? (
            <span className="badge no" title="This plan's best accessible model has no cost-per-task data (missing or $0), so it's ranked at the bottom rather than scored.">
              No cost data
            </span>
          ) : p.best_model_cost_per_task_usd != null ? (
            formatUsd(p.best_model_cost_per_task_usd, 4)
          ) : (
            "—"
          ),
      },
      {
        key: "rank_score",
        label: (
          <>
            Rank score
            <InfoTip text="The final weighted blend (0–1, higher is better) of price, quality, and cost-per-task, using the weights set below. See 'How is Rank score calculated?' for the exact formula." />
          </>
        ),
        render: (p) => (p.__rankScore != null ? p.__rankScore.toFixed(3) : "—"),
      },
    ];
    return base;
  }, []);

  return (
    <div>
      <h1>Rankings</h1>
      <p className="subtitle">
        Set how much each factor matters below. Free plans are excluded from ranking. Weights are
        client-side only and reset when you leave this page.
      </p>

      <div className="filterbar">
        <CheckboxDropdown
          label="Individual / Organization"
          options={audienceOptions}
          selected={selectedAudiences}
          onChange={setSelectedAudiences}
          getKey={(a) => a.audience_category}
          getLabel={(a) => a.audience_category}
        />
        {selectedAudiences.length > 0 && (
          <button className="filter-clear" onClick={() => setSelectedAudiences([])}>
            Clear audience ({selectedAudiences.length})
          </button>
        )}
      </div>

      <div className="preset-tabs">
        {Object.keys(PRESETS).map((key) => (
          <button
            key={key}
            className={`preset-tab ${activePreset === key ? "active" : ""}`}
            onClick={() => selectPreset(key)}
          >
            {PRESET_LABELS[key]}
          </button>
        ))}
        <span className={`preset-tab preset-tab-custom ${activePreset === "custom" ? "active" : ""}`}>Custom</span>
      </div>

      <div className="importance-grid">
        {VARIABLES.map((key) => {
          const meta = VARIABLE_META[key];
          const currentValue = Number(weights[key]) || 0;
          const lastNonZero = isLastNonZero(weights, key);
          const pct = totalWeight > 0 ? Math.round((currentValue / totalWeight) * 100) : 0;
          const title = lastNonZero ? "At least one variable must stay above 0." : undefined;
          return (
            <label className="importance-field" key={key} title={title}>
              <span className="importance-label">
                {meta.label} <span className="importance-hint">({meta.hint})</span>
              </span>
              <span className="importance-input-row">
                <input
                  type="number"
                  min={MIN_WEIGHT}
                  max={MAX_WEIGHT}
                  step={1}
                  value={currentValue}
                  onChange={(e) => handleWeightChange(key, e.target.value)}
                />
                <span className="importance-pct">{pct}%</span>
              </span>
            </label>
          );
        })}
      </div>

      <button type="button" className="rank-formula-trigger" onClick={() => setShowFormula(true)}>
        How is Rank score calculated?
      </button>
      {showFormula && (
        <div className="rank-formula-overlay" onClick={() => setShowFormula(false)}>
          <div className="rank-formula-popup" onClick={(e) => e.stopPropagation()}>
            <div className="rank-formula-popup-head">
              <h3>How Rank score is calculated</h3>
              <button type="button" className="rank-formula-close" onClick={() => setShowFormula(false)} aria-label="Close">×</button>
            </div>
            <div className="rank-formula-body">
              <p className="rank-formula-eq">
                Rank score = w<sub>price</sub>&nbsp;×&nbsp;priceScore + w<sub>quality</sub>&nbsp;×&nbsp;qualityScore
                {" "}+ w<sub>cost</sub>&nbsp;×&nbsp;costScore
              </p>
              <ul>
                <li>
                  Each <strong>weight</strong> (w) is the value you set for that variable, divided by the sum of
                  all three values — e.g. price 8, quality 5, cost 8 (sum 21) gives price a weight of
                  8/21 ≈ 38%.
                </li>
                <li>
                  <strong>priceScore</strong>, <strong>qualityScore</strong>, and <strong>costScore</strong> are
                  each normalized 0–1 (min–max) against the other eligible plans shown here — price and cost are
                  inverted so cheaper scores higher.
                </li>
                <li>
                  Plans missing a scored model are excluded from scoring and listed at the bottom. Plans with a
                  scored model but no usable cost-per-task figure (missing or $0) are also pushed to the bottom,
                  ranked above the no-model-data group.
                </li>
                <li>Free plans are excluded from ranking entirely.</li>
              </ul>
              <p className="rank-formula-note">
                Current weights: {VARIABLES.map((k) => `${VARIABLE_META[k].label} ${Math.round((fractions[k] || 0) * 100)}%`).join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}

      <Status loading={loading} error={error} />
      {!loading && !error && data && rankedRows.length === 0 && (
        <div className="empty">No plans match the current filters.</div>
      )}
      {rankedRows.length > 0 && (
        <DataTable columns={columns} rows={rankedRows} rowKey={(p) => p.plan_id} rowHref={(p) => `/plans/${p.plan_id}`} />
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
  { key: "vs_opus", label: "vs Opus 4.8", get: (m) => (m.model.aa_v4_1_vs_opus_4_8_pct != null ? <PctDiff value={m.model.aa_v4_1_vs_opus_4_8_pct} /> : null) },
  { key: "vs_gpt", label: "vs GPT-5.6 Sol", get: (m) => (m.model.aa_v4_1_vs_gpt_5_6_sol_pct != null ? <PctDiff value={m.model.aa_v4_1_vs_gpt_5_6_sol_pct} /> : null) },
  { key: "vs_fable", label: "vs Fable 5", get: (m) => (m.model.aa_v4_1_vs_fable_5_pct != null ? <PctDiff value={m.model.aa_v4_1_vs_fable_5_pct} /> : null) },
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