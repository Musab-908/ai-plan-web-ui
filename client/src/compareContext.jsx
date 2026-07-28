import { createContext, useContext, useState, useCallback } from "react";

const CompareContext = createContext(null);

const MAX_ITEMS = 4;

export function CompareProvider({ children }) {
  const [items, setItems] = useState([]); // { type: 'model' | 'plan', id, label }

  const toggle = useCallback((item) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.type === item.type && i.id === item.id);
      if (exists) return prev.filter((i) => !(i.type === item.type && i.id === item.id));
      // Models and plans are different shapes — switching type starts a fresh tray
      // rather than silently dropping the mismatched item.
      if (prev.length > 0 && prev[0].type !== item.type) return [item];
      if (prev.length >= MAX_ITEMS) return prev;
      return [...prev, item];
    });
  }, []);

  const isSelected = useCallback(
    (type, id) => items.some((i) => i.type === type && i.id === id),
    [items]
  );
  const remove = useCallback(
    (type, id) => setItems((prev) => prev.filter((i) => !(i.type === type && i.id === id))),
    []
  );
  const clear = useCallback(() => setItems([]), []);

  return (
    <CompareContext.Provider value={{ items, toggle, isSelected, remove, clear, maxItems: MAX_ITEMS }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within a CompareProvider");
  return ctx;
}