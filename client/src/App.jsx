import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  Dashboard, Companies, CompanyDetail, Providers, ProviderDetail,
  FamilyDetail, ModelsBrowse, ModelDetail, BenchmarksBrowse, BenchmarkDetail,
  BrandDetail, ProductDetail, PlanDetail, PlansBrowse, ComparePage,
} from "./pages";
import { CompareProvider } from "./compareContext";
import { PageMetaProvider, usePageMeta } from "./pageMetaContext";
import { CompareTray } from "./CompareTray";
import { useApi } from "./useApi";

function getInitialTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Relies on useApi's shared cache — these lists get fetched once (10 min TTL)
// and reused, so mounting this in the topbar on every page is cheap.
function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const { data: companies } = useApi("companies");
  const { data: providers } = useApi("providers");
  const { data: models } = useApi("models");
  const { data: plans } = useApi("plans");

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    const out = [];
    (companies || []).forEach((c) => {
      if (c.name?.toLowerCase().includes(t)) {
        out.push({ kind: "Company", label: c.name, href: `/companies/${c.company_id}` });
      }
    });
    (providers || []).forEach((p) => {
      if (p.name?.toLowerCase().includes(t)) {
        out.push({ kind: "Provider", label: p.name, href: `/providers/${p.provider_id}` });
      }
    });
    (models || []).forEach((m) => {
      if (m.version_name?.toLowerCase().includes(t)) {
        out.push({ kind: "Model", label: m.version_name, href: `/models/${m.model_id}` });
      }
    });
    (plans || []).forEach((p) => {
      if (p.name?.toLowerCase().includes(t)) {
        out.push({ kind: "Plan", label: p.name, href: `/plans/${p.plan_id}` });
      }
    });
    return out.slice(0, 8);
  }, [term, companies, providers, models, plans]);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const goTo = (href) => {
    setTerm("");
    setOpen(false);
    navigate(href);
  };

  return (
    <div className="global-search" ref={boxRef}>
      <input
        type="text"
        placeholder="Search companies, models, plans…"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results.length > 0) goTo(results[0].href);
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && term.trim() && (
        <div className="global-search-results">
          {results.length === 0 && <div className="global-search-empty">No matches</div>}
          {results.map((r) => (
            <div className="global-search-result" key={r.kind + r.href} onClick={() => goTo(r.href)}>
              <span className="global-search-kind">{r.kind}</span>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Topbar({ theme, onToggleTheme }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { meta } = usePageMeta();
  const parts = loc.pathname.split("/").filter(Boolean);
  const isHome = loc.pathname === "/";

  // Build breadcrumb trail, swapping raw :id segments for real names once
  // the owning page has registered them via useSetPageMeta.
  let acc = "";
  const crumbs = parts.map((p) => {
    acc += "/" + p;
    return { path: acc, display: meta[acc]?.label || p };
  });

  const upTo = meta[loc.pathname]?.upTo;

  return (
    <div className="topbar">
      {!isHome && (
        <button className="back-btn" onClick={() => navigate(-1)} title="Go back">
          ← Back
        </button>
      )}
      {upTo && (
        <Link className="up-btn" to={upTo.path} title={`Up to ${upTo.label}`}>
          ↑ {upTo.label}
        </Link>
      )}
      <Link className="brand" to="/">⌂ Catalog</Link>

      <nav className="nav-links">
        <Link to="/companies">Companies</Link>
        <Link to="/providers">Providers</Link>
        <Link to="/models">Models</Link>
        <Link to="/plans">Plans</Link>
        <Link to="/benchmarks">Benchmarks</Link>
      </nav>

      <div className="breadcrumbs">
        <Link to="/">dashboard</Link>
        {crumbs.map((c, i) => (
          <span key={i}> / <Link to={c.path}>{c.display}</Link></span>
        ))}
      </div>
      <GlobalSearch />
      <button className="theme-toggle" onClick={onToggleTheme}>
        {theme === "dark" ? "☀ Light" : "☾ Dark"}
      </button>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <BrowserRouter>
      <PageMetaProvider>
        <CompareProvider>
          <div className="app-shell">
            <Topbar theme={theme} onToggleTheme={toggleTheme} />
            <div className="main">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/companies" element={<Companies />} />
                <Route path="/companies/:id" element={<CompanyDetail />} />
                <Route path="/providers" element={<Providers />} />
                <Route path="/providers/:id" element={<ProviderDetail />} />
                <Route path="/families/:id" element={<FamilyDetail />} />
                <Route path="/models" element={<ModelsBrowse />} />
                <Route path="/models/:id" element={<ModelDetail />} />
                <Route path="/benchmarks" element={<BenchmarksBrowse />} />
                <Route path="/benchmarks/:id" element={<BenchmarkDetail />} />
                <Route path="/brands/:id" element={<BrandDetail />} />
                <Route path="/products/:id" element={<ProductDetail />} />
                <Route path="/plans" element={<PlansBrowse />} />
                <Route path="/plans/:id" element={<PlanDetail />} />
                <Route path="/compare" element={<ComparePage />} />
              </Routes>
            </div>
            <CompareTray />
          </div>
        </CompareProvider>
      </PageMetaProvider>
    </BrowserRouter>
  );
}