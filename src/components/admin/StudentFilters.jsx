export default function StudentFilters({
  search,
  onSearchChange,
  department,
  onDepartmentChange,
  status,
  onStatusChange,
  departmentOptions,
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search student name or reg no..."
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
      />

      <select
        value={department}
        onChange={(event) => onDepartmentChange(event.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
      >
        <option value="all">All Departments</option>
        {departmentOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
  );
}
