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

// Pure sort helper shared by DataTable and anything that needs the exact
// same row order outside the table (e.g. CSV/Excel export of "current view").
export function sortTableRows(rows, columns, sort) {
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
}

// columns: [{ key, label, render?(row), sortable?, sortValue?(row) }]
// selectable: { isSelected(row), onToggle(row) } — adds a checkbox column
// sort/onSortChange: optional controlled-sort pair (pass a useState pair) so
// a parent can read back the exact sorted row order, e.g. for CSV export.
// If omitted, DataTable manages its own sort state as before.
export function DataTable({ columns, rows, rowKey, rowHref, selectable, sort: sortProp, onSortChange }) {
  const [internalSort, setInternalSort] = useState(null); // { key, dir: "asc" | "desc" }
  const controlled = onSortChange !== undefined;
  const sort = controlled ? sortProp : internalSort;
  const setSort = controlled ? onSortChange : setInternalSort;

  if (!rows || rows.length === 0) return <div className="empty">No records.</div>;

  const sortedRows = sortTableRows(rows, columns, sort);

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

// Formats a raw performance-delta percentage (e.g. aa_v4_1_vs_opus_4_8_pct,
// which comes out of the DB with long floating-point tails like
// 0.05357142857142857142857142857143) into something readable: rounded to
// one decimal, signed, and colored so a glance tells you better vs worse.
export function PctDiff({ value }) {
  if (value === null || value === undefined || value === "") return <span>—</span>;
  const n = Number(value);
  if (Number.isNaN(n)) return <span>—</span>;
  // value is a raw fraction (score_diff / referenceScore) straight from the
  // DB, e.g. -0.267857142857 for a model scoring 26.8% below the reference
  // model — so it needs to be scaled to a percentage before display.
  const rounded = Math.round(n * 1000) / 10;
  const sign = rounded > 0 ? "+" : "";
  const cls = rounded > 0 ? "pct-diff pct-diff-pos" : rounded < 0 ? "pct-diff pct-diff-neg" : "pct-diff pct-diff-flat";
  return <span className={cls}>{sign}{rounded}%</span>;
}

export function Bool({ value }) {
  if (value === null || value === undefined) return <span className="badge">—</span>;
  return <span className={`badge ${value ? "yes" : "no"}`}>{value ? "Yes" : "No"}</span>;
}

// pairs: [label, value] or [label, value, evidenceUrl]. When an evidenceUrl
// is given, the value itself becomes the link (dotted underline) rather than
// adding a separate icon — keeps the KV block visually unchanged otherwise.
export function KV({ pairs }) {
  return (
    <div className="kv">
      {pairs.filter(([, v]) => v !== undefined).map(([k, v, evidenceUrl]) => (
        <div className="kv-row" style={{ display: "contents" }} key={k}>
          <div className="k">{k}</div>
          <div>
            {v === null || v === "" ? (
              "—"
            ) : evidenceUrl ? (
              <a className="evidence-link" href={evidenceUrl} target="_blank" rel="noopener noreferrer">
                {v}
              </a>
            ) : (
              v
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Small muted "Source" link for placing next to a page's h1/title, used for
// records that carry a single evidence_id for the whole entity (model, plan,
// family, ...). Renders nothing if there's no URL.
export function SourceLink({ url, className = "detail-source-link" }) {
  if (!url) return null;
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      Source
    </a>
  );
}

// Column factory for DataTable — adds a dedicated "Source" column that links
// to each row's evidence_url. getUrl(row) should return the url or null.
export function sourceColumn(getUrl) {
  return {
    key: "__source",
    label: "Source",
    render: (row) => {
      const url = getUrl(row);
      return url ? (
        <a className="evidence-link" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          Source
        </a>
      ) : (
        "—"
      );
    },
  };
}