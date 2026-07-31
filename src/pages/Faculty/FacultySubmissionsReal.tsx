import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFacultyStudentsListResultUnified } from "@/services/facultyDataService";
import { sortByExperimentNo } from "@/utils/experimentOrder";

type Submission = {
  id: string;
  full_name: string;
  register_no: string;
  department?: string;
  year?: string;
  semester?: string;
  experiment_no: string | number | null;
  title: string;
  submitted_date: string | null;
  status: string;
  can_view: boolean;
};

const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";

function isUuidLike(value: unknown): boolean {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("roster-")) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

function safeStudentName(value: unknown): string {
  const text = String(value || "").trim();
  return !text || isUuidLike(text) ? "Student" : text;
}

function safeRegister(value: unknown): string {
  const text = String(value || "").trim();
  return !text || isUuidLike(text) ? "-" : text;
}

function isResolvedSubmissionRow(row: Submission): boolean {
  return safeStudentName(row?.full_name) !== "Student" && safeRegister(row?.register_no) !== "-";
}

function isFacultyLikeName(value: unknown): boolean {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return true;
  if (/^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(name)) return true;
  if (name.includes("faculty") || name.includes("admin")) return true;
  return false;
}

function normalizeStatus(value: unknown): string {
  const status = String(value || "").toLowerCase().trim();
  if (status === "approved" || status === "evaluated") return "evaluated";
  if (status === "submitted") return "submitted";
  if (status === "pending") return "pending";
  return "draft";
}

export default function FacultySubmissionsReal() {
  const navigate = useNavigate();
  const subjectId = localStorage.getItem("faculty_subject_id");
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError("");
    try {
      const fullPrimaryRes = await supabase
        .from("full_student_data")
        .select("id,student_id,student_name,name,register_no,register_number,experiment_no,title,submitted_date,status")
        .eq("subject_id", subjectId)
        .in("status", ["submitted", "evaluated", "approved"])
        .order("submitted_date", { ascending: false });
      if (!fullPrimaryRes.error && Array.isArray(fullPrimaryRes.data) && fullPrimaryRes.data.length > 0) {
        const mappedFromFull = sortByExperimentNo(
          fullPrimaryRes.data
          .map((row: any) => {
            const fullName = String(row?.student_name || row?.name || "").trim();
            const registerNo = String(row?.register_no || row?.register_number || "").trim();
            if (!fullName || !registerNo) return null;
            if (isFacultyLikeName(fullName)) return null;
            return {
              id: String(row.id || ""),
              full_name: fullName,
              register_no: registerNo,
              department: "",
              year: "",
              semester: "",
              experiment_no: row?.experiment_no ?? null,
              title: String(row?.title || "Experiment"),
              submitted_date: row?.submitted_date || null,
              status: normalizeStatus(row?.status),
              can_view: true,
            };
          })
          .filter((row): row is Submission => Boolean(row)),
          (row) => row.experiment_no
        );
        setRows(mappedFromFull);
        setLoading(false);
        return;
      }

      const { data: experiments, error: experimentsError } = await supabase
        .from("experiments")
        .select("id, title, experiment_no")
        .eq("subject_id", subjectId)
        .order("experiment_no", { ascending: true });
      if (experimentsError) {
        setError(experimentsError.message || "Failed to load experiments.");
        setRows([]);
        setLoading(false);
        return;
      }

      const experimentIds = (experiments || [])
        .map((exp: any) => String(exp.id || "").trim())
        .filter(Boolean);
      if (experimentIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const experimentMap = new Map(
        (experiments || []).map((exp: any) => [String(exp.id || ""), exp])
      );

      const { data: seRows, error: seError } = await supabase
        .from("student_experiments")
        .select("id, student_id, experiment_id, status, submitted_date")
        .in("experiment_id", experimentIds)
        .in("status", ["submitted", "evaluated", "approved"])
        .order("submitted_date", { ascending: false });
      if (seError) {
        setError(seError.message || "Failed to load student experiment submissions.");
        setRows([]);
        setLoading(false);
        return;
      }

      let sourceRows: any[] = Array.isArray(seRows) ? seRows : [];
      let sourceType: "student_experiments" | "submissions" = "student_experiments";

      if (sourceRows.length === 0) {
        const submissionResponse = await supabase
          .from("submissions")
          .select("*")
          .eq("subject_id", subjectId);
        if (submissionResponse.error) {
          setError(submissionResponse.error.message || "Failed to load submissions.");
          setRows([]);
          setLoading(false);
          return;
        }
        sourceRows = (Array.isArray(submissionResponse.data) ? submissionResponse.data : []).filter((row: any) => {
          const expId = String(row?.exp_id || row?.experiment_id || "").trim();
          return expId ? experimentMap.has(expId) : true;
        });
        sourceType = "submissions";
      }

      // Avoid enum/value mismatch errors in SQL filter and keep this client-safe.
      sourceRows = sourceRows.filter((row: any) =>
        ["submitted", "evaluated", "approved"].includes(String(row?.status || "").toLowerCase().trim())
      );

      // Enrich identity from full_student_data (typically readable for faculty even when profiles is restricted).
      const fullIdentityMap = new Map<string, { full_name: string; register_no: string }>();
      const fullIdentityByStudent = new Map<string, { full_name: string; register_no: string }>();
      const fullRes = await supabase
        .from("full_student_data")
        .select("student_id, experiment_id, exp_id, student_name, name, register_no, register_number")
        .eq("subject_id", subjectId);
      if (!fullRes.error && Array.isArray(fullRes.data)) {
        fullRes.data.forEach((row: any) => {
          const sid = String(row?.student_id || "").trim();
          const expId = String(row?.experiment_id || row?.exp_id || "").trim();
          const fullName = String(row?.student_name || row?.name || "").trim();
          const registerNo = String(row?.register_no || row?.register_number || "").trim();
          if (!sid || !fullName || !registerNo) return;
          if (expId) {
            fullIdentityMap.set(`${sid}:${expId}`, { full_name: fullName, register_no: registerNo });
          }
          if (!fullIdentityByStudent.has(sid)) {
            fullIdentityByStudent.set(sid, { full_name: fullName, register_no: registerNo });
          }
        });
      }

      const studentIds = [
        ...new Set(sourceRows.map((row: any) => String(row.student_id || "").trim()).filter(Boolean)),
      ];
      let profileMap = new Map<string, any>();
      if (studentIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, name, register_no, role, department, year, semester")
          .in("id", studentIds);
        if (profileError) {
          setError(profileError.message || "Failed to load student profiles.");
          setRows([]);
          setLoading(false);
          return;
        }
        profileMap = new Map((profiles || []).map((p: any) => [String(p.id || ""), p]));
      }

      const mapped = sortByExperimentNo(
        sourceRows
        .map((row: any) => {
          const profile = profileMap.get(String(row.student_id || ""));
          const experimentId = String(
            sourceType === "submissions" ? row.exp_id || row.experiment_id || "" : row.experiment_id || ""
          ).trim();
          const sid = String(row.student_id || "").trim();
          const identityFromFull =
            fullIdentityMap.get(`${sid}:${experimentId}`) || fullIdentityByStudent.get(sid) || null;
          const fullName = String(
            identityFromFull?.full_name ||
              profile?.name ||
              row.student_name ||
              row.name ||
              row.studentName ||
              row.student ||
              ""
          ).trim();
          const registerNo = String(
            identityFromFull?.register_no ||
              profile?.register_no ||
              row.register_no ||
              row.register_number ||
              row.registerNo ||
              row.reg_no ||
              ""
          ).trim();
          const role = String(profile?.role || "").toLowerCase().trim();
          if (role === "faculty" || role === "admin") return null;
          if (fullName && isFacultyLikeName(fullName)) return null;
          const exp = experimentMap.get(experimentId);
          return {
            id: String(row.id || ""),
            full_name: fullName || `Student ${String(row.student_id || "").slice(0, 8)}`,
            register_no: registerNo || "-",
            department: String(profile?.department || "").trim(),
            year: String(profile?.year || "").trim(),
            semester: String(profile?.semester || "").trim(),
            experiment_no: exp?.experiment_no ?? null,
            title: String(exp?.title || "Experiment"),
            submitted_date:
              sourceType === "submissions"
                ? row.updated_at || row.submitted_date || null
                : row.submitted_date || null,
            status: normalizeStatus(row.status),
            can_view: true,
          };
        })
        .filter((row): row is Submission => Boolean(row)),
        (row) => row.experiment_no
      );

      if (mapped.length > 0) {
        setRows(mapped);
      } else {
        let rosterRows: Submission[] = [];
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const response = await fetch(
            `${MANUAL_API_BASE_URL}/api/manual/faculty/students-all/${encodeURIComponent(subjectId)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.success && Array.isArray(payload?.data)) {
            rosterRows = payload.data.map((row: any) => ({
              id: String(row.id || row.register_no || ""),
              full_name: safeStudentName(row.name),
              register_no: safeRegister(row.register_no),
              department: String(row.department || ""),
              year: String(row.year || ""),
              semester: String(row.semester || ""),
              experiment_no: null,
              title: "-",
              submitted_date: null,
              status: "pending",
              can_view: false,
            }));
          }
        }
        if (rosterRows.length === 0) {
          const roster = await getFacultyStudentsListResultUnified(subjectId);
          rosterRows = (Array.isArray(roster?.rows) ? roster.rows : []).map((row: any) => ({
            id: String(row.id || row.register_no || ""),
            full_name: safeStudentName(row.student_name),
            register_no: safeRegister(row.register_no),
            department: String(row.department || ""),
            year: String(row.year || ""),
            semester: String(row.semester || ""),
            experiment_no: null,
            title: String(row.experiment || "-"),
            submitted_date: null,
            status: "pending",
            can_view: false,
          }));
        }
        setRows(rosterRows);
      }
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message || "Failed to load submissions.")
          : "Failed to load submissions.";
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void fetchData();

    if (!subjectId) return;

    const channel = supabase
      .channel(`faculty_submissions_${subjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `subject_id=eq.${subjectId}`,
        },
        () => {
          console.log("[Realtime] Submissions table changed. Updating Submissions list...");
          void fetchData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, subjectId]);

  const visibleRows = useMemo(() => rows.filter((row) => isResolvedSubmissionRow(row)), [rows]);

  const submittedCount = useMemo(
    () => visibleRows.filter((r) => r.status.toLowerCase() === "submitted").length,
    [visibleRows]
  );
  const evaluatedCount = useMemo(
    () => visibleRows.filter((r) => r.status.toLowerCase() === "evaluated").length,
    [visibleRows]
  );

  if (!subjectId) return <Navigate to="/faculty/subjects" replace />;

  return (
    <div className="space-y-4 text-slate-800">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Student Submissions</h1>
        <p className="text-sm text-slate-600">Submitted records from subject-scoped student experiments.</p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Records</p>
          <p className="text-xl font-bold text-slate-900">{visibleRows.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Submitted</p>
          <p className="text-xl font-bold text-slate-900">{submittedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Evaluated</p>
          <p className="text-xl font-bold text-slate-900">{evaluatedCount}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No resolved student submissions found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Register No</th>
                <th className="px-4 py-3 text-left">Experiment</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{safeStudentName(row.full_name)}</td>
                  <td className="px-4 py-3">{safeRegister(row.register_no)}</td>
                  <td className="px-4 py-3">
                    {row.experiment_no ? `Experiment ${row.experiment_no} - ` : ""}
                    {row.title}
                  </td>
                  <td className="px-4 py-3">{row.submitted_date ? new Date(row.submitted_date).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => row.can_view && navigate(`/faculty/submission/${row.id}`)}
                      disabled={!row.can_view}
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 ${
                        row.can_view
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      <Eye className="h-4 w-4" />
                      {row.can_view ? "View" : "No Submission"}
                    </button>
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
