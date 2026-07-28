// columns: [{ label, exportValue(row) }] — exportValue must return a plain
// string/number/boolean, not JSX (unlike a column's `render`).
function toExportRows(columns, rows) {
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => (c.exportValue ? c.exportValue(row) : row[c.key] ?? "")));
  return [header, ...body];
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCsv(columns, rows, filename) {
  const table = toExportRows(columns, rows);
  const csv = table.map((line) => line.map(escapeCsvCell).join(",")).join("\r\n");
  downloadBlob(csv, filename, "text/csv;charset=utf-8;");
}

// Dynamically imports the `xlsx` (SheetJS) package so it isn't in the main
// bundle unless someone actually exports. Requires `xlsx` as a client
// dependency (`npm install xlsx` in client/) — not bundled with this app by
// default.
export async function exportToXlsx(columns, rows, filename) {
  const XLSX = await import("xlsx");
  const table = toExportRows(columns, rows);
  const worksheet = XLSX.utils.aoa_to_sheet(table);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Plans");
  XLSX.writeFile(workbook, filename);
}