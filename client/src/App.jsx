import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Dashboard, Companies, CompanyDetail, Providers, ProviderDetail,
  FamilyDetail, ModelsBrowse, ModelDetail, BenchmarksBrowse, BenchmarkDetail,
  BrandDetail, ProductDetail, PlanDetail, ComparePage,
} from "./pages";
import { CompareProvider } from "./compareContext";
import { PageMetaProvider, usePageMeta } from "./pageMetaContext";
import { CompareTray } from "./CompareTray";

function getInitialTheme() {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
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
        <Link to="/benchmarks">Benchmarks</Link>
      </nav>

      <div className="breadcrumbs">
        <Link to="/">dashboard</Link>
        {crumbs.map((c, i) => (
          <span key={i}> / <Link to={c.path}>{c.display}</Link></span>
        ))}
      </div>
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