import { motion } from "framer-motion";
import XpBar from "@/components/admin/XpBar";
import BadgePill from "@/components/admin/BadgePill";

export default function StudentCard({ student, onView, onEdit, onRemove }) {
  const initials = String(student?.name || "S")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="faculty-surface relative overflow-hidden rounded-2xl p-4"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-100/70 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-indigo-100/60 blur-2xl" />
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-gradient-to-br from-blue-100 to-indigo-100 text-sm font-semibold text-blue-700">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{student.name}</p>
          <p className="text-xs text-slate-500">{student.registerNo || student.register_no}</p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <BadgePill label={student.department || "Unassigned"} variant="pending" />
        <BadgePill label={student.status || "Active"} variant={student.status === "Pending" ? "pending" : "active"} />
        <BadgePill label={`Y${student.year || "-"} · S${student.semester || "-"}`} variant="active" />
      </div>
      <XpBar value={student.completion ?? student.avgGrade ?? 0} max={100} color="emerald" />
      <div className="mt-4 flex gap-2 text-xs">
        <button onClick={() => onView?.(student)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 transition hover:bg-slate-50">View</button>
        <button onClick={() => onEdit?.(student)} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-blue-700 transition hover:bg-blue-100">Edit</button>
        <button onClick={() => onRemove?.(student)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-700 transition hover:bg-rose-100">Remove</button>
      </div>
    </motion.div>
  );
}

