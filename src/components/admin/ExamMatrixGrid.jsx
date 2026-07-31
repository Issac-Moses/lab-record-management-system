const COLOR_MAP = {
  excellent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  average: "bg-amber-50 text-amber-700 border-amber-200",
  poor: "bg-rose-50 text-rose-700 border-rose-200",
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  missing: "bg-slate-100 text-slate-700 border-slate-200",
};

function gradeType(cell) {
  if (cell.status === "pending") return "pending";
  if (cell.status === "missing") return "missing";
  if (cell.score == null) return "missing";
  if (cell.score >= 75) return "excellent";
  if (cell.score >= 50) return "average";
  return "poor";
}

export default function ExamMatrixGrid({ rows = [], experiments = [], onCellClick }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Student</th>
            {experiments.map((exp) => (
              <th key={exp} className="px-3 py-2 text-left">{exp}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentId} className="border-t border-slate-200">
              <td className="px-3 py-2 text-slate-700">{row.studentName}</td>
              {row.cells.map((cell) => {
                const t = gradeType(cell);
                return (
                  <td key={`${row.studentId}-${cell.experiment}`} className="px-3 py-2">
                    <button
                      onClick={() => onCellClick?.(row, cell)}
                      className={`rounded-lg border px-2 py-1 text-xs ${COLOR_MAP[t]}`}
                    >
                      {cell.score ?? (cell.status === "pending" ? "Pend." : "—")}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

