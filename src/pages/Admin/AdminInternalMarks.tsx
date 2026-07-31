import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { formatDepartmentName } from "@/utils/departmentLabel";
import { Download, FileText, Search, Users, ClipboardList } from "lucide-react";
// @ts-ignore – JSX module, no type declaration available
import ShellCard from "@/components/admin/ShellCard";
// @ts-ignore – JSX module, no type declaration available
import EmptyState from "@/components/admin/EmptyState";
// @ts-ignore – JSX module, no type declaration available
import AdminShell from "@/layouts/AdminShell";


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
  experiments: { exp_no: string | number; marks: number }[];
  totalMarks: number;
  maxMarks: number;
  internalPercent: number;
  avgPerExperiment: number;
  evaluatedCount: number;
};

type SubjectOption = { id: string; name: string; department: string | null; year?: string | number; semester?: string | number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolvedMark(row: RawRow): number {
  return Number(row.faculty_marks ?? row.ai_marks ?? 0);
}

function isEvaluated(row: RawRow): boolean {
  const s = String(row.status || "").toLowerCase();
  return (s === "evaluated" || s === "completed") && resolvedMark(row) > 0;
}

function buildSummaries(rows: RawRow[]): StudentSummary[] {
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
      student_name: String(studentRows[0]?.student_name || "").trim() || "—",
      register_no: String(studentRows[0]?.register_no || "").trim() || "—",
      experiments: expBreakdown,
      totalMarks,
      maxMarks,
      internalPercent,
      avgPerExperiment,
      evaluatedCount: evaluated.length,
    });
  }

  return summaries.sort((a, b) => {
    // 1. Highest evaluated experiments count first
    if (b.evaluatedCount !== a.evaluatedCount) {
      return b.evaluatedCount - a.evaluatedCount;
    }
    // 2. Highest internal percentage / marks first
    if (b.internalPercent !== a.internalPercent) {
      return b.internalPercent - a.internalPercent;
    }
    // 3. Highest total marks first
    if (b.totalMarks !== a.totalMarks) {
      return b.totalMarks - a.totalMarks;
    }
    return a.register_no.localeCompare(b.register_no);
  });
}

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
    head: [["#", "Student Name", "Register No", "Exps Done", "Total / Max", "Internal %", "Avg / Exp"]],
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
      3: { cellWidth: 25, halign: "center" },
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

  const avg =
    summaries.length > 0
      ? (summaries.reduce((s, r) => s + r.internalPercent, 0) / summaries.length).toFixed(2)
      : "0";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 33;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Class Avg: ${avg}%  |  Total Students: ${summaries.length}`,
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

export default function AdminInternalMarks() {
  const [adminDept, setAdminDept] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Load admin department and subjects
  useEffect(() => {
    async function loadInitialData() {
      const { data: sessionData } = await supabase.auth.getSession();
      let dept = null;
      if (sessionData?.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("department")
          .eq("id", sessionData.session.user.id)
          .maybeSingle();
        if (profile?.department) {
          dept = profile.department;
          setAdminDept(dept);
        }
      }

      const { data, error: subjectsErr } = await supabase
        .from("subjects")
        .select("id, name, department, year, semester")
        .order("year", { ascending: true })
        .order("name", { ascending: true });
        
      if (subjectsErr) {
        setError(`Failed to fetch subjects: ${subjectsErr.message}`);
        setSubjectsLoading(false);
        return;
      }
        
      let allSubjects = (data || []) as SubjectOption[];
      
      if (dept) {
        // Filter subjects based on admin department using canonical name to match shortcodes
        const targetDept = formatDepartmentName(dept);
        const filtered = allSubjects.filter((s) => {
           return formatDepartmentName(s.department) === targetDept;
        });
        
        // If the filter removes all subjects, fallback to showing all subjects
        // This handles edge cases where the admin's department doesn't match any subjects in the DB
        if (filtered.length > 0) {
          allSubjects = filtered;
        }
      }

      setSubjects(allSubjects);
      setSubjectsLoading(false);
    }
    
    void loadInitialData();
  }, []);

  const selectedSubjectName =
    subjects.find((s) => s.id === selectedSubjectId)?.name ?? "";

  const fetchData = useCallback(async () => {
    if (!selectedSubjectId) return;
    setLoading(true);
    setError("");

    const { data, error: fetchErr } = await supabase
      .from("full_student_data")
      .select(
        "student_name, name, register_no, register_number, experiment_no, faculty_marks, ai_marks, status, subject_id"
      )
      .eq("subject_id", selectedSubjectId);

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
  }, [selectedSubjectId]);

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
    <AdminShell title="Internal Marks">
      <div className="col-span-12 space-y-6 text-slate-800">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Internal Marks</h1>
            <p className="mt-1 text-sm text-slate-500">
              View per-student internal marks for any subject. Faculty-evaluated data only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { if (filtered.length) downloadCsv(filtered, selectedSubjectName); }}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
            >
              <Download size={16} /> CSV Report
            </button>
            <button
              onClick={() => { if (filtered.length) downloadPdf(filtered, selectedSubjectName); }}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
            >
              <FileText size={16} /> PDF Report
            </button>
          </div>
        </div>

        <ShellCard title="Select Target Subject" glow="indigo">
        <div className="max-w-xl">
          <label className="mb-2 block text-sm font-medium text-slate-700">Subject</label>
          {subjectsLoading ? (
            <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <select
              value={selectedSubjectId}
              onChange={(e) => { setSelectedSubjectId(e.target.value); setSearch(""); setRawRows([]); }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— Choose a subject to load marks —</option>
              {Object.entries(
                subjects.reduce((acc: any, s: any) => {
                  const y = Number(s.year);
                  const suffix = y === 1 ? "st" : y === 2 ? "nd" : y === 3 ? "rd" : "th";
                  const key = s.year ? `${s.year}${suffix} Year` : "Other Subjects";
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(s);
                  return acc;
                }, {})
              ).map(([groupName, groupSubjects]: any) => (
                <optgroup key={groupName} label={groupName}>
                  {groupSubjects.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.semester ? ` (Sem ${s.semester})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </ShellCard>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {error}
          </div>
        )}

        {/* Class Stats */}
        {!loading && summaries.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Students", value: summaries.length, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
              { label: "Class Avg", value: `${classAvg}%`, color: "text-blue-700 bg-blue-50 border-blue-200" },
              { label: "Passed (≥ 75%)", value: above75, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
              { label: "At Risk (< 50%)", value: below50, color: "text-rose-700 bg-rose-50 border-rose-200" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border px-5 py-4 ${color} shadow-sm transition-all hover:-translate-y-0.5`}>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
                <p className="mt-1.5 text-3xl font-extrabold tracking-tight">{value}</p>
              </div>
            ))}
          </div>
        )}

        {!selectedSubjectId && !subjectsLoading && (
          <EmptyState 
            title="No Subject Selected" 
            description="Please select a subject from the dropdown above to view the internal marks and class statistics."
            icon={<ClipboardList className="mx-auto h-8 w-8 text-slate-300" />}
          />
        )}

        {loading && (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-3 text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span className="text-sm font-medium">Loading internal marks...</span>
            </div>
          </div>
        )}

        {!loading && selectedSubjectId && filtered.length === 0 && summaries.length === 0 && (
          <EmptyState 
            title="No Internal Marks Available" 
            description="There are no evaluated submissions found for the selected subject."
          />
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <ShellCard title="Internal Marks Rollout" glow="blue">
            {/* Search */}
            <div className="mb-4 relative w-full max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student name or register no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">#</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Student Name</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Register No</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Exps Done</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Total / Max</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Internal %</th>
                    <th className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Avg / Exp</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Breakdown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((s, idx) => (
                    <tr key={s.register_no + s.student_name} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-900">{s.student_name}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">{s.register_no}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                          {s.evaluatedCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-slate-700">{s.totalMarks} <span className="text-slate-400 text-xs font-medium">/ {s.maxMarks}</span></td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[3.5rem] rounded-full border px-2.5 py-0.5 text-xs font-bold ${percentColor(s.internalPercent)}`}>
                          {s.internalPercent}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-slate-700">{s.avgPerExperiment}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {s.experiments.map((e) => (
                            <span key={String(e.exp_no)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">
                              E{e.exp_no}: <span className="text-slate-900">{e.marks}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ShellCard>
        )}
      </div>
    </AdminShell>
  );
}

