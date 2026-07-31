import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Brain, Save, Sparkles } from "lucide-react";
import { evaluateSubmissionContent } from "@/utils/evaluationEngine";
import {
  getFacultyUnifiedData,
  saveFacultyRecordOverride,
  type FacultyUnifiedRow,
} from "@/utils/unifiedStudentData";
import { getDepartmentForSubject } from "@/utils/subjectDepartmentMap";
import { getStudentsByDepartment } from "@/data/studentPool";

function formatAiScoreOutOf10(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Not Evaluated";
  const normalized = parsed > 10 ? parsed / 10 : parsed;
  const display = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
  return `${display} / 10`;
}

export default function FacultySubmissionDetail() {
  const navigate = useNavigate();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id") || "";
  const selectedSubjectName = localStorage.getItem("faculty_subject_name") || "Selected Subject";
  const departmentName = getDepartmentForSubject(selectedSubjectName) || "UNMAPPED";
  const [rows, setRows] = useState<FacultyUnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRow, setSavingRow] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!selectedSubjectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getFacultyUnifiedData({
        subjectId: selectedSubjectId,
        subjectName: selectedSubjectName,
      });
      const allowedRegs = new Set(
        getStudentsByDepartment(selectedSubjectName).map((student) => student.regNo)
      );
      const strictRows = data.rows.filter((row) => {
        if (allowedRegs.size === 0) return false;
        const allowed = allowedRegs.has(row.registerNumber);
        if (!allowed) console.warn("Cross-department data blocked");
        return allowed;
      });
      setRows(strictRows);
    } finally {
      setLoading(false);
    }
  }, [selectedSubjectId, selectedSubjectName]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const evaluateRow = useCallback((target: FacultyUnifiedRow) => {
    const evaluated = evaluateSubmissionContent({
      aim: target.aim,
      algorithm: target.algorithm,
      program: target.program,
      output: target.output,
      result: target.result,
      studentName: target.studentName,
      experimentId: target.experimentNo,
      autoGenerateIfEmpty: true,
    });
    const aiScore = Number(evaluated.aiScore ?? target.aiScore ?? 0);
    const marks = Number(evaluated.marksOutOf10 ?? target.marks ?? 0);
    setRows((prev) =>
      prev.map((row) =>
        row.key === target.key
          ? {
              ...row,
              aiScore,
              confidence: Number(evaluated.confidence ?? row.confidence ?? 0),
              marks,
              status: "evaluated",
            }
          : row
      )
    );
  }, []);

  const saveRow = useCallback(async (target: FacultyUnifiedRow) => {
    setSavingRow(target.key);
    try {
      saveFacultyRecordOverride(target.key, {
        marks: Number(target.marks ?? 0),
        aiScore: Number(target.aiScore ?? 0),
        status: target.status,
      });
    } finally {
      setSavingRow(null);
    }
  }, []);

  const summary = useMemo(() => {
    const students = new Set(rows.map((row) => row.registerNumber)).size;
    const completed = rows.filter((row) => Number(row.marks || 0) > 0).length;
    return { students, completed, total: rows.length };
  }, [rows]);

  if (!selectedSubjectId) {
    return (
      <div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="text-sm font-medium text-amber-800">Select a subject to view submissions.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] text-slate-800">
      <button
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-5 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-5">
        <h1 className="text-2xl font-bold text-slate-900">Faculty Submission Evaluation</h1>
        <p className="mt-1 text-sm text-slate-600">{selectedSubjectName}</p>
        <p className="mt-1 text-sm font-semibold text-indigo-700">Department: {departmentName}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700">
            Students: {summary.students}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
            Completed: {summary.completed}/{summary.total}
          </span>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-semibold text-indigo-700">
            AI Assisted Evaluation
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading multi-student submissions...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Student Name</th>
                <th className="px-4 py-3 text-left">Register Number</th>
                <th className="px-4 py-3 text-left">Experiment</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Marks</th>
                <th className="px-4 py-3 text-left">AI Score</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.registerNumber}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.experimentNo}. {row.experimentName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">
                    {row.marks != null && row.marks > 0 ? `${Number(row.marks).toFixed(2)} / 10` : "Not Evaluated"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-indigo-700">
                    {formatAiScoreOutOf10(row.aiScore)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => evaluateRow(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Brain className="h-3.5 w-3.5" />
                        Evaluate
                      </button>
                      <button
                        onClick={() => saveRow(row)}
                        disabled={savingRow === row.key}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingRow === row.key ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 inline-flex items-center gap-1 text-xs text-slate-500">
        <Sparkles className="h-3.5 w-3.5" />
        Evaluate runs AI scoring and auto-generates marks instantly. Save persists state for dashboard, leaderboard, charts, and PDF.
      </p>
    </div>
  );
}
