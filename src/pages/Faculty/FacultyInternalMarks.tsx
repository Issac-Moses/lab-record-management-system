import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { Download, FileText, Search, Users } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type RawRow = {
  student_name: string;
  register_no: string;
  experiment_no: string | number | null;
  faculty_marks: number | null;
  ai_marks: number | null;
  status: string | null;
};

type StudentSummary = {
  student_name: string;
  register_no: string;
  /** Per-experiment breakdown, sorted by experiment_no */
  experiments: { exp_no: string | number; marks: number }[];
  totalMarks: number;
  maxMarks: number;
  internalPercent: number;
  avgPerExperiment: number;
  evaluatedCount: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolvedMark(row: RawRow): number {
  return Number(row.faculty_marks ?? row.ai_marks ?? 0);
}

function isEvaluated(row: RawRow): boolean {
  const s = String(row.status || "").toLowerCase();
  return (s === "evaluated" || s === "completed") && resolvedMark(row) > 0;
}

function buildSummaries(rows: RawRow[]): StudentSummary[] {
  // Group by register_no (fallback student_name)
  const grouped = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = row.register_no || row.student_name || "unknown";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const summaries: StudentSummary[] = [];
  for (const [, studentRows] of grouped) {
    const evaluated = studentRows.filter(isEvaluated);
    const totalMarks = evaluated.reduce((s, r) => s + resolvedMark(r), 0);
    const maxMarks = Math.max(1, evaluated.length * 10);
    const internalPercent =
      evaluated.length > 0 ? Number(((totalMarks / maxMarks) * 100).toFixed(2)) : 0;
    const avgPerExperiment =
      evaluated.length > 0 ? Number((totalMarks / evaluated.length).toFixed(2)) : 0;

    const expBreakdown = sortByExperimentNo(
      evaluated.map((r) => ({ exp_no: r.experiment_no ?? "?", marks: resolvedMark(r) })),
      (r) => r.exp_no
    );

    summaries.push({
      student_name: String(studentRows[0].student_name || "").trim() || "—",
      register_no: String(studentRows[0].register_no || "").trim() || "—",
      experiments: expBreakdown,
      totalMarks,
      maxMarks,
      internalPercent,
      avgPerExperiment,
      evaluatedCount: evaluated.length,
    });
  }

  return summaries.sort((a, b) => a.register_no.localeCompare(b.register_no));
}

// ─── PDF Download ─────────────────────────────────────────────────────────────

function downloadPdf(summaries: StudentSummary[], subjectName: string) {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Internal Marks Report", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (subjectName) doc.text(`Subject: ${subjectName}`, 14, 21);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 27);

  autoTable(doc, {
    startY: 33,
    head: [["#", "Student Name", "Register No", "Experiments Done", "Total / Max", "Internal %", "Avg / Exp"]],
    body: summaries.map((s, i) => [
      String(i + 1),
      s.student_name,
      s.register_no,
      String(s.evaluatedCount),
      `${s.totalMarks} / ${s.maxMarks}`,
      `${s.internalPercent}%`,
      String(s.avgPerExperiment),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [67, 56, 202], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { cellWidth: 28, halign: "center" },
      4: { cellWidth: 25, halign: "center" },
      5: { cellWidth: 22, halign: "center" },
      6: { cellWidth: 22, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const pct = parseFloat(String(data.cell.raw ?? "0"));
        if (pct >= 75) data.cell.styles.textColor = [22, 163, 74];
        else if (pct >= 50) data.cell.styles.textColor = [202, 138, 4];
        else data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Summary
  const avg =
    summaries.length > 0
      ? (summaries.reduce((s, r) => s + r.internalPercent, 0) / summaries.length).toFixed(2)
      : "0";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 33;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Class Average Internal %: ${avg}%  |  Total Students: ${summaries.length}`,
    14,
    finalY + 8
  );

  doc.save("internal-marks-report.pdf");
}

function downloadCsv(summaries: StudentSummary[], subjectName: string) {
  const header = ["#", "student_name", "register_no", "experiments_evaluated", "total_marks", "max_marks", "internal_percent", "avg_per_experiment"];
  const body = summaries.map((s, i) => [
    i + 1,
    `"${s.student_name}"`,
    s.register_no,
    s.evaluatedCount,
    s.totalMarks,
    s.maxMarks,
    s.internalPercent,
    s.avgPerExperiment,
  ]);
  const title = subjectName ? `# Subject: ${subjectName}\n# Generated: ${new Date().toLocaleDateString("en-GB")}\n` : "";
  const csv = title + [header.join(","), ...body.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "internal-marks.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FacultyInternalMarks() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name") ?? "";

  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    if (!subjectId) {
      setError("No subject selected. Please select a subject first.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    const { data, error: fetchErr } = await supabase
      .from("full_student_data")
      .select(
        "student_name, name, register_no, register_number, experiment_no, faculty_marks, ai_marks, status, subject_id"
      )
      .eq("subject_id", subjectId);

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const mapped: RawRow[] = (data || []).map((r: any) => ({
      student_name: String(r.student_name || r.name || "").trim(),
      register_no: String(r.register_no || r.register_number || "").trim(),
      experiment_no: r.experiment_no ?? null,
      faculty_marks: r.faculty_marks ?? null,
      ai_marks: r.ai_marks ?? null,
      status: r.status ?? null,
    })).filter((r) => r.student_name || r.register_no);

    setRawRows(mapped);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const summaries = useMemo(() => buildSummaries(rawRows), [rawRows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return summaries;
    const q = search.trim().toLowerCase();
    return summaries.filter(
      (s) => s.student_name.toLowerCase().includes(q) || s.register_no.toLowerCase().includes(q)
    );
  }, [summaries, search]);

  const classAvg =
    summaries.length > 0
      ? (summaries.reduce((s, r) => s + r.internalPercent, 0) / summaries.length).toFixed(2)
      : "0";

  const above75 = summaries.filter((s) => s.internalPercent >= 75).length;
  const below50 = summaries.filter((s) => s.internalPercent < 50 && s.evaluatedCount > 0).length;

  function percentColor(pct: number) {
    if (pct >= 75) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (pct >= 50) return "text-amber-700 bg-amber-50 border-amber-200";
    if (pct > 0) return "text-rose-700 bg-rose-50 border-rose-200";
    return "text-slate-500 bg-slate-50 border-slate-200";
  }

  return (
    <div className="space-y-5 text-slate-800">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Internal Marks</h1>
            {subjectName && (
              <p className="mt-0.5 text-sm font-medium text-indigo-600">{subjectName}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Per-student internal marks summary — based on faculty-evaluated experiments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadCsv(filtered, subjectName)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
            >
              <Download size={15} /> CSV
            </button>
            <button
              onClick={() => downloadPdf(filtered, subjectName)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 transition"
            >
              <FileText size={15} /> Download PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Class Stats */}
      {!loading && summaries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Students", value: summaries.length, color: "text-indigo-700 bg-indigo-50 border-indigo-200", icon: <Users size={16} /> },
            { label: "Class Avg Internal %", value: `${classAvg}%`, color: "text-blue-700 bg-blue-50 border-blue-200", icon: null },
            { label: "≥ 75% (Pass)", value: above75, color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: null },
            { label: "< 50% (At Risk)", value: below50, color: "text-rose-700 bg-rose-50 border-rose-200", icon: null },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className={`rounded-xl border px-4 py-3 ${color}`}>
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                {icon}{label}
              </p>
              <p className="mt-1 text-2xl font-extrabold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      {!loading && summaries.length > 0 && (
        <div className="relative w-full max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or register no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {summaries.length === 0 ? "No evaluated submissions found for this subject." : "No students match your search."}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Register No</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Exps Done</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Total / Max</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Internal %</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Avg / Exp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Experiment Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => (
                <tr key={s.register_no + s.student_name} className="border-t border-slate-100 hover:bg-slate-50/40">
                  <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{s.student_name}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.register_no}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                      {s.evaluatedCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-800">
                    {s.totalMarks} / {s.maxMarks}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full border px-3 py-0.5 text-xs font-bold ${percentColor(s.internalPercent)}`}>
                      {s.internalPercent}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700 font-medium">{s.avgPerExperiment}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.experiments.map((e) => (
                        <span
                          key={String(e.exp_no)}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700"
                          title={`Experiment ${e.exp_no}`}
                        >
                          E{e.exp_no}: {e.marks}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
