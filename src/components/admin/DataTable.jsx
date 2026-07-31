export default function DataTable({ columns = [], data = [] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 text-left font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={row.id || idx} className="border-t border-slate-200 text-slate-700 transition-colors hover:bg-blue-50/60">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2">
                  {typeof col.render === "function" ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-center text-slate-500" colSpan={Math.max(1, columns.length)}>
                No records found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

