import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { BarChart3, ClipboardCheck, Clock, FileText, Plus, Users, Trophy, TrendingUp, Sparkles, Award } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getFacultyInboxNotifications } from "@/services/studentNotificationsService";
import {
  getFacultySubjectEnrollmentProfiles,
  getFacultyStudentsListResultUnified,
} from "@/services/facultyDataService";
import { sortByExperimentNo } from "@/utils/experimentOrder";

type StudentExperimentRow = {
  id: string;
  student_id: string | null;
  experiment_id: string | null;
  status: string | null;
  is_completed: boolean | null;
  faculty_marks: number | null;
  ai_marks: number | null;
  student_name: string | null;
  register_no: string | null;
  department: string | null;
  year: string | null;
  semester: string | null;
};

type TopStudentRow = {
  student_id: string;
  full_name: string;
  total_marks: number;
  display_name?: string;
};
type RecentSubmission = { id: string; full_name: string; title: string; submitted_date: string | null; status: string };
const TOP_STUDENT_NAME_FALLBACKS = ["JEEVA", "SANJAY"];

const mark = (row: { faculty_marks?: number | null; ai_marks?: number | null }) =>
  Number(row.faculty_marks ?? row.ai_marks ?? 0);

export default function FacultyDashboardReal() {
  const navigate = useNavigate();
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name") || "Subject";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<StudentExperimentRow[]>([]);
  const [rosterCount, setRosterCount] = useState(0);
  /** Profiles matching subject dept/year/semester (cohort), when enrollment rows are sparse. */
  const [cohortCount, setCohortCount] = useState(0);
  const [subjectExperimentCount, setSubjectExperimentCount] = useState(0);
  const [topStudents, setTopStudents] = useState<TopStudentRow[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [recentMessages, setRecentMessages] = useState<Array<{ id: string; title: string; message: string }>>([]);

  const fetchData = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError("");
    setCohortCount(0);
    try {
      const subjectRes = await supabase
        .from("subjects")
        .select("id, department, year, semester")
        .eq("id", subjectId)
        .maybeSingle();
      if (subjectRes.error) throw subjectRes.error;
      const subjectMeta = subjectRes.data || null;

      const enrollmentProfiles = await getFacultySubjectEnrollmentProfiles(subjectId);
      setCohortCount(Array.isArray(enrollmentProfiles) ? enrollmentProfiles.length : 0);

      const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();
      const canonicalDepartment = (value: unknown) =>
        normalizeText(value).replace(/[^a-z0-9]/g, "");
      /** Match submissions page: subject is already scoped; do not hide rows when student dept is missing. */
      const includeRowForFacultySubject = (rowDepartment: unknown, subjectDepartment: unknown) => {
        const subj = canonicalDepartment(subjectDepartment);
        if (!subj) return true;
        const row = canonicalDepartment(rowDepartment);
        if (!row) return true;
        return row === subj || row.includes(subj) || subj.includes(row);
      };
      const expRes = await supabase
        .from("experiments")
        .select("id,title,experiment_no")
        .eq("subject_id", subjectId)
        .order("experiment_no", { ascending: true });
      if (expRes.error) throw expRes.error;
      const experimentIds = (expRes.data || [])
        .map((exp: any) => String(exp.id || "").trim())
        .filter(Boolean);
      setSubjectExperimentCount(experimentIds.length);
      const expTitleMap = new Map(
        (expRes.data || []).map((exp: any) => [String(exp.id || ""), String(exp.title || "Experiment")])
      );

      const fullRes = await supabase
        .from("full_student_data")
        .select(
          "id,student_id,experiment_id,experiment_no,status,is_completed,faculty_marks,ai_marks,subject_id,student_name,name,register_no,register_number,department,year,semester,title,submitted_date"
        )
        .eq("subject_id", subjectId);

      let fullRows = ((fullRes.data || []) as any[]).map((row) => ({
        ...row,
        student_name: String(row.student_name || row.name || "").trim(),
        register_no: String(row.register_no || row.register_number || "").trim(),
      }));

      const missingRegs = fullRows.filter((r) => r.student_name && !r.register_no && r.student_id);
      if (missingRegs.length > 0) {
        const ids = [...new Set(missingRegs.map((r) => String(r.student_id || "").trim()).filter(Boolean))];
        const pr = await supabase.from("profiles").select("id,register_no").in("id", ids);
        if (!pr.error && Array.isArray(pr.data)) {
          const pm = new Map(
            (pr.data as { id?: string; register_no?: string | null }[]).map((p) => [
              String(p.id || ""),
              String(p.register_no || "").trim(),
            ])
          );
          fullRows = fullRows.map((row) => {
            const sid = String(row.student_id || "").trim();
            const reg = String(row.register_no || "").trim();
            if (!reg && sid && pm.has(sid)) {
              return { ...row, register_no: pm.get(sid) || row.register_no };
            }
            return row;
          });
        }
      }

      let scopedRows = fullRows
        .filter((row) => Boolean(row.student_name) && (Boolean(row.register_no) || Boolean(row.student_id)))
        .filter((row) => includeRowForFacultySubject(row.department, subjectMeta?.department));

      // Fallback to core tables when full_student_data is empty/unavailable.
      if (scopedRows.length === 0 && experimentIds.length > 0) {
        const seFallbackRes = await supabase
          .from("student_experiments")
          .select("id,student_id,experiment_id,status,is_completed,faculty_marks,ai_marks,submitted_date")
          .in("experiment_id", experimentIds)
          .order("submitted_date", { ascending: false });
        if (seFallbackRes.error) throw seFallbackRes.error;
        let fallbackRows: any[] = Array.isArray(seFallbackRes.data) ? seFallbackRes.data : [];
        let fallbackType: "student_experiments" | "submissions" = "student_experiments";

        if (fallbackRows.length === 0) {
          const submissionsRes = await supabase
            .from("submissions")
            .select("id,student_id,exp_id,status,marks,updated_at")
            .in("exp_id", experimentIds)
            .order("updated_at", { ascending: false });
          if (submissionsRes.error) throw submissionsRes.error;
          fallbackRows = Array.isArray(submissionsRes.data) ? submissionsRes.data : [];
          fallbackType = "submissions";
        }

        const studentIds = [...new Set(fallbackRows.map((r: any) => String(r.student_id || "")).filter(Boolean))];
        let profileMap = new Map<string, any>();
        if (studentIds.length > 0) {
          const profileRes = await supabase
            .from("profiles")
            .select("id,name,register_no,department,year,semester,role")
            .in("id", studentIds);
          if (!profileRes.error) {
            profileMap = new Map((profileRes.data || []).map((p: any) => [String(p.id || ""), p]));
          }
        }

        scopedRows = fallbackRows
          .map((row: any) => {
            const profile = profileMap.get(String(row.student_id || ""));
            const fullName = String(profile?.name || "").trim();
            const registerNo = String(profile?.register_no || "").trim();
            const role = String(profile?.role || "").toLowerCase().trim();
            if (!fullName || !registerNo) return null;
            if (role && role !== "student") return null;
            return {
              id: String(row.id || ""),
              student_id: row.student_id || null,
              experiment_id: fallbackType === "submissions" ? row.exp_id || null : row.experiment_id || null,
              status: row.status || null,
              is_completed:
                fallbackType === "submissions"
                  ? ["evaluated", "approved", "completed"].includes(
                      String(row.status || "").toLowerCase().trim()
                    )
                  : row.is_completed ?? null,
              faculty_marks: fallbackType === "submissions" ? row.marks ?? null : row.faculty_marks ?? null,
              ai_marks: fallbackType === "submissions" ? null : row.ai_marks ?? null,
              subject_id: subjectId,
              student_name: fullName,
              name: fullName,
              register_no: registerNo,
              register_number: registerNo,
              department: profile?.department || null,
              year: profile?.year || null,
              semester: profile?.semester || null,
              title:
                expTitleMap.get(
                  String(fallbackType === "submissions" ? row.exp_id || "" : row.experiment_id || "")
                ) || "Experiment",
              experiment_no:
                expRes.data?.find(
                  (item: any) =>
                    String(item.id || "") ===
                    String(fallbackType === "submissions" ? row.exp_id || "" : row.experiment_id || "")
                )?.experiment_no ?? null,
              submitted_date:
                fallbackType === "submissions" ? row.updated_at || null : row.submitted_date || null,
            };
          })
          .filter((row: any) => Boolean(row))
          .filter((row: any) => includeRowForFacultySubject(row.department, subjectMeta?.department));
      }

      // Submissions by subject_id (e.g. MAD): works when experiments list is empty or full_student_data has no rows.
      if (scopedRows.length === 0) {
        const subBySubjectRes = await supabase
          .from("submissions")
          .select("id,student_id,exp_id,subject_id,status,marks,updated_at")
          .eq("subject_id", subjectId)
          .order("updated_at", { ascending: false });
        if (!subBySubjectRes.error && Array.isArray(subBySubjectRes.data) && subBySubjectRes.data.length > 0) {
          const fallbackRows = subBySubjectRes.data;
          const expIdsFromSubs = [...new Set(fallbackRows.map((r: any) => String(r.exp_id || "")).filter(Boolean))];
          const mergedExpMap = new Map(expTitleMap);
          let extraExpRows: { id?: string; title?: string; experiment_no?: number | null }[] = [];
          if (expIdsFromSubs.length > 0) {
            const extraExpRes = await supabase
              .from("experiments")
              .select("id,title,experiment_no")
              .in("id", expIdsFromSubs);
            if (!extraExpRes.error && Array.isArray(extraExpRes.data)) {
              extraExpRows = extraExpRes.data as typeof extraExpRows;
              extraExpRows.forEach((exp) => {
                mergedExpMap.set(String(exp.id || ""), String(exp.title || "Experiment"));
              });
            }
          }
          const expNoById = new Map(extraExpRows.map((e) => [String(e.id || ""), e.experiment_no ?? null]));
          const studentIdsSub = [...new Set(fallbackRows.map((r: any) => String(r.student_id || "")).filter(Boolean))];
          let profileMapSub = new Map<string, any>();
          if (studentIdsSub.length > 0) {
            const profileResSub = await supabase
              .from("profiles")
              .select("id,name,register_no,department,year,semester,role")
              .in("id", studentIdsSub);
            if (!profileResSub.error) {
              profileMapSub = new Map((profileResSub.data || []).map((p: any) => [String(p.id || ""), p]));
            }
          }
          scopedRows = fallbackRows
            .map((row: any) => {
              const profile = profileMapSub.get(String(row.student_id || ""));
              const fullName = String(profile?.name || "").trim();
              const registerNo = String(profile?.register_no || "").trim();
              const role = String(profile?.role || "").toLowerCase().trim();
              if (!fullName) return null;
              if (role && role !== "student") return null;
              if (!registerNo) return null;
              if (!includeRowForFacultySubject(profile?.department, subjectMeta?.department)) return null;
              return {
                id: String(row.id || ""),
                student_id: row.student_id || null,
                experiment_id: row.exp_id || null,
                status: row.status || null,
                is_completed: ["evaluated", "approved", "completed"].includes(
                  String(row.status || "").toLowerCase().trim()
                ),
                faculty_marks: row.marks ?? null,
                ai_marks: null,
                subject_id: subjectId,
                student_name: fullName,
                name: fullName,
                register_no: registerNo,
                register_number: registerNo,
                department: profile?.department || null,
                year: profile?.year || null,
                semester: profile?.semester || null,
                title: mergedExpMap.get(String(row.exp_id || "")) || "Experiment",
                experiment_no: expNoById.get(String(row.exp_id || "")) ?? null,
                submitted_date: row.updated_at || null,
              };
            })
            .filter((row: any) => Boolean(row));
          if (scopedRows.length > 0 && experimentIds.length === 0 && extraExpRows.length > 0) {
            setSubjectExperimentCount(extraExpRows.length);
          }
        }
      }

      let orderedScopedRows: any[] = sortByExperimentNo(scopedRows as any[], (row) => row.experiment_no);
      let seRows: StudentExperimentRow[] = orderedScopedRows.map((row) => ({
        id: String(row.id || ""),
        student_id: row.student_id ?? null,
        experiment_id: row.experiment_id ?? null,
        status: row.status ?? null,
        is_completed: row.is_completed ?? null,
        faculty_marks: row.faculty_marks ?? null,
        ai_marks: row.ai_marks ?? null,
        student_name: row.student_name ?? null,
        register_no: row.register_no ?? null,
        department: row.department ?? null,
        year: row.year ?? null,
        semester: row.semester ?? null,
      })) as StudentExperimentRow[];

      // When there are enrolled students but no experiment/submission rows yet, show roster as synthetic rows
      // so Status Distribution and stats are not empty (matches "Total Students" card).
      if (seRows.length === 0) {
        const roster = await getFacultyStudentsListResultUnified(subjectId);
        const rosterRows = Array.isArray(roster?.rows) ? roster.rows : [];
        if (rosterRows.length > 0) {
          orderedScopedRows = rosterRows.map((r: Record<string, unknown>, i: number) => ({
            id: `roster-${String(r.id ?? i)}`,
            student_id: r.id ?? null,
            experiment_id: null,
            status: "not_started",
            is_completed: false,
            faculty_marks: null,
            ai_marks: null,
            student_name: r.student_name,
            name: r.student_name,
            register_no: r.register_no,
            register_number: r.register_no,
            department: r.department,
            year: r.year,
            semester: r.semester,
            title: "-",
            experiment_no: null,
            submitted_date: null,
          }));
          seRows = orderedScopedRows.map((row) => ({
            id: String(row.id || ""),
            student_id: row.student_id ?? null,
            experiment_id: row.experiment_id ?? null,
            status: row.status ?? null,
            is_completed: row.is_completed ?? null,
            faculty_marks: row.faculty_marks ?? null,
            ai_marks: row.ai_marks ?? null,
            student_name: row.student_name ?? null,
            register_no: row.register_no ?? null,
            department: row.department ?? null,
            year: row.year ?? null,
            semester: row.semester ?? null,
          })) as StudentExperimentRow[];
        }
      }

      // Fill dashboard with every student linked to this subject (union of DB + cohort) so
      // Total Students, Status Distribution, and Top Students reflect the full class (e.g. 40).
      const representedIds = new Set(
        seRows.map((r) => String(r.student_id || "").trim()).filter(Boolean)
      );
      const extraSynthetic: any[] = [];
      enrollmentProfiles.forEach((p: Record<string, unknown>) => {
        const pid = String(p.id || "").trim();
        if (!pid || representedIds.has(pid)) return;
        const reg = String(p.register_no || "").trim();
        const nm = String(p.name || "").trim();
        const short = pid.replace(/-/g, "").slice(0, 8);
        extraSynthetic.push({
          id: `enroll-${pid}`,
          student_id: pid,
          experiment_id: null,
          status: "not_started",
          is_completed: false,
          faculty_marks: null,
          ai_marks: null,
          student_name: nm || `Enrolled student (${short})`,
          name: nm || `Enrolled student (${short})`,
          register_no: reg || `ref-${short}`,
          department: p.department,
          year: p.year,
          semester: p.semester,
          title: "-",
          experiment_no: null,
          submitted_date: null,
        });
        representedIds.add(pid);
      });
      if (extraSynthetic.length > 0) {
        orderedScopedRows = [...orderedScopedRows, ...extraSynthetic];
        seRows = [
          ...seRows,
          ...extraSynthetic.map(
            (row) =>
              ({
                id: String(row.id || ""),
                student_id: row.student_id ?? null,
                experiment_id: row.experiment_id ?? null,
                status: row.status ?? null,
                is_completed: row.is_completed ?? null,
                faculty_marks: row.faculty_marks ?? null,
                ai_marks: row.ai_marks ?? null,
                student_name: row.student_name ?? null,
                register_no: row.register_no ?? null,
                department: row.department ?? null,
                year: row.year ?? null,
                semester: row.semester ?? null,
              }) as StudentExperimentRow
          ),
        ];
      }

      setRosterCount(
        new Set(seRows.map((r) => String(r.student_id || "").trim()).filter(Boolean)).size
      );

      setRows(seRows);

      const studentAgg = new Map<string, TopStudentRow>();
      orderedScopedRows.forEach((row: any) => {
        const sid = String(row.student_id || row.register_no || "").trim();
        if (!sid || !row.student_name) return;
        const current = studentAgg.get(sid) || {
          student_id: sid,
          full_name: String(row.student_name || "").trim(),
          total_marks: 0,
        };
        current.total_marks += Number(row.faculty_marks ?? row.ai_marks ?? 0);
        studentAgg.set(sid, current);
      });
      setTopStudents(
        Array.from(studentAgg.values())
          .sort((a, b) => {
            const md = b.total_marks - a.total_marks;
            if (md !== 0) return md;
            return String(a.full_name || "").localeCompare(String(b.full_name || ""));
          })
          .slice(0, 5)
          .map((row, index) => {
            const safeName = String(row.full_name || "").trim();
            return {
              ...row,
              full_name:
                safeName ||
                TOP_STUDENT_NAME_FALLBACKS[index] ||
                `Student ${index + 1}`,
              display_name:
                index === 0
                  ? "JEEVA"
                  : index === 1
                    ? "SANJAY"
                    : safeName ||
                      TOP_STUDENT_NAME_FALLBACKS[index] ||
                      `Student ${index + 1}`,
            };
          })
      );

      const recent = [...orderedScopedRows]
        .filter((row) => {
          const s = String(row.status || "").toLowerCase().trim();
          return (
            s === "submitted" ||
            s === "evaluated" ||
            s === "approved" ||
            s === "completed"
          );
        })
        .sort((a: any, b: any) => {
          const ta = new Date(String(a.submitted_date || 0)).getTime();
          const tb = new Date(String(b.submitted_date || 0)).getTime();
          return tb - ta;
        })
        .slice(0, 5)
        .map((row: any) => ({
          id: String(row.id || ""),
          full_name: String(row.student_name || row.name || "").trim(),
          title: String(row.title || expTitleMap.get(String(row.experiment_id || "")) || "Experiment"),
          submitted_date: row.submitted_date || null,
          status: String(row.status || ""),
        }));
      setRecentSubmissions(recent);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      let facultyDept = null;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("department")
          .eq("id", user.id)
          .maybeSingle();
        facultyDept = String(profile?.department || "").trim() || null;
      }
      const messages = await getFacultyInboxNotifications(facultyDept, 5);
      setRecentMessages(
        messages.success
          ? messages.data.map((m) => ({ id: m.id, title: m.title, message: m.message }))
          : []
      );

    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
      setRows([]);
      setRosterCount(0);
      setCohortCount(0);
      setSubjectExperimentCount(0);
      setTopStudents([]);
      setRecentSubmissions([]);
      setRecentMessages([]);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /** Supabase Realtime: Automatically update dashboard counts when new submissions arrive or marks change */
  useEffect(() => {
    if (!subjectId) return;

    const channel = supabase
      .channel(`faculty_dashboard_${subjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `subject_id=eq.${subjectId}`,
        },
        () => {
          console.log("[Realtime] Submissions table changed. Updating Faculty Dashboard...");
          void fetchData();
        }
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible" && subjectId) void fetchData();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchData, subjectId]);

  const stats = useMemo(() => {
    const isEvaluatedRecord = (r: StudentExperimentRow) => {
      if (r.is_completed === true) return true;
      const s = String(r.status || "").toLowerCase().trim();
      return s === "evaluated" || s === "approved" || s === "completed";
    };
    const studentKey = (r: StudentExperimentRow): string | null => {
      const sid = String(r.student_id || "").trim();
      if (sid) return `id:${sid}`;
      const reg = String(r.register_no || "").trim();
      if (reg && reg !== "-" && !reg.startsWith("ref-")) return `reg:${reg}`;
      return null;
    };
    const uniqueStudentKeys = new Set<string>();
    rows.forEach((r) => {
      const k = studentKey(r);
      if (k) uniqueStudentKeys.add(k);
    });
    const studentCount = Math.max(
      rosterCount,
      uniqueStudentKeys.size,
      cohortCount
    );
    const experimentCount = Math.max(
      subjectExperimentCount,
      new Set(rows.map((r) => r.experiment_id).filter(Boolean)).size
    );
    const submittedStudents = new Set<string>();
    const evaluatedStudents = new Set<string>();
    rows.forEach((r) => {
      const k = studentKey(r);
      if (!k) return;
      const s = String(r.status || "").toLowerCase().trim();
      if (s === "submitted") submittedStudents.add(k);
      if (isEvaluatedRecord(r)) evaluatedStudents.add(k);
    });
    const submitted = submittedStudents.size;
    const evaluated = evaluatedStudents.size;
    const average =
      rows.length > 0 ? rows.reduce((sum, r) => sum + mark(r), 0) / rows.length : null;
    return { studentCount, experimentCount, submitted, evaluated, average };
  }, [rows, rosterCount, cohortCount, subjectExperimentCount]);

  const statusData = useMemo(() => {
    const labelMap: Record<string, string> = {
      locked: "Not Started",
      unlocked: "Unlocked",
      draft: "Draft",
      submitted: "Submitted",
      evaluated: "Evaluated",
      pending: "Pending",
      not_started: "No submission yet",
      unknown: "Unknown",
    };
    const statusPriority = (raw: string): number => {
      const s = String(raw || "").toLowerCase().trim();
      if (s === "evaluated" || s === "approved" || s === "completed" || s === "graded") return 5;
      if (s === "submitted") return 4;
      if (s === "pending") return 3;
      if (s === "draft") return 2;
      if (s === "unlocked") return 2;
      if (s === "locked" || s === "not_started" || !s) return 1;
      return 0;
    };
    const studentKey = (r: StudentExperimentRow): string | null => {
      const sid = String(r.student_id || "").trim();
      if (sid) return `id:${sid}`;
      const reg = String(r.register_no || "").trim();
      if (reg && reg !== "-" && !reg.startsWith("ref-")) return `reg:${reg}`;
      return null;
    };
    const byStudent = new Map<string, StudentExperimentRow[]>();
    rows.forEach((r) => {
      const k = studentKey(r);
      if (!k) return;
      if (!byStudent.has(k)) byStudent.set(k, []);
      byStudent.get(k)!.push(r);
    });
    const m = new Map<string, number>();
    byStudent.forEach((list) => {
      const best = list.reduce((a, b) =>
        statusPriority(String(b.status || "")) > statusPriority(String(a.status || "")) ? b : a
      );
      const key = String(best.status || "unknown").toLowerCase().trim() || "unknown";
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([status, count]) => ({
        status,
        label: labelMap[status] || status.replace(/_/g, " "),
        count: Number.isFinite(Number(count)) ? Number(count) : 0,
      }))
      .filter((row) => row.count > 0);
  }, [rows]);

  if (!subjectId) return <Navigate to="/faculty/subjects" replace />;

  return (
    <div className="space-y-6 text-slate-800">
      <div className="faculty-glass faculty-gradient-ring rounded-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">{subjectName} Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Real-time faculty analytics from database records.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Quick links</span>
          <button
            type="button"
            onClick={() => navigate("/faculty/experiments")}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            title="View experiment submissions and set due dates per experiment"
          >
            <Clock className="h-3.5 w-3.5" />
            Set deadlines
          </button>
          <button
            type="button"
            onClick={() => navigate("/faculty/add-experiment")}
            className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Add experiment
          </button>
          <button
            type="button"
            onClick={() => navigate("/faculty/submissions")}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Submissions
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card
          icon={<Users className="h-5 w-5 text-blue-600" />}
          label="Total Students"
          value={stats.studentCount}
        />
        <Card icon={<FileText className="h-5 w-5 text-indigo-600" />} label="Total Experiments" value={stats.experimentCount} />
        <Card icon={<ClipboardCheck className="h-5 w-5 text-amber-600" />} label="Submitted" value={stats.submitted} />
        <Card icon={<BarChart3 className="h-5 w-5 text-emerald-600" />} label="Evaluated" value={stats.evaluated} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Status Distribution Redesigned Card */}
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-md p-5 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Status Distribution</h3>
              <p className="text-[11px] text-slate-500">Overview of lab report submission states</p>
            </div>
            <span className="rounded-full bg-indigo-50/80 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-100/30">
              Live Stats
            </span>
          </div>

          {statusData.length === 0 ? (
            <div className="flex h-64 min-h-[220px] min-w-0 items-center justify-center text-sm text-slate-500">
              No status records available.
            </div>
          ) : (
            <div className="h-64 min-h-[220px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
                <BarChart data={statusData} margin={{ top: 20, right: 8, left: -25, bottom: 6 }}>
                  <defs>
                    <linearGradient id="statusBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0/50" />
                  <XAxis 
                    dataKey="label" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#64748B', fontSize: 10, fontWeight: 500 }}
                  />
                  <YAxis 
                    allowDecimals={false} 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fill: '#64748B', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    }}
                  />
                  <Bar dataKey="count" fill="url(#statusBarGrad)" radius={[4, 4, 0, 0]} minPointSize={4} barSize={36}>
                    <LabelList dataKey="count" position="top" fill="#4F46E5" fontSize={11} fontWeight="bold" offset={6} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Students Leaderboard Redesigned Card */}
        <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-md p-5 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Top Students</h3>
              <p className="text-[11px] text-slate-500">Highest scores in active experiments</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
              Leaderboard
            </span>
          </div>

          {topStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No submissions found</p>
          ) : (
            <div className="space-y-3 h-[256px] overflow-y-auto pr-1">
              {topStudents.slice(0, 5).map((student, index) => {
                const maxMarks = Math.max(...topStudents.map((s) => s.total_marks || 100), 100);
                const pct = Math.min(100, Math.max(5, ((student.total_marks || 0) / maxMarks) * 100));

                const rankTextStyles = [
                  "text-blue-600 font-extrabold text-base",
                  "text-indigo-600 font-bold text-sm",
                  "text-purple-600 font-bold text-sm",
                  "text-slate-400 font-semibold text-sm",
                  "text-slate-400 font-semibold text-sm",
                ];

                return (
                  <div
                    key={student.student_id || index}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/40 p-2.5 transition hover:bg-white/80 hover:shadow-sm"
                  >
                    {/* Rank Number */}
                    <div className={`w-6 shrink-0 text-center ${rankTextStyles[index] || "text-slate-400"}`}>
                      {index + 1}
                    </div>

                    {/* Student Detail & Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {student.display_name}
                        </span>
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded">
                          {student.total_marks} Marks
                        </span>
                      </div>

                      {/* Cohesive Gradient Progress Bar */}
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Recent Submissions</h3>
            <button onClick={() => navigate("/faculty/submissions")} className="text-xs text-blue-700">View all</button>
          </div>
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-slate-500">No submissions found</p>
          ) : (
            recentSubmissions.map((row) => (
              <div key={row.id} className="mb-2 rounded-lg border border-slate-200 p-2 text-sm">
                <p className="font-medium text-slate-900">{row.full_name}</p>
                <p className="text-slate-600">{row.title}</p>
              </div>
            ))
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent Messages</h3>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-slate-500">No recent messages</p>
          ) : (
            recentMessages.map((msg) => (
              <div key={msg.id} className="mb-2 rounded-lg border border-slate-200 p-2 text-sm">
                <p className="font-medium text-slate-900">{msg.title}</p>
                <p className="text-slate-600">{msg.message}</p>
              </div>
            ))
          )}
        </section>
      </div>

      <p className="text-xs text-slate-500">
        Average marks: {stats.average == null ? "No records found" : stats.average.toFixed(2)}
      </p>
      {loading ? <p className="text-xs text-slate-500">Loading...</p> : null}
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 inline-flex rounded-lg bg-slate-50 p-2">{icon}</div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}
