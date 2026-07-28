import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

// Lets each detail page register (a) the human-readable name that should
// replace its raw :id in the breadcrumb trail, and (b) an "up" link to its
// logical parent (e.g. a model's family), independent of browser history.
const PageMetaContext = createContext(null);

export function PageMetaProvider({ children }) {
  const [meta, setMetaState] = useState({}); // pathname -> { label, upTo: { path, label } }

  const setMeta = useCallback((path, value) => {
    setMetaState((prev) => {
      const existing = prev[path];
      if (
        existing &&
        existing.label === value.label &&
        existing.upTo?.path === value.upTo?.path &&
        existing.upTo?.label === value.upTo?.label
      ) {
        return prev;
      }
      return { ...prev, [path]: value };
    });
  }, []);

  return (
    <PageMetaContext.Provider value={{ meta, setMeta }}>{children}</PageMetaContext.Provider>
  );
}

export function usePageMeta() {
  const ctx = useContext(PageMetaContext);
  if (!ctx) throw new Error("usePageMeta must be used within a PageMetaProvider");
  return ctx;
}

// Call from a detail page once its data has loaded.
export function useSetPageMeta({ label, upTo } = {}) {
  const location = useLocation();
  const { setMeta } = usePageMeta();

  useEffect(() => {
    if (label || upTo) {
      setMeta(location.pathname, { label, upTo });
    }
  }, [location.pathname, label, upTo?.path, upTo?.label, setMeta]);
}