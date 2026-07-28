import { Link, useNavigate } from "react-router-dom";
import { cloneElement, useState } from "react";

export function Status({ loading, error }) {
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">Error: {error}</div>;
  return null;
}

export function CardGrid({ items, getKey, getTitle, getMeta, getHref, selectable }) {
  if (!items || items.length === 0) return <div className="empty">Nothing here yet.</div>;
  return (
    <div className="card-grid">
      {items.map((item) => (
        <Link className="card" to={getHref(item)} key={getKey(item)}>
          {selectable && (
            <input
              type="checkbox"
              className="card-checkbox"
              checked={selectable.isSelected(item)}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); selectable.onToggle(item); }}
              title="Add to comparison"
            />
          )}
          <div className="title">{getTitle(item)}</div>
          {getMeta && <div className="meta">{getMeta(item)}</div>}
        </Link>
      ))}
    </div>
  );
}

// columns: [{ key, label, render?(row), sortable?, sortValue?(row) }]
// selectable: { isSelected(row), onToggle(row) } — adds a checkbox column
export function DataTable({ columns, rows, rowKey, rowHref, selectable }) {
  const [sort, setSort] = useState(null); // { key, dir: "asc" | "desc" }

  if (!rows || rows.length === 0) return <div className="empty">No records.</div>;

  const sortedRows = (() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const getValue = col.sortValue || ((row) => row[col.key]);
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last regardless of direction
      if (bv == null) return -1;
      let cmp;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  })();

  const toggleSort = (col) => {
    if (!col.sortable) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "desc" };
      if (prev.dir === "desc") return { key: col.key, dir: "asc" };
      return null;
    });
  };

  return (
    <table>
      <thead>
        <tr>
          {selectable && <th className="select-col"></th>}
          {columns.map((c) => (
            <th
              key={c.key}
              className={c.sortable ? "sortable" : ""}
              onClick={() => toggleSort(c)}
              title={c.sortable ? "Click to sort" : undefined}
            >
              {c.label}
              {sort?.key === c.key && <span className="sort-arrow">{sort.dir === "asc" ? " ▲" : " ▼"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => {
          const href = rowHref ? rowHref(row) : null;
          const cells = (
            <>
              {selectable && (
                <td className="select-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectable.isSelected(row)}
                    onChange={() => selectable.onToggle(row)}
                    title="Add to comparison"
                  />
                </td>
              )}
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? "—"}</td>)}
            </>
          );
          const tr = (
            <tr key={rowKey(row)} className={href ? "clickable" : ""}>
              {cells}
            </tr>
          );
          return href ? <RowLink key={rowKey(row)} to={href}>{tr}</RowLink> : tr;
        })}
      </tbody>
    </table>
  );
}

// wraps a <tr> with click-to-navigate behavior without breaking table semantics
function RowLink({ to, children }) {
  const navigate = useNavigate();
  return cloneElement(children, { onClick: () => navigate(to) });
}

export function Bool({ value }) {
  if (value === null || value === undefined) return <span className="badge">—</span>;
  return <span className={`badge ${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>;
}

export function KV({ pairs }) {
  return (
    <div className="kv">
      {pairs.filter(([, v]) => v !== undefined).map(([k, v]) => (
        <div className="kv-row" style={{ display: "contents" }} key={k}>
          <div className="k">{k}</div>
          <div>{v === null || v === "" ? "—" : String(v)}</div>
        </div>
      ))}
    </div>
  );
}