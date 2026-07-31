import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BulkUploadWorkspace } from "@/pages/Admin/BulkUpload";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";
import AdminStatsCards from "@/components/admin/AdminStatsCards";
import StudentFilters from "@/components/admin/StudentFilters";
import StudentTable from "@/components/admin/StudentTable";
import ActivityLogsPanel from "@/components/admin/ActivityLogsPanel";
import AdminToast from "@/components/admin/AdminToast";
import AdminProtectedRoute from "@/components/AdminProtectedRoute";
import StudentDetailsModal from "@/components/admin/StudentDetailsModal";
import AdminShell from "@/layouts/AdminShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { logAdminActivity } from "@/services/studentBulkService";
import { requestAdminApi, parseAdminApiError } from "@/services/adminApiClient";
import { formatDepartmentNameUpper } from "@/utils/departmentLabel";

const PAGE_SIZE = 10;

function StudentManagementInner() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");
  const [toasts, setToasts] = useState([]);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("view");
  const [modalStudent, setModalStudent] = useState(null);
  const [focusStudentId, setFocusStudentId] = useState("");
  const [liveTick, setLiveTick] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);
  const filteredStudents = useMemo(() => {
    const term = String(search || "").trim().toLowerCase();
    if (!term) return students;
    return students.filter((row) => {
      const name = String(row?.name || "").toLowerCase();
      const email = String(row?.email || "").toLowerCase();
      const reg = String(row?.register_no || "").toLowerCase();
      return name.includes(term) || email.includes(term) || reg.includes(term);
    });
  }, [students, search]);

  function notify(type, message) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2800);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  async function loadDepartmentOptions() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const { response } = await requestAdminApi("admin/student-departments", { token });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to fetch department options");
        throw new Error(message);
      }
      const payload = await response.json().catch(() => null);
      setDepartmentOptions(Array.isArray(payload?.data) ? payload.data : []);
    } catch (error) {
      console.error("Failed to load department options from admin API, using Supabase fallback:", error);
      try {
        const { data, error: fallbackError } = await supabase
          .from("profiles")
          .select("department")
          .eq("role", "student")
          .limit(5000);
        if (fallbackError) throw fallbackError;
        const departments = Array.from(
          new Set(
            (data || [])
              .map((row) => String(row.department || "").trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));
        setDepartmentOptions(departments);
      } catch (fallbackError) {
        console.error("Supabase fallback for department options failed:", fallbackError);
        setDepartmentOptions([]);
      }
    }
  }

  async function loadStudents() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/login");
        return;
      }
      setCurrentAdminId(session.user.id);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      params.set("sortKey", sortKey);
      params.set("sortDir", sortDir);
      if (focusStudentId) {
        params.set("createdId", focusStudentId);
      } else {
        if (departmentFilter !== "all") params.set("department", departmentFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (String(debouncedSearch || "").trim()) params.set("search", String(debouncedSearch || "").trim());
      }

      let normalizedRows = [];
      let normalizedCount = 0;
      try {
        const { response } = await requestAdminApi(`admin/students?${params.toString()}`, {
          token: session.access_token,
        });
        if (!response.ok) {
          const message = await parseAdminApiError(response, "Failed to fetch students");
          throw new Error(message);
        }
        const payload = await response.json().catch(() => null);
        const rows = payload?.data?.rows || [];
        const count = payload?.data?.totalCount ?? 0;
        normalizedRows = Array.isArray(rows) ? rows : [];
        normalizedCount = Number(count) || 0;
      } catch (adminApiError) {
        console.error("Admin API fetch failed, using Supabase fallback:", adminApiError);
        let fallbackQuery = supabase
          .from("profiles")
          .select("*", { count: "exact" });

        if (focusStudentId) {
          fallbackQuery = fallbackQuery.eq("id", focusStudentId);
        } else {
          fallbackQuery = fallbackQuery.eq("role", "student");
          if (departmentFilter !== "all") {
            fallbackQuery = fallbackQuery.eq("department", departmentFilter);
          }
          if (statusFilter !== "all") {
            // `profiles.is_active` is not part of current schema; skip fallback status filter.
          }
          const cleanSearch = String(debouncedSearch || "").trim();
          if (cleanSearch) {
            const escaped = cleanSearch.replace(/[%]/g, "");
            const nameTerm = `%${escaped}%`;
            if (/^\d+$/.test(escaped)) {
              fallbackQuery = fallbackQuery.or(`name.ilike.${nameTerm},register_no.eq.${escaped}`);
            } else {
              fallbackQuery = fallbackQuery.ilike("name", nameTerm);
            }
          }
        }

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const ascending = sortDir === "asc";
        const { data: fallbackRows, error: fallbackError, count: fallbackCount } = await fallbackQuery
          .order(sortKey, { ascending })
          .range(from, to);

        if (fallbackError) {
          throw fallbackError;
        }
        normalizedRows = Array.isArray(fallbackRows) ? fallbackRows : [];
        normalizedCount = Number(fallbackCount) || 0;
      }

      setStudents(normalizedRows);
      setTotalCount(normalizedCount);
      if (focusStudentId && normalizedRows.length > 0) {
        setFocusStudentId("");
      } else if (focusStudentId && normalizedRows.length === 0) {
        notify("warning", "Student was created, but profile sync is still in progress. Retry in a moment.");
      }
    } catch (error) {
      console.error("Failed to load students:", error);
      notify("error", `Unable to fetch students: ${error?.message || "unknown error"}`);
      setStudents([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "import") {
      const t = window.setTimeout(() => {
        document.getElementById("admin-student-import")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return () => window.clearTimeout(t);
    }
    if (tab === "add") {
      const t = window.setTimeout(() => {
        document.getElementById("admin-bulk-add-one")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [searchParams]);

  useEffect(() => {
    const createdRegNo = String(searchParams.get("createdRegNo") || "").trim();
    const createdName = String(searchParams.get("createdName") || "").trim();
    const createdEmail = String(searchParams.get("createdEmail") || "").trim();
    const createdDepartment = String(searchParams.get("department") || "").trim();
    const createdId = String(searchParams.get("createdId") || "").trim();

    if (!createdRegNo && !createdName && !createdId && !createdEmail) return;

    if (createdDepartment) {
      setDepartmentFilter(createdDepartment);
    }
    if (createdId) {
      setFocusStudentId(createdId);
      setDepartmentFilter("all");
      setStatusFilter("all");
    }
    setPage(1);
    setSearch(createdRegNo || createdName);
    notify("success", "Student created. Record is filtered below.");
  }, [searchParams]);

  useEffect(() => {
    const skipDefault =
      String(searchParams.get("createdId") || "").trim() ||
      String(searchParams.get("createdRegNo") || "").trim();
    if (skipDefault) return;

    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      const { data: profile } = await supabase.from("profiles").select("department").eq("id", user.id).maybeSingle();
      if (!alive || !profile?.department) return;
      const label = formatDepartmentNameUpper(profile.department, "");
      if (label) setDepartmentFilter(label);
    })();
    return () => {
      alive = false;
    };
  }, [searchParams]);

  useEffect(() => {
    void loadStudents();
    void loadDepartmentOptions();
  }, [debouncedSearch, departmentFilter, focusStudentId, liveTick, page, sortDir, sortKey, statusFilter]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-student-management-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        setLiveTick((prev) => prev + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentFilter, statusFilter]);

  function handleToggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function handleToggleSelectAll(rows) {
    const rowIds = rows.map((row) => row.id);
    const allSelected = rowIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !rowIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...rowIds])));
  }

  async function softDeleteStudents(ids) {
    if (!ids.length) return;
    const payload = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: currentAdminId,
    };
    const softDeleteRes = await supabase.from("profiles").update(payload).in("id", ids);
    if (!softDeleteRes.error) return;
    throw new Error(
      "Soft delete is not available in the current schema. Apply `profiles-soft-delete.sql` before deleting users."
    );
  }

  async function handleStudentAction(action, row) {
    try {
      if (action === "view") {
        setModalStudent(row);
        setModalMode("view");
        setModalOpen(true);
        return;
      }

      if (action === "edit") {
        setModalStudent(row);
        setModalMode("edit");
        setModalOpen(true);
        return;
      }

      if (action === "delete") {
        const confirmDelete = window.confirm("Soft delete this student profile?");
        if (!confirmDelete) return;
        await softDeleteStudents([row.id]);
        notify("success", "Student soft deleted.");
        await logAdminActivity(currentAdminId, "SOFT_DELETE_STUDENT", `Soft deleted ${row.id}`);
        void loadStudents();
        setRefreshKey((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Student action failed:", error);
      notify("error", "Action failed. Please check permissions and table columns.");
    }
  }

  async function handleBulkAction() {
    if (!bulkAction || selectedIds.length === 0) {
      notify("warning", "Select rows and choose bulk action.");
      return;
    }
    try {
      if (bulkAction === "delete") {
        const confirmed = window.confirm("Soft delete selected student profiles?");
        if (!confirmed) return;
        await softDeleteStudents(selectedIds);
      } else {
        notify("warning", "This bulk action is not configured on the backend.");
        return;
      }

      await logAdminActivity(
        currentAdminId,
        "BULK_STUDENT_ACTION",
        `${bulkAction} on ${selectedIds.length} students`
      );
      notify("success", "Bulk action completed.");
      setSelectedIds([]);
      setBulkAction("");
      setPage(1);
      void loadStudents();
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Bulk action failed:", error);
      notify("error", "Bulk action failed.");
    }
  }

  async function handleModalSave(form) {
    if (!modalStudent) return;
    try {
      if (!/\S+@\S+\.\S+/.test(String(form.email || ""))) {
        notify("warning", "Please enter a valid email.");
        return;
      }
      const updatePayload = {
        name: String(form.name || "").trim(),
        email: String(form.email || "").trim(),
        register_no: String(form.register_no || "").trim(),
        department: String(form.department || "").trim(),
      };
      const { error } = await supabase.from("profiles").update(updatePayload).eq("id", modalStudent.id);
      if (error) throw error;
      await logAdminActivity(currentAdminId, "EDIT_STUDENT", `Updated ${modalStudent.id}`);
      notify("success", "Student profile updated.");
      setModalOpen(false);
      setModalStudent(null);
      void loadStudents();
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to save student:", error);
      notify("error", "Failed to update student.");
    }
  }

  return (
    <AdminShell title="Student management">
      <div className="col-span-12">
        <AdminToast toasts={toasts} onDismiss={dismissToast} />
        <StudentDetailsModal
          open={modalOpen}
          mode={modalMode}
          student={modalStudent}
          onClose={() => {
            setModalOpen(false);
            setModalStudent(null);
          }}
          onSave={handleModalSave}
        />

        <div className="mx-auto max-w-7xl space-y-6">
        <div className="faculty-surface rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 ring-1 ring-indigo-200">
                <ShieldCheck className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Student management</h1>
                <p className="text-xs text-slate-600">
                  Browse, filter, and import students — CSV/Excel bulk upload and single-user create are below.
                </p>
              </div>
            </div>
          </div>
        </div>

        <AdminStatsCards refreshKey={refreshKey} />

        <StudentFilters
          search={search}
          onSearchChange={setSearch}
          department={departmentFilter}
          onDepartmentChange={setDepartmentFilter}
          status={statusFilter}
          onStatusChange={setStatusFilter}
          departmentOptions={departmentOptions}
        />

        <div className="faculty-surface rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <select
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
            >
              <option value="">Bulk Actions</option>
              <option value="delete">Delete</option>
            </select>
            <button
              onClick={() => void handleBulkAction()}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
            >
              Apply to {selectedIds.length} Selected
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading students...</p>
          ) : (
            <StudentTable
              students={filteredStudents}
              totalCount={totalCount}
              page={page}
              pageSize={PAGE_SIZE}
              sortKey={sortKey}
              sortDir={sortDir}
              onPageChange={setPage}
              onSortChange={(nextKey) => {
                if (sortKey === nextKey) {
                  setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                } else {
                  setSortKey(nextKey);
                  setSortDir("asc");
                }
                setPage(1);
              }}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onAction={handleStudentAction}
            />
          )}
        </div>

        <div id="admin-student-import" className="scroll-mt-24">
          <BulkUploadWorkspace
            embedded
            onImportComplete={() => {
              void loadStudents();
              void loadDepartmentOptions();
              setRefreshKey((prev) => prev + 1);
            }}
          />
        </div>

        <ActivityLogsPanel refreshKey={refreshKey} />
        </div>
      </div>
    </AdminShell>
  );
}

export default function StudentManagement() {
  return (
    <AdminProtectedRoute>
      <StudentManagementInner />
    </AdminProtectedRoute>
  );
}
