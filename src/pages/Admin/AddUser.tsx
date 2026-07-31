import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  postAdminApi,
  requestAdminApi,
  parseAdminApiError,
} from "@/services/adminApiClient";
import { motion } from "framer-motion";
import {
  UserPlus,
  Save,
  ArrowLeft,
  Mail,
  Lock,
  User,
  Building2,
  CheckCircle2,
} from "lucide-react";
import AdminPageShell, { AdminGlassCard } from "@/components/admin/AdminPageShell";

const DEPARTMENT_PRESETS = [
  "INFORMATION TECHNOLOGY",
  "COMPUTER SCIENCE AND ENGINEERING",
  "ARTIFICIAL INTELLIGENCE & DATA SCIENCE",
  "COMPUTER SCIENCE AND BUSINESS SYSTEMS",
  "ELECTRONICS AND COMMUNICATION ENGINEERING",
  "MECHANICAL ENGINEERING",
];

export default function AddUser() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    role: "student" as "student" | "faculty" | "admin",
    name: "",
    department: "",
    registerNo: "",
    year: "",
    semester: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creationStatus, setCreationStatus] = useState<{
    state: "idle" | "checking" | "confirmed";
    message: string;
  }>({
    state: "idle",
    message: "",
  });
  const navigate = useNavigate();

  async function confirmStudentVisible(createdId: string, token: string) {
    const attempts = 5;
    const delayMs = 500;

    for (let index = 0; index < attempts; index += 1) {
      const endpoint = `admin/students?createdId=${encodeURIComponent(createdId)}&page=1&pageSize=1`;
      const { response } = await requestAdminApi(endpoint, { method: "GET", token, timeoutMs: 10000 });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        const rows = payload?.data?.rows;
        if (Array.isArray(rows) && rows.length > 0) {
          return true;
        }
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
    }

    return false;
  }

  useEffect(() => {
    const presetRole = searchParams.get("role");
    const presetDept = searchParams.get("department");
    if (presetRole === "student" || presetRole === "faculty" || presetRole === "admin") {
      setFormData((prev) => ({
        ...prev,
        role: presetRole,
      }));
    }
    if (presetDept) {
      setFormData((prev) => ({ ...prev, department: presetDept }));
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(false);
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if ((formData.role === "student" || formData.role === "faculty") && !formData.department.trim()) {
      newErrors.department = "Department is required for students and faculty";
    }
    if (formData.role === "student" && !formData.registerNo.trim()) {
      newErrors.registerNo = "Register number is required for students";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);
    setErrors({});
    setCreationStatus({ state: "idle", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrors({ submit: "Your admin session expired. Please login again." });
        setSubmitting(false);
        return;
      }

      const payload = {
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        name: formData.name.trim(),
        department: formData.department.trim(),
        register_no: formData.role === "student" ? formData.registerNo.trim() : "",
        year: formData.year.trim(),
        semester: formData.semester.trim(),
      };

      const { response } = await postAdminApi("admin/create-user", payload, session.access_token);
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to create user");
        setErrors({ submit: message });
        setSubmitting(false);
        return;
      }
      const successPayload = await response.json().catch(() => null);
      if (successPayload?.success === false) {
        setErrors({ submit: successPayload?.error || successPayload?.message || "Failed to create user" });
        setSubmitting(false);
        return;
      }

      if (formData.role === "student") {
        const createdId = String(successPayload?.data?.id || "").trim();
        if (createdId) {
          setCreationStatus({
            state: "checking",
            message: "Verifying that the created student is visible in Student Management...",
          });
          const visible = await confirmStudentVisible(createdId, session.access_token);
          setCreationStatus({
            state: "confirmed",
            message: visible
              ? "Student record verified and synced. Redirecting to Student Management..."
              : "Student created. Redirecting with immediate focus while sync completes...",
          });
        }

        const params = new URLSearchParams();
        if (payload.register_no) params.set("createdRegNo", payload.register_no);
        if (payload.name) params.set("createdName", payload.name);
        if (payload.email) params.set("createdEmail", payload.email);
        if (payload.department) params.set("department", payload.department);
        if (createdId) params.set("createdId", createdId);
        navigate(`/admin/students?tab=add`);
      } else {
        if (payload.department) {
          navigate(`/admin/department/${encodeURIComponent(payload.department)}`);
        } else {
          navigate("/admin");
        }
      }
    } catch (error) {
      console.error("Error creating user:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while creating user.";
      setErrors({ submit: message });
    }

    setSubmitting(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  async function logout() {
    await supabase.auth.signOut();
    localStorage.removeItem("dept");
    localStorage.removeItem("year");
    localStorage.removeItem("semester");
    navigate("/login");
  }

  const selectedDepartment = formData.department || searchParams.get("department") || localStorage.getItem("admin_department") || "";
  const backPath = selectedDepartment
    ? `/admin/department/${encodeURIComponent(selectedDepartment)}`
    : "/admin";

  if (loading) {
    return (
      <div className="faculty-bg-vibrant min-h-screen flex items-center justify-center text-slate-700">
        Loading add user page...
      </div>
    );
  }

  return (
    <AdminPageShell
      activeKey="add-user"
      selectedDepartment={selectedDepartment}
      onLogout={() => void logout()}
      title={
        formData.role === "student"
          ? "Add New Student"
          : formData.role === "faculty"
            ? "Add New Faculty"
            : "Add New User"
      }
      subtitle="Create a new user account with department scope"
      actions={(
        <button
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}
    >
      <div className="max-w-2xl">
        <AdminGlassCard className="p-6 md:p-7">
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              User Information
            </h3>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.name ?? ""}
                  onChange={(e) =>
                    handleInputChange("name", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  placeholder="Enter full name"
                />
              </div>
              {errors.name && (
                <p className="text-rose-700 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            {/* Email */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={formData.email ?? ""}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  placeholder="Enter email address"
                />
              </div>
              {errors.email && (
                <p className="text-rose-700 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            {/* Role */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                User Role
              </label>
              <select
                value={formData.role ?? "student"}
                onChange={(e) =>
                  handleInputChange(
                    "role",
                    e.target.value as "student" | "faculty" | "admin"
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Department</label>
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  Quick Department Selection
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENT_PRESETS.map((dept) => {
                    const selected = String(formData.department || "").trim() === dept;
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => handleInputChange("department", dept)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                          selected
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                type="text"
                value={formData.department ?? ""}
                onChange={(e) => handleInputChange("department", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                placeholder="Enter department"
              />
              {errors.department && (
                <p className="text-rose-700 text-xs mt-1">{errors.department}</p>
              )}
            </div>

            {formData.role === "student" ? (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Register Number</label>
                <input
                  type="text"
                  value={formData.registerNo ?? ""}
                  onChange={(e) => handleInputChange("registerNo", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  placeholder="Enter register number"
                />
                {errors.registerNo && (
                  <p className="text-rose-700 text-xs mt-1">{errors.registerNo}</p>
                )}
              </div>
            ) : null}

            {(formData.role === "student" || formData.role === "faculty") ? (
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Year (optional)</label>
                  <input
                    type="text"
                    value={formData.year ?? ""}
                    onChange={(e) => handleInputChange("year", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    placeholder="e.g., 2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Semester (optional)</label>
                  <input
                    type="text"
                    value={formData.semester ?? ""}
                    onChange={(e) => handleInputChange("semester", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    placeholder="e.g., 4"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={formData.password ?? ""}
                    onChange={(e) =>
                      handleInputChange("password", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    placeholder="Enter password"
                  />
                </div>
                {errors.password && (
                  <p className="text-rose-700 text-xs mt-1">{errors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={formData.confirmPassword ?? ""}
                    onChange={(e) =>
                      handleInputChange("confirmPassword", e.target.value)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    placeholder="Confirm password"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-rose-700 text-xs mt-1">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            {errors.submit && (
              <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-rose-700 text-sm">{errors.submit}</p>
              </div>
            )}
            {creationStatus.state !== "idle" && (
              <div
                className={`mb-6 rounded-lg border p-3 ${
                  creationStatus.state === "checking"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                <p className="text-sm">{creationStatus.message}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-500 px-6 py-3 text-sm font-medium transition hover:from-blue-500 hover:to-indigo-400 disabled:from-slate-600 disabled:to-slate-600 shadow-lg shadow-blue-900/30 ring-1 ring-blue-400/30"
              >
                <Save className="w-4 h-4" />
                {submitting ? "Creating User..." : "Create User"}
              </button>

              <button
                type="button"
                onClick={() => navigate(backPath)}
                className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </motion.form>
        </AdminGlassCard>
      </div>
    </AdminPageShell>
  );
}

