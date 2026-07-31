import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Link2, Unlink2, RefreshCw, Pencil, Trash2, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import { parseAdminApiError, postAdminApi, requestAdminApi } from "@/services/adminApiClient";
import { formatDepartmentName } from "@/utils/departmentLabel";

function normalizeDepartment(value) {
  return String(value || "").trim();
}

const emptySubjectForm = {
  name: "",
  code: "",
  department: "",
  year: "",
  semester: "",
};

function normalizeAssignmentErrorMessage(message) {
  const raw = String(message || "").trim();
  const lowered = raw.toLowerCase();
  if (lowered.includes("year mismatch") || lowered.includes("semester mismatch")) {
    return "Backend validation is outdated. Restart backend to apply no year/semester restriction.";
  }
  return raw;
}

export default function SubjectsManagement() {
  const [loading, setLoading] = useState(true);
  const [savingSubject, setSavingSubject] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [departments, setDepartments] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [adminDepartment, setAdminDepartment] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [subjectForm, setSubjectForm] = useState(emptySubjectForm);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [inlineFacultySelection, setInlineFacultySelection] = useState({});
  const [inlineAssigningSubjectId, setInlineAssigningSubjectId] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState("");
  const [editingSubjectForm, setEditingSubjectForm] = useState(emptySubjectForm);
  const [updatingSubject, setUpdatingSubject] = useState(false);
  const [deletingSubjectId, setDeletingSubjectId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }

      let effectiveDepartment = departmentFilter;
      if (!adminDepartment) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("department")
          .eq("id", session.user.id)
          .maybeSingle();
        const dept = normalizeDepartment(profile?.department || "");
        if (dept) {
          setAdminDepartment(dept);
          effectiveDepartment = dept;
          setDepartmentFilter(dept);
        }
      } else {
        effectiveDepartment = adminDepartment;
      }

      const query =
        effectiveDepartment !== "all"
          ? `admin/subjects-management-data?department=${encodeURIComponent(effectiveDepartment)}`
          : "admin/subjects-management-data";
      const { response } = await requestAdminApi(query, {
        method: "GET",
        token: session.access_token,
        timeoutMs: 20000,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to load subjects data");
        setError(message);
        return;
      }
      const payload = await response.json().catch(() => null);
      const data = payload?.data || {};
      const nextDepartments = Array.isArray(data.departments) ? data.departments : [];
      const nextSubjects = Array.isArray(data.subjects) ? data.subjects : [];
      const nextFaculty = Array.isArray(data.faculty) ? data.faculty : [];
      const nextAssignments = Array.isArray(data.assignments) ? data.assignments : [];

      setDepartments(nextDepartments);
      setSubjects(nextSubjects);
      setFaculty(nextFaculty);
      setAssignments(nextAssignments);

      setSelectedSubjectId((prev) => prev || (nextSubjects.length > 0 ? String(nextSubjects[0].id || "") : ""));
      setSelectedFacultyId((prev) => prev || (nextFaculty.length > 0 ? String(nextFaculty[0].id || "") : ""));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load subjects data."
      );
    } finally {
      setLoading(false);
    }
  }, [adminDepartment, departmentFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (departmentFilter === "all") {
      setSubjectForm((prev) => ({ ...prev, department: "" }));
      return;
    }
    setSubjectForm((prev) => ({
      ...prev,
      department: prev.department || departmentFilter,
    }));
  }, [departmentFilter]);

  const assignmentsBySubject = useMemo(() => {
    const map = new Map();
    assignments.forEach((row) => {
      const key = String(row.subject_id || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }, [assignments]);

  function isDeptMatch(subjectDept, facultyDept) {
    if (!subjectDept || !facultyDept) return true;
    const s = String(subjectDept || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const f = String(facultyDept || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!s || !f) return true;
    if (s === f) return true;
    if ((s.includes("it") || s.includes("information")) && (f.includes("it") || f.includes("information"))) return true;
    if ((s.includes("cs") || s.includes("computer")) && (f.includes("cs") || f.includes("computer"))) return true;
    return s.includes(f) || f.includes(s);
  }

  function getEligibleFacultyForSubject(subject, existingRows = []) {
    if (!subject) return faculty;
    const assignedFacultyIds = new Set(
      (existingRows || []).map((row) => String(row.faculty_id || "")).filter(Boolean)
    );

    return faculty.filter((row) => {
      const facultyId = String(row.id || "");
      if (assignedFacultyIds.has(facultyId)) return false;
      return isDeptMatch(subject.department, row.department);
    });
  }

  const selectedSubject = useMemo(
    () => subjects.find((row) => String(row.id || "") === String(selectedSubjectId || "")) || null,
    [subjects, selectedSubjectId]
  );

  const filteredFaculty = useMemo(() => {
    if (!selectedSubject) return faculty;
    const existing = assignmentsBySubject.get(String(selectedSubject.id || "")) || [];
    return getEligibleFacultyForSubject(selectedSubject, existing);
  }, [faculty, selectedSubject, assignmentsBySubject]);

  useEffect(() => {
    if (!selectedFacultyId) return;
    const stillVisible = filteredFaculty.some(
      (row) => String(row.id || "") === String(selectedFacultyId || "")
    );
    if (!stillVisible) {
      setSelectedFacultyId("");
    }
  }, [filteredFaculty, selectedFacultyId]);

  async function handleCreateSubject(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const payload = {
      ...subjectForm,
      name: String(subjectForm.name || "").trim(),
      code: String(subjectForm.code || "").trim(),
      department: normalizeDepartment(subjectForm.department || departmentFilter),
      year: String(subjectForm.year || "").trim(),
      semester: String(subjectForm.semester || "").trim(),
    };

    if (!payload.name) {
      setError("Subject name is required.");
      return;
    }
    if (!payload.department) {
      setError("Department is required.");
      return;
    }

    setSavingSubject(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }
      const { response } = await postAdminApi(
        "admin/subjects",
        payload,
        session.access_token
      );
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to create subject");
        setError(message);
        return;
      }

      setSuccess("Subject created successfully.");
      setSubjectForm((prev) => ({
        ...emptySubjectForm,
        department: prev.department || payload.department,
      }));
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create subject."
      );
    } finally {
      setSavingSubject(false);
    }
  }

  function startSubjectEdit(subject) {
    setEditingSubjectId(String(subject?.id || ""));
    setEditingSubjectForm({
      name: String(subject?.name || ""),
      code: String(subject?.code || ""),
      department: String(subject?.department || ""),
      year: String(subject?.year || ""),
      semester: String(subject?.semester || ""),
    });
  }

  function cancelSubjectEdit() {
    setEditingSubjectId("");
    setEditingSubjectForm(emptySubjectForm);
  }

  async function handleUpdateSubject(subjectId) {
    setError("");
    setSuccess("");
    const safeSubjectId = String(subjectId || "").trim();
    if (!safeSubjectId) {
      setError("Subject id is required.");
      return;
    }
    if (!String(editingSubjectForm.name || "").trim()) {
      setError("Subject name is required.");
      return;
    }

    setUpdatingSubject(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }
      const endpoint = `admin/subjects/${encodeURIComponent(safeSubjectId)}`;
      const { response } = await requestAdminApi(endpoint, {
        method: "PUT",
        payload: {
          name: String(editingSubjectForm.name || "").trim(),
          code: String(editingSubjectForm.code || "").trim(),
          department: normalizeDepartment(editingSubjectForm.department || ""),
          year: String(editingSubjectForm.year || "").trim(),
          semester: String(editingSubjectForm.semester || "").trim(),
        },
        token: session.access_token,
        timeoutMs: 20000,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to update subject");
        setError(message);
        return;
      }
      setSuccess("Subject updated successfully.");
      cancelSubjectEdit();
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update subject."
      );
    } finally {
      setUpdatingSubject(false);
    }
  }

  async function handleDeleteSubject(subjectId, subjectName) {
    setError("");
    setSuccess("");
    const safeSubjectId = String(subjectId || "").trim();
    if (!safeSubjectId) {
      setError("Subject id is required.");
      return;
    }
    const confirmed = window.confirm(
      `Delete subject "${subjectName || "this subject"}"? This will remove mappings and related records.`
    );
    if (!confirmed) return;

    setDeletingSubjectId(safeSubjectId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }
      const endpoint = `admin/subjects/${encodeURIComponent(safeSubjectId)}`;
      const { response } = await requestAdminApi(endpoint, {
        method: "DELETE",
        token: session.access_token,
        timeoutMs: 20000,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to delete subject");
        setError(message);
        return;
      }
      setSuccess("Subject deleted successfully.");
      if (editingSubjectId === safeSubjectId) {
        cancelSubjectEdit();
      }
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to delete subject."
      );
    } finally {
      setDeletingSubjectId("");
    }
  }

  async function handleAssignFaculty(subjectIdOverride, facultyIdOverride) {
    setError("");
    setSuccess("");
    const activeSubjectId = String(subjectIdOverride || selectedSubjectId || "").trim();
    const activeFacultyId = String(facultyIdOverride || selectedFacultyId || "").trim();
    if (!activeFacultyId || !activeSubjectId) {
      setError("Select both faculty and subject.");
      return;
    }
    if (!subjectIdOverride && filteredFaculty.length > 0) {
      const allowed = filteredFaculty.some(
        (row) => String(row.id || "") === activeFacultyId
      );
      if (!allowed) {
        setError("Selected faculty is not eligible for this subject department.");
        return;
      }
    }
    if (subjectIdOverride) {
      setInlineAssigningSubjectId(activeSubjectId);
    }
    setAssigning(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }
      const { response } = await postAdminApi(
        "admin/subjects/assign-faculty",
        {
          faculty_id: activeFacultyId,
          subject_id: activeSubjectId,
        },
        session.access_token
      );
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to assign faculty");
        const normalizedMessage = normalizeAssignmentErrorMessage(message);
        setError(normalizedMessage);
        return;
      }

      const payload = await response.json().catch(() => null);
      if (payload?.success === false) {
        const normalizedMessage = normalizeAssignmentErrorMessage(
          payload?.error || payload?.message || "Failed to assign faculty"
        );
        setError(normalizedMessage);
        return;
      }

      setSuccess("Faculty assigned to subject.");
      if (subjectIdOverride) {
        setInlineFacultySelection((prev) => ({
          ...prev,
          [activeSubjectId]: "",
        }));
      }
      await loadData();
    } catch (requestError) {
      const normalizedMessage = normalizeAssignmentErrorMessage(
        requestError instanceof Error ? requestError.message : "Unable to assign faculty."
      );
      setError(
        normalizedMessage
      );
    } finally {
      setAssigning(false);
      if (subjectIdOverride) {
        setInlineAssigningSubjectId("");
      }
    }
  }

  async function handleUnassignFaculty(facultyId, subjectId) {
    setError("");
    setSuccess("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }
      const { response } = await requestAdminApi("admin/subjects/assign-faculty", {
        method: "DELETE",
        payload: { faculty_id: facultyId, subject_id: subjectId },
        token: session.access_token,
        timeoutMs: 20000,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to unassign faculty");
        setError(message);
        return;
      }
      setSuccess("Faculty unassigned from subject.");
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to unassign faculty."
      );
    }
  }

  async function handleClearSubjectAssignments(subjectId, subjectName) {
    setError("");
    setSuccess("");
    try {
      const confirmed = window.confirm(
        `Unassign all faculty from "${subjectName || "this subject"}"?`
      );
      if (!confirmed) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Admin session expired. Please login again.");
        return;
      }
      const endpoint = `admin/subjects/assign-faculty/by-subject/${encodeURIComponent(
        String(subjectId || "")
      )}`;
      const { response } = await requestAdminApi(endpoint, {
        method: "DELETE",
        token: session.access_token,
        timeoutMs: 20000,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to clear subject assignments");
        setError(message);
        return;
      }
      const payload = await response.json().catch(() => null);
      const removedCount = Number(payload?.data?.removed_count || 0);
      setSuccess(`Cleared ${removedCount} assignment(s) from ${subjectName || "subject"}.`);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to clear subject assignments."
      );
    }
  }

  return (
    <AdminShell title="Subjects">
      <div className="col-span-12 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700">
          <BookOpen className="h-4 w-4 text-blue-600" />
          Subject Management
        </div>
        <div className="inline-flex items-center gap-2">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            disabled={Boolean(adminDepartment)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            {adminDepartment ? (
              <option value={adminDepartment}>{adminDepartment}</option>
            ) : (
              <>
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </>
            )}
          </select>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="col-span-12 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="col-span-12 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="col-span-12 lg:col-span-4">
        <ShellCard title="Create Subject">
          <form onSubmit={handleCreateSubject} className="space-y-3">
            <input
              value={subjectForm.name}
              onChange={(e) =>
                setSubjectForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="Subject name"
            />
            <input
              value={subjectForm.code}
              onChange={(e) =>
                setSubjectForm((prev) => ({ ...prev, code: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="Code (optional)"
            />
            <input
              value={subjectForm.department}
              onChange={(e) =>
                setSubjectForm((prev) => ({ ...prev, department: e.target.value }))
              }
              disabled={Boolean(adminDepartment)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="Department"
            />
            {adminDepartment ? (
              <p className="text-xs text-slate-500">
                Department is fixed to your admin scope: {adminDepartment}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <input
                value={subjectForm.year}
                onChange={(e) =>
                  setSubjectForm((prev) => ({ ...prev, year: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Year"
              />
              <input
                value={subjectForm.semester}
                onChange={(e) =>
                  setSubjectForm((prev) => ({ ...prev, semester: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Semester"
              />
            </div>
            <button
              type="submit"
              disabled={savingSubject}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-400 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {savingSubject ? "Creating..." : "Create Subject"}
            </button>
          </form>
        </ShellCard>
      </div>

      <div className="col-span-12 lg:col-span-8">
        <ShellCard title="Assign Faculty">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center">
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
            >
              <option value="">Select Subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                  {subject.code ? ` (${subject.code})` : ""}
                </option>
              ))}
            </select>
            <select
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
            >
              <option value="">
                {filteredFaculty.length > 0
                  ? "Select Faculty"
                  : "No eligible faculty in this department"}
              </option>
              {filteredFaculty.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.department ? ` · ${formatDepartmentName(row.department, "Unassigned")}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleAssignFaculty()}
              disabled={assigning}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm text-blue-700 transition hover:bg-blue-100 disabled:opacity-60 xl:w-auto xl:whitespace-nowrap"
            >
              <Link2 className="h-4 w-4" />
              {assigning ? "Assigning..." : "Assign"}
            </button>
          </div>
        </ShellCard>
      </div>

      <div className="col-span-12">
        <ShellCard title="Subjects & Assigned Faculty">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={`subject-loading-${idx}`}
                  className="faculty-shimmer h-16 animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-slate-500">
              No subjects found for this department. Create one using the form.
            </p>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => {
                const rows = assignmentsBySubject.get(String(subject.id)) || [];
                const subjectIdKey = String(subject.id || "");
                const isEditing = editingSubjectId === subjectIdKey;
                const availableFaculty = getEligibleFacultyForSubject(subject, rows);
                const selectedInlineFacultyId = inlineFacultySelection[subjectIdKey] || "";
                return (
                  <div
                    key={subject.id}
                    className="rounded-xl border border-slate-200 bg-white/90 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        {isEditing ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              value={editingSubjectForm.name}
                              onChange={(e) =>
                                setEditingSubjectForm((prev) => ({ ...prev, name: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                              placeholder="Subject name"
                            />
                            <input
                              value={editingSubjectForm.code}
                              onChange={(e) =>
                                setEditingSubjectForm((prev) => ({ ...prev, code: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                              placeholder="Code"
                            />
                            <input
                              value={editingSubjectForm.department}
                              onChange={(e) =>
                                setEditingSubjectForm((prev) => ({ ...prev, department: e.target.value }))
                              }
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                              placeholder="Department"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={editingSubjectForm.year}
                                onChange={(e) =>
                                  setEditingSubjectForm((prev) => ({ ...prev, year: e.target.value }))
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                                placeholder="Year"
                              />
                              <input
                                value={editingSubjectForm.semester}
                                onChange={(e) =>
                                  setEditingSubjectForm((prev) => ({ ...prev, semester: e.target.value }))
                                }
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                                placeholder="Semester"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-slate-900">
                              {subject.name}
                              {subject.code ? ` (${subject.code})` : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDepartmentName(subject.department, "Unassigned")} · Year {subject.year || "-"} · Sem{" "}
                              {subject.semester || "-"} · {subject.assigned_count || 0} faculty assigned
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleUpdateSubject(subjectIdKey)}
                              disabled={updatingSubject}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {updatingSubject ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelSubjectEdit}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 text-xs text-slate-200 transition hover:bg-slate-700"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startSubjectEdit(subject)}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs text-indigo-700 transition hover:bg-indigo-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSubject(subjectIdKey, subject.name)}
                              disabled={deletingSubjectId === subjectIdKey}
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingSubjectId === subjectIdKey ? "Deleting..." : "Delete"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void handleClearSubjectAssignments(subjectIdKey, subject.name)
                          }
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs text-rose-700 transition hover:bg-rose-100"
                        >
                          Clear All
                        </button>
                        <select
                          value={selectedInlineFacultyId}
                          onChange={(e) =>
                            setInlineFacultySelection((prev) => ({
                              ...prev,
                              [subjectIdKey]: e.target.value,
                            }))
                          }
                          className="h-9 w-full min-w-[230px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:w-auto"
                          disabled={availableFaculty.length === 0}
                        >
                          <option value="">
                            {availableFaculty.length === 0
                              ? "No eligible faculty left"
                              : "Select Faculty to Add..."}
                          </option>
                          {availableFaculty.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleAssignFaculty(subjectIdKey, selectedInlineFacultyId)}
                          disabled={
                            assigning ||
                            inlineAssigningSubjectId === subjectIdKey ||
                            availableFaculty.length === 0 ||
                            !selectedInlineFacultyId
                          }
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {inlineAssigningSubjectId === subjectIdKey ? "Adding..." : "Add Faculty"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rows.length === 0 ? (
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
                          No faculty assigned
                        </span>
                      ) : (
                        rows.map((row) => (
                          <span
                            key={row.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                          >
                            {row.faculty_name}
                            <button
                              type="button"
                              onClick={() =>
                                void handleUnassignFaculty(row.faculty_id, row.subject_id)
                              }
                              className="rounded p-0.5 transition hover:bg-rose-100 hover:text-rose-700"
                              title="Unassign faculty"
                            >
                              <Unlink2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ShellCard>
      </div>
    </AdminShell>
  );
}

