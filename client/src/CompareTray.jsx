import { useNavigate } from "react-router-dom";
import { useCompare } from "./compareContext";

export function CompareTray() {
  const { items, remove, clear, maxItems } = useCompare();
  const navigate = useNavigate();

  if (items.length === 0) return null;

  const type = items[0].type;
  const typeLabel = type === "plan" ? "plans" : "models";

  return (
    <div className="compare-tray">
      <div className="compare-tray-items">
        <span className="compare-tray-label">
          Comparing {items.length}/{maxItems} {typeLabel}
        </span>
        {items.map((i) => (
          <span className="compare-chip" key={`${i.type}-${i.id}`}>
            {i.label}
            <button onClick={() => remove(i.type, i.id)} aria-label={`Remove ${i.label}`}>×</button>
          </span>
        ))}
      </div>
      <div className="compare-tray-actions">
        <button className="compare-tray-clear" onClick={clear}>Clear</button>
        <button
          className="compare-tray-go"
          disabled={items.length < 2}
          onClick={() => navigate(`/compare?type=${type}&ids=${items.map((i) => i.id).join(",")}`)}
        >
          Compare{items.length >= 2 ? ` (${items.length})` : ""}
        </button>
      </div>
    </div>
  );
}