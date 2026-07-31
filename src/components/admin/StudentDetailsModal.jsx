import { useEffect, useState } from "react";

export default function StudentDetailsModal({
  open,
  mode,
  student,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    register_no: "",
    department: "",
  });

  useEffect(() => {
    if (!student) return;
    setForm({
      name: String(student.name || ""),
      email: String(student.email || ""),
      register_no: String(student.register_no || ""),
      department: String(student.department || ""),
    });
  }, [student]);

  if (!open || !student) return null;
  const editable = mode === "edit";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            {editable ? "Edit Student" : "View Student"}
          </h3>
          <button onClick={onClose} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">
            Close
          </button>
        </div>

        <div className="grid gap-3">
          <input
            value={form.name}
            disabled={!editable}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Name"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-80"
          />
          <input
            value={form.email}
            disabled={!editable}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-80"
          />
          <input
            value={form.register_no}
            disabled={!editable}
            onChange={(event) => setForm((prev) => ({ ...prev, register_no: event.target.value }))}
            placeholder="Register No"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-80"
          />
          <input
            value={form.department}
            disabled={!editable}
            onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
            placeholder="Department"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 disabled:opacity-80"
          />
        </div>

        {editable ? (
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(form)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white hover:bg-indigo-500"
            >
              Save Changes
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
