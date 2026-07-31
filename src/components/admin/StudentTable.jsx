import { useMemo } from "react";

function statusBadge(status) {
  if (status === "unknown") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  if (status === "inactive") {
    return "bg-rose-50 text-rose-800 border-rose-200";
  }
  return "bg-emerald-50 text-emerald-800 border-emerald-200";
}

export default function StudentTable({
  students,
  totalCount,
  page,
  pageSize,
  sortKey,
  sortDir,
  onPageChange,
  onSortChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onAction,
}) {
  const rows = useMemo(() => students, [students]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  function handleSort(nextKey) {
    onSortChange?.(nextKey);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600">
              <th className="p-2">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={() => onToggleSelectAll(rows)}
                />
              </th>
              <th className="cursor-pointer p-2" onClick={() => handleSort("register_no")}>
                Reg No {sortKey === "register_no" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="cursor-pointer p-2" onClick={() => handleSort("name")}>
                Student Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="cursor-pointer p-2" onClick={() => handleSort("email")}>
                Email {sortKey === "email" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="cursor-pointer p-2" onClick={() => handleSort("department")}>
                Department {sortKey === "department" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="p-2">XP Points</th>
              <th className="p-2">Labs Completed</th>
              <th className="p-2">Account Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isChecked = selectedIds.includes(row.id);
              const status = row.account_status || row.status || "unknown";
              return (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(row.id)}
                    />
                  </td>
                  <td className="p-2 text-slate-900">{row.register_no || "—"}</td>
                  <td className="p-2 font-medium text-slate-900">{row.name || "—"}</td>
                  <td className="p-2 text-slate-600">{row.email || "—"}</td>
                  <td className="p-2 text-slate-600">{row.department || "—"}</td>
                  <td className="p-2 text-cyan-700">
                    {typeof row.xp_points === "number" ? row.xp_points : "—"}
                  </td>
                  <td className="p-2 text-violet-700">
                    {typeof row.labs_completed === "number" ? row.labs_completed : "—"}
                  </td>
                  <td className="p-2">
                    <span className={`rounded-full border px-2 py-1 text-xs capitalize ${statusBadge(status)}`}>
                      {status}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onAction("view", row)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => onAction("edit", row)}
                        className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-500"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onAction("delete", row)}
                        className="rounded bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-slate-500">
                  No students found for selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
            No students found for selected filters.
          </div>
        ) : (
          rows.map((row) => {
            const isChecked = selectedIds.includes(row.id);
            const status = row.account_status || row.status || "unknown";
            return (
              <div key={`${row.id}-card`} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{row.name || "—"}</p>
                    <p className="text-xs text-slate-500">{row.register_no || "—"}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelect(row.id)}
                    aria-label={`Select ${row.name || "student"}`}
                  />
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <p>Email: {row.email || "—"}</p>
                  <p>Department: {row.department || "—"}</p>
                  <p>XP: {typeof row.xp_points === "number" ? row.xp_points : "—"}</p>
                  <p>Labs Completed: {typeof row.labs_completed === "number" ? row.labs_completed : "—"}</p>
                  <p>
                    Status:{" "}
                    <span className={`rounded-full border px-2 py-0.5 ${statusBadge(status)}`}>
                      {status}
                    </span>
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => onAction("view", row)} className="rounded border border-slate-200 bg-white px-2 py-2 text-xs">
                    View
                  </button>
                  <button type="button" onClick={() => onAction("edit", row)} className="rounded bg-indigo-600 px-2 py-2 text-xs text-white">
                    Edit
                  </button>
                  <button type="button" onClick={() => onAction("delete", row)} className="col-span-2 rounded bg-rose-600 px-2 py-2 text-xs text-white">
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
        <span>
          Showing {rows.length === 0 ? 0 : start + 1} - {Math.min(start + pageSize, totalCount)} of {totalCount}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded border border-slate-200 bg-white px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
