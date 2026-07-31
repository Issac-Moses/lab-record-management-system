import { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import { sortByExperimentNo } from "@/utils/experimentOrder";

type ReportRow = {
  id: string;
  full_name: string;
  register_no: string;
  department: string;
  year: string;
  semester: string;
  experiment_no: string | number | null;
  title: string;
  faculty_marks: number | null;
  ai_marks: number | null;
  /** ISO timestamp of when student submitted/updated */
  submitted_at: string | null;
  /** ISO deadline set by faculty on this experiment */
  due_date: string | null;
};

type EnrichedRow = ReportRow & {
  /** Human-readable submission date e.g. 12/03/2025 */
  submissionDateDisplay: string;
  /** Whether this was submitted after the deadline */
  isLate: boolean;
  /** Human-readable status label */
  submissionStatus: string;
};

const finalMarks = (row: { faculty_marks?: number | null; ai_marks?: number | null }) =>
  Number(row.faculty_marks ?? row.ai_marks ?? 0);

function toDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB");
}

function computeStatus(row: ReportRow): { isLate: boolean; submissionStatus: string } {
  if (!row.submitted_at) return { isLate: false, submissionStatus: "Pending" };
  if (!row.due_date) return { isLate: false, submissionStatus: "Submitted" };
  const submittedTs = new Date(row.submitted_at).getTime();
  const dueTs = new Date(row.due_date).getTime();
  if (Number.isNaN(submittedTs) || Number.isNaN(dueTs))
    return { isLate: false, submissionStatus: "Submitted" };
  return submittedTs > dueTs
    ? { isLate: true, submissionStatus: "Late Submission" }
    : { isLate: false, submissionStatus: "On Time" };
}

function enrichRows(rows: ReportRow[]): EnrichedRow[] {
  return rows.map((row) => {
    const { isLate, submissionStatus } = computeStatus(row);
    return {
      ...row,
      submissionDateDisplay: toDisplayDate(row.submitted_at),
      isLate,
      submissionStatus,
    };
  });
}

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();
const extractNumericToken = (value: unknown) => {
  const text = normalizeText(value);
  const direct = text.match(/\d+/)?.[0];
  if (direct) return direct;
  const romanMap: Record<string, string> = {
    i: "1", ii: "2", iii: "3", iv: "4",
    v: "5", vi: "6", vii: "7", viii: "8",
  };
  return romanMap[text] || "";
};
const canonicalDepartment = (value: unknown) =>
  normalizeText(value).replace(/[^a-z0-9]/g, "");
const sameDepartment = (a: unknown, b: unknown) => {
  const left = canonicalDepartment(a);
  const right = canonicalDepartment(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
};
const sameAcademicToken = (a: unknown, b: unknown) => {
  const left = extractNumericToken(a);
  const right = extractNumericToken(b);
  if (!left || !right) return false;
  return left === right;
};

function downloadCsv(rows: EnrichedRow[]) {
  const headers = [
    "full_name", "register_no", "experiment_no", "title",
    "submission_date", "submission_status", "final_marks",
  ];
  const lines = rows.map((row) =>
    [
      `"${row.full_name}"`,
      row.register_no,
      row.experiment_no ?? "",
      `"${row.title}"`,
      row.submissionDateDisplay || "-",
      row.submissionStatus,
      finalMarks(row),
    ].join(",")
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "faculty-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(rows: EnrichedRow[], subjectName: string) {
  const doc = new jsPDF({ orientation: "landscape" });

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Faculty Lab Report", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (subjectName) {
    doc.text(`Subject: ${subjectName}`, 14, 21);
  }
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 27);

  autoTable(doc, {
    startY: 33,
    head: [["Student", "Register No", "Exp No", "Experiment Title", "Submitted On", "Status", "Marks"]],
    body: rows.map((row) => [
      row.full_name,
      row.register_no,
      String(row.experiment_no ?? "-"),
      row.title,
      row.submissionDateDisplay || "-",
      row.submissionStatus,
      String(finalMarks(row)),
    ]),
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [67, 56, 202], fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 28 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 60 },
      4: { cellWidth: 24, halign: "center" },
      5: {
        cellWidth: 28,
        halign: "center",
      },
      6: { cellWidth: 16, halign: "center" },
    },
    didParseCell: (data) => {
      // Colour-code the Status column
      if (data.section === "body" && data.column.index === 5) {
        const val = String(data.cell.raw ?? "");
        if (val === "Late Submission") {
          data.cell.styles.textColor = [220, 38, 38]; // red
          data.cell.styles.fontStyle = "bold";
        } else if (val === "On Time") {
          data.cell.styles.textColor = [22, 163, 74]; // green
          data.cell.styles.fontStyle = "bold";
        } else if (val === "Pending") {
          data.cell.styles.textColor = [100, 116, 139]; // slate
        }
      }
    },
  });

  // Summary stats at bottom
  const late = rows.filter((r) => r.isLate).length;
  const onTime = rows.filter((r) => !r.isLate && r.submissionDateDisplay).length;
  const pending = rows.filter((r) => !r.submissionDateDisplay).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? 33;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Summary — On Time: ${onTime}  |  Late: ${late}  |  Pending: ${pending}  |  Total Marks: ${rows.reduce((s, r) => s + finalMarks(r), 0)}`,
    14,
    finalY + 8
  );

  doc.save("faculty-report.pdf");
}

export default function FacultyReportsReal() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name") ?? "";
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError("");

    // 1. Subject metadata for filtering
    const { data: subjectMeta, error: subjectError } = await supabase
      .from("subjects")
      .select("id, department, year, semester")
      .eq("id", subjectId)
      .maybeSingle();
    if (subjectError) {
      setError(subjectError.message);
      setLoading(false);
      return;
    }

    // 2. Submission rows including submission timestamp
    const { data, error: loadError } = await supabase
      .from("full_student_data")
      .select(
        "id, student_id, subject_id, experiment_no, title, faculty_marks, ai_marks, student_name, name, register_no, register_number, department, year, semester, submitted_date, status"
      )
      .eq("subject_id", subjectId)
      .order("experiment_no", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    // 3. Fetch experiment due_dates for this subject
    let dueDateMap: Record<string | number, string | null> = {};
    const { data: expData } = await supabase
      .from("experiments")
      .select("experiment_no, due_date")
      .eq("subject_id", subjectId);
    if (Array.isArray(expData)) {
      for (const exp of expData) {
        const key = exp.experiment_no ?? "";
        if (key !== "") dueDateMap[key] = exp.due_date ?? null;
      }
    }

    const mapped = sortByExperimentNo(
      (data || []).map((row: any) => ({
        id: String(row.id || `${row.student_id || "unknown"}-${row.experiment_no || "0"}`),
        full_name: String(row.student_name || row.name || "").trim(),
        register_no: String(row.register_no || row.register_number || "").trim(),
        department: String(row.department || "").trim(),
        year: String(row.year || "").trim(),
        semester: String(row.semester || "").trim(),
        experiment_no: row.experiment_no ?? null,
        title: String(row.title || "Experiment"),
        faculty_marks: row.submitted_date ? (row.faculty_marks ?? null) : null,
        ai_marks: row.submitted_date ? (row.ai_marks ?? null) : null,
        submitted_at: row.submitted_date ?? null,
        due_date: dueDateMap[row.experiment_no ?? ""] ?? null,
      })),
      (row) => row.experiment_no
    )
      .filter((row) => row.full_name && row.register_no)
      .filter((row) => {
        const hasDeptRule = Boolean(subjectMeta?.department);
        const hasYearRule = Boolean(subjectMeta?.year);
        const hasSemesterRule = Boolean(subjectMeta?.semester);
        if (hasDeptRule && !sameDepartment(row.department, subjectMeta?.department)) return false;
        if (hasYearRule && !sameAcademicToken(row.year, subjectMeta?.year)) return false;
        if (hasSemesterRule && !sameAcademicToken(row.semester, subjectMeta?.semester)) return false;
        return true;
      });
    setRows(mapped);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const enriched = useMemo(() => enrichRows(rows), [rows]);
  const total = useMemo(() => enriched.reduce((sum, row) => sum + finalMarks(row), 0), [enriched]);
  const lateCount = useMemo(() => enriched.filter((r) => r.isLate).length, [enriched]);
  const onTimeCount = useMemo(() => enriched.filter((r) => !r.isLate && r.submissionDateDisplay).length, [enriched]);
  const pendingCount = useMemo(() => enriched.filter((r) => !r.submissionDateDisplay).length, [enriched]);

  return (
    <div className="space-y-4 text-slate-800">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Faculty Reports</h1>
        {subjectName && <p className="text-sm text-slate-500 mt-1">{subjectName}</p>}
      </div>

      {/* Summary stats */}
      {!loading && enriched.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "On Time", value: onTimeCount, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
            { label: "Late Submissions", value: lateCount, color: "text-rose-700 bg-rose-50 border-rose-200" },
            { label: "Pending", value: pendingCount, color: "text-slate-600 bg-slate-50 border-slate-200" },
            { label: "Total Marks", value: total, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border px-4 py-3 ${color}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
              <p className="text-2xl font-extrabold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { if (enriched.length > 0) downloadCsv(enriched); }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
        >
          Download CSV
        </button>
        <button
          onClick={() => { if (enriched.length > 0) downloadPdf(enriched, subjectName); }}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition"
        >
          Download PDF
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {!loading && enriched.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No submissions found
        </div>
      ) : null}

      {enriched.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Register No</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Exp No</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Experiment Title</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Submitted On</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Marks</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium">{row.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.register_no}</td>
                  <td className="px-4 py-3 text-center">{row.experiment_no ?? "-"}</td>
                  <td className="px-4 py-3">{row.title}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.submissionDateDisplay || <span className="text-slate-400 italic text-xs">Not submitted</span>}
                  </td>
                  <td className="px-4 py-3">
                    {row.submissionDateDisplay ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          row.isLate
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {row.isLate ? "Late" : "On Time"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold">{finalMarks(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
