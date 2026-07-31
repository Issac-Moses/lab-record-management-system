import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  postAdminApi,
  parseAdminApiError,
  checkAdminApiAvailability,
} from "@/services/adminApiClient";
import * as XLSX from "xlsx";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  Users,
  UserPlus,
  GraduationCap,
  Building2,
  Calendar,
  Hash,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Table2,
  Sparkles,
  Shield,
} from "lucide-react";

type UploadRole = "student" | "faculty";
type CsvRow = {
  email: string;
  password: string;
  name: string;
  department: string;
  register_no?: string;
  year?: string;
  semester?: string;
};

type UploadResult = {
  success: number;
  updated?: number;
  skipped?: number;
  failed: number;
  errors: string[];
};

function splitCsvLine(line: string, delimiter = ","): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function detectCsvDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = splitCsvLine(headerLine, candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function isSpreadsheetFilename(name: string): boolean {
  const lower = String(name || "").toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsm") ||
    lower.endsWith(".xlsb") ||
    lower.endsWith(".ods")
  );
}

function normalizeHeader(header: string): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveHeaderKey(rawHeader: string): string {
  const header = normalizeHeader(rawHeader);
  const aliasMap: Record<string, string> = {
    firstname: "first_name",
    first_name: "first_name",
    first: "first_name",
    lastname: "last_name",
    last_name: "last_name",
    last: "last_name",
    full_name: "name",
    student_name: "name",
    faculty_name: "name",
    reg_no: "register_no",
    register_number: "register_no",
    register_no: "register_no",
    roll_no: "register_no",
    roll_number: "register_no",
    sem: "semester",
    dept: "department",
    departement: "department",
    mail: "email",
    email_id: "email",
    faculty_password: "password",
    staff_password: "password",
    passwrd: "password",
    passwd: "password",
    pass_word: "password",
  };

  return aliasMap[header] || header;
}

function parseCsvText(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, "").trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => resolveHeaderKey(header));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i], delimiter);
    const rowObj: Record<string, string> = {};
    headers.forEach((header, index) => {
      rowObj[header] = values[index] || "";
    });
    rows.push({
      email: rowObj.email || "",
      password: rowObj.password || "",
      name:
        rowObj.name ||
        `${rowObj.first_name || ""} ${rowObj.last_name || ""}`.trim(),
      department: rowObj.department || "",
      register_no: rowObj.register_no || "",
      year: rowObj.year || "",
      semester: rowObj.semester || "",
    });
  }

  return rows;
}

function parseSpreadsheetRows(rows: Record<string, unknown>[]): CsvRow[] {
  function normalizeLooseKey(value: string): string {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function pickValue(row: Record<string, unknown>, candidates: string[]): string {
    const entries = Object.entries(row || {});
    const directMap = new Map<string, string>();
    const normalizedMap = new Map<string, string>();

    entries.forEach(([key, value]) => {
      const stringValue = String(value ?? "").trim();
      directMap.set(String(key), stringValue);
      normalizedMap.set(normalizeLooseKey(key), stringValue);
    });

    for (const candidate of candidates) {
      if (directMap.has(candidate)) {
        const directValue = directMap.get(candidate) || "";
        if (directValue) return directValue;
      }
      const normalizedCandidate = normalizeLooseKey(candidate);
      const normalizedValue = normalizedMap.get(normalizedCandidate) || "";
      if (normalizedValue) return normalizedValue;
    }

    return "";
  }

  function inferEmail(row: Record<string, unknown>): string {
    const values = Object.values(row || []).map((value) => String(value ?? "").trim());
    const hit = values.find((value) => /\S+@\S+\.\S+/.test(value));
    return String(hit || "");
  }

  return rows
    .map((row) => {
      const emailCandidate = pickValue(row, ["email", "EMAIL", "EMAIL ", "mail", "email_id"]);
      return {
        email: emailCandidate || inferEmail(row),
        password: pickValue(row, [
          "password",
          "PASSWORD",
          "PASSWORD ",
          "pass",
          "faculty_password",
          "staff_password",
        ]),
        name:
          pickValue(row, ["name", "NAME", "student_name", "faculty_name", "full_name"]) ||
          `${pickValue(row, ["first_name", "firstname", "FIRST NAME"])} ${pickValue(row, [
            "last_name",
            "lastname",
            "LAST NAME",
          ])}`.trim(),
        department: pickValue(row, ["department", "DEPARTEMENT", "dept", "dept_name"]),
        register_no: pickValue(row, [
          "register_no",
          "register_number",
          "REGISTER NUMBER",
          "reg_no",
          "roll_no",
        ]),
        year: pickValue(row, ["year", "YEAR"]),
        semester: pickValue(row, ["semester", "SEMESTER", "sem"]),
      };
    })
    .filter(
      (row) =>
        row.email ||
        row.password ||
        row.name ||
        row.department ||
        row.register_no ||
        row.year ||
        row.semester
    );
}

function normalizeLooseKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDepartmentHint(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function remapRowsFromEmbeddedHeader(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (!Array.isArray(rows) || rows.length < 2) return rows;

  const first = rows[0] || {};
  const firstValues = Object.values(first).map((value) => normalizeLooseKey(String(value || "")));
  const hasEmbeddedHeader =
    firstValues.includes("register_number") ||
    firstValues.includes("register_no") ||
    firstValues.includes("email") ||
    firstValues.includes("departement") ||
    firstValues.includes("department");

  if (!hasEmbeddedHeader) return rows;

  const keyMap = new Map<string, string>();
  Object.entries(first).forEach(([originalKey, headerValue]) => {
    const normalizedHeader = normalizeLooseKey(String(headerValue || ""));
    if (normalizedHeader) keyMap.set(originalKey, normalizedHeader);
  });

  return rows.slice(1).map((row) => {
    const mapped: Record<string, unknown> = {};
    Object.entries(row || {}).forEach(([originalKey, value]) => {
      const mappedKey = keyMap.get(originalKey) || normalizeLooseKey(originalKey);
      mapped[mappedKey] = value;
    });
    return mapped;
  });
}

export type BulkUploadWorkspaceProps = {
  /** When true, skips standalone auth gate (parent is already admin) and stays on Students page after import. */
  embedded?: boolean;
  /** Called after bulk upload or single-user create succeeds (embedded mode). */
  onImportComplete?: () => void;
};

export function BulkUploadWorkspace({
  embedded = false,
  onImportComplete,
}: BulkUploadWorkspaceProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("tab") !== "add") return;
    const t = window.setTimeout(() => {
      document.getElementById("admin-bulk-add-one")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [searchParams]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [role, setRole] = useState<UploadRole>("student");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [singleUserForm, setSingleUserForm] = useState({
    name: "",
    email: "",
    password: "",
    register_no: "",
  });
  const [singleUserFeedback, setSingleUserFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [headerHint, setHeaderHint] = useState("");
  const [uploadStep, setUploadStep] = useState(0);

  function inferDepartmentFromFilename(filename: string): string {
    const normalized = normalizeDepartmentHint(filename);
    const compact = normalized.replace(/\s+/g, "");
    const tokens = new Set(normalized.split(" ").filter(Boolean));

    const hasAidsHint =
      compact.includes("aids") ||
      compact.includes("aiandds") ||
      compact.includes("artificialintelligenceanddatascience") ||
      compact.includes("artificialintelligencedatascience");
    if (hasAidsHint) return "AIDS";

    const hasItHint =
      tokens.has("it") ||
      compact.includes("itdept") ||
      compact.includes("informationtechnology");
    if (hasItHint) return "INFORMATION TECHNOLOGY";

    return "";
  }

  useEffect(() => {
    const presetRole = searchParams.get("role");
    const presetDepartment = searchParams.get("department");
    if (presetRole === "student" || presetRole === "faculty") {
      setRole(presetRole);
    }
    if (presetDepartment) {
      setDepartment(presetDepartment);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(false);
  }, [embedded]);

  const requiredColumns = useMemo(
    () => ["email", "password", "name", "department"],
    []
  );

  async function handleFileSelect(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setError("");
    setResult(null);
    setHeaderHint("");
    let parsedRows: CsvRow[] = [];
    const lowerName = file.name.toLowerCase();

    try {
      if (isSpreadsheetFilename(lowerName)) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
        let pickedRows: CsvRow[] = [];

        for (const sheetName of sheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const sheetRowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
            raw: false,
          });
          const sheetRows = remapRowsFromEmbeddedHeader(sheetRowsRaw);
          const parsed = parseSpreadsheetRows(sheetRows);
          if (parsed.length > 0) {
            pickedRows = parsed;
            break;
          }
        }

        if (pickedRows.length === 0) {
          setError("Excel file has no valid data rows.");
          setRows([]);
          return;
        }
        parsedRows = pickedRows;
      } else {
        const text = await file.text();
        parsedRows = parseCsvText(text);
      }
    } catch (fileParseError) {
      console.error("File parsing error:", fileParseError);
      setError("Failed to read file. Please upload CSV/XLS/XLSX/XLSM/XLSB/ODS.");
      setRows([]);
      return;
    }

    if (parsedRows.length === 0) {
      setError("File has no valid data rows.");
      setRows([]);
      return;
    }
    const firstRow = parsedRows[0];
    const hasMissingDepartment = parsedRows.some((row) => !String(row.department || "").trim());
    if (hasMissingDepartment && !String(department || "").trim()) {
      const inferred = inferDepartmentFromFilename(file.name);
      if (inferred) {
        setDepartment(inferred);
        parsedRows = parsedRows.map((row) => ({
          ...row,
          department: String(row.department || inferred).trim(),
        }));
      }
    }

    if (!firstRow.email || !firstRow.password || !firstRow.name) {
      setHeaderHint("Headers should include email, password and name. Department can be set as default.");
    }
    setRows(parsedRows);
  }

  async function handleUpload() {
    if (rows.length === 0) {
      setError("Please upload a CSV first.");
      return;
    }

    const normalizedDepartment = String(department || "").trim();
    const hasRowsWithoutDepartment = rows.some(
      (row) => !String(row.department || "").trim()
    );
    if (!normalizedDepartment && hasRowsWithoutDepartment) {
      setError("Please set a department or include department in each uploaded row.");
      return;
    }

    setUploading(true);
    setError("");
    setUploadStep(1);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Your admin session expired. Please login again.");
        setUploading(false);
        setUploadStep(0);
        return;
      }

      const apiStatus = await checkAdminApiAvailability({ token: session.access_token, timeoutMs: 10000 });
      if (!apiStatus.online) {
        setError(
          "Admin API is offline. Start backend server on port 7001, then retry bulk upload."
        );
        setUploading(false);
        setUploadStep(0);
        return;
      }
      setUploadStep(2);

      const requestPayload = {
        role,
        department: normalizedDepartment,
        users: rows.map((row) => ({
          email: String(row.email || "").trim().toLowerCase(),
          password: String(row.password || "").trim(),
          name: String(row.name || "").trim(),
          department: String(row.department || normalizedDepartment || "").trim(),
          register_no: String(row.register_no || "").trim(),
          year: String(year.trim() || row.year || "").trim(),
          semester: String(semester.trim() || row.semester || "").trim(),
        })),
      };

      const { response } = await postAdminApi(
        "admin/bulk-create",
        requestPayload,
        session.access_token,
        { timeoutMs: 180000 }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        const message =
          payload?.error ||
          payload?.message ||
          (await parseAdminApiError(response, "Bulk upload failed"));
        setError(message);
        setUploading(false);
        setUploadStep(0);
        return;
      }

      const uploadResult =
        payload?.data || {
          success: 0,
          updated: 0,
          skipped: 0,
          failed: rows.length,
          errors: ["Upload failed"],
        };
      setResult(uploadResult);
      setUploadStep(3);

      if (Number(uploadResult.failed || 0) > 0) {
        const firstError = Array.isArray(uploadResult.errors) && uploadResult.errors.length > 0
          ? uploadResult.errors[0]
          : "Some rows failed. See details below.";
        setError(`Upload completed with failures. ${firstError}`);
        if (embedded) {
          onImportComplete?.();
        }
        return;
      }

      const uploadedDepartment = String(
        normalizedDepartment || rows.find((row) => String(row.department || "").trim())?.department || ""
      ).trim();
      if (embedded) {
        onImportComplete?.();
      } else if (uploadedDepartment) {
        localStorage.setItem("admin_department", uploadedDepartment);
        navigate(`/admin/department/${encodeURIComponent(uploadedDepartment)}`);
      } else {
        navigate("/admin");
      }
    } catch (uploadError) {
      console.error("Bulk upload error:", uploadError);
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Bulk upload failed due to network/server error.";
      setError(message);
    } finally {
      window.setTimeout(() => {
        setUploading(false);
        setUploadStep(0);
      }, 500);
    }
  }

  async function handleSingleUserCreate() {
    setSingleUserFeedback(null);
    const name = String(singleUserForm.name || "").trim();
    const email = String(singleUserForm.email || "").trim().toLowerCase();
    const password = String(singleUserForm.password || "").trim();
    const registerNo = String(singleUserForm.register_no || "").trim();
    const normalizedDepartment = String(department || "").trim();
    const normalizedYear = String(year || "").trim();
    const normalizedSemester = String(semester || "").trim();

    if (!name || !email || !password) {
      setSingleUserFeedback({
        tone: "error",
        message: "Name, email, and password are required for single user creation.",
      });
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setSingleUserFeedback({
        tone: "error",
        message: "Enter a valid email address.",
      });
      return;
    }
    if ((role === "student" || role === "faculty") && !normalizedDepartment) {
      setSingleUserFeedback({
        tone: "error",
        message: "Department is required for student/faculty user creation.",
      });
      return;
    }
    if (role === "student" && !registerNo) {
      setSingleUserFeedback({
        tone: "error",
        message: "Register number is required for student user creation.",
      });
      return;
    }

    setSingleSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSingleUserFeedback({
          tone: "error",
          message: "Your admin session expired. Please login again.",
        });
        return;
      }

      const apiStatus = await checkAdminApiAvailability({ token: session.access_token, timeoutMs: 10000 });
      if (!apiStatus.online) {
        setSingleUserFeedback({
          tone: "error",
          message: "Admin API is offline. Start backend server on port 7001 and try again.",
        });
        return;
      }

      const payload = {
        role,
        name,
        email,
        password,
        department: normalizedDepartment,
        register_no: role === "student" ? registerNo : "",
        year: normalizedYear,
        semester: normalizedSemester,
      };
      const { response } = await postAdminApi("admin/create-user", payload, session.access_token);
      const resultPayload = await response.json().catch(() => null);
      if (!response.ok || resultPayload?.success === false) {
        const message =
          resultPayload?.error ||
          resultPayload?.message ||
          (await parseAdminApiError(response, "Failed to create user"));
        setSingleUserFeedback({
          tone: "error",
          message,
        });
        return;
      }

      setSingleUserFeedback({
        tone: "success",
        message: `${role === "student" ? "Student" : "Faculty"} user created successfully.`,
      });
      setSingleUserForm({
        name: "",
        email: "",
        password: "",
        register_no: "",
      });
      if (embedded) {
        onImportComplete?.();
      }
    } catch (singleCreateError) {
      setSingleUserFeedback({
        tone: "error",
        message:
          singleCreateError instanceof Error
            ? singleCreateError.message
            : "Failed to create single user.",
      });
    } finally {
      setSingleSubmitting(false);
    }
  }

  const stepLabels = ["Configure", "Upload File", "Review & Submit"];
  const parsedStep = rows.length === 0 ? 0 : result ? 2 : 1;
  const uploadDrivenStep = uploadStep >= 3 ? 2 : uploadStep >= 1 ? 1 : 0;
  const currentStep = Math.max(parsedStep, uploadDrivenStep);

  const validRowCount = rows.filter((r) => r.email && r.name).length;
  const invalidRowCount = rows.length - validRowCount;

  if (loading && !embedded) {
    return (
      <div className="col-span-12 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="faculty-shimmer h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    );
  }

  return (
    <div className="col-span-12 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-blue-500/20">
              <Upload className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Bulk Upload</h1>
              <p className="text-xs text-slate-500">Import students or faculty from CSV / Excel</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all ${
                  i < currentStep
                    ? "bg-blue-600 text-white ring-blue-600 shadow-sm shadow-blue-200"
                    : i === currentStep
                      ? "bg-blue-50 text-blue-700 ring-blue-200"
                      : "bg-slate-100 text-slate-500 ring-slate-200"
                }`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    i < currentStep
                      ? "bg-white/25 text-white"
                      : i === currentStep
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-200 text-slate-500"
                  }`}>
                    {i < currentStep ? "✓" : i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < stepLabels.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* STEP 1: Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <ShellCard>
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-800">Upload Configuration</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Role selector */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Users className="h-3 w-3" /> Role
                </label>
                <div className="flex gap-2">
                  {(["student", "faculty"] as const).map((r) => {
                    const active = role === r;
                    const Icon = r === "student" ? GraduationCap : Users;
                    const activeClass = r === "student"
                      ? "bg-blue-50 border-blue-200 text-blue-700 shadow-blue-100/70"
                      : "bg-violet-50 border-violet-200 text-violet-700 shadow-violet-100/70";
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-lg transition-all ${
                          active ? activeClass : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Building2 className="h-3 w-3" /> Department
                </label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 transition focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
                  placeholder="Default department"
                />
              </div>

              {/* Year */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Calendar className="h-3 w-3" /> Year
                </label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 transition focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
                >
                  <option value="">Auto / from file</option>
                  <option value="1">Year 1</option>
                  <option value="2">Year 2</option>
                  <option value="3">Year 3</option>
                  <option value="4">Year 4</option>
                </select>
              </div>

              {/* Semester */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Hash className="h-3 w-3" /> Semester
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 transition focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
                >
                  <option value="">Auto / from file</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={String(s)}>Semester {s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Required columns hint */}
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <p className="text-xs text-slate-600">
                <span className="font-medium text-slate-700">Required columns:</span>{" "}
                {requiredColumns.join(", ")}.{" "}
                <span className="text-slate-500">Optional: register_no, year, semester</span>
              </p>
            </div>
          </ShellCard>
        </motion.div>

        {/* Quick single user add (linked from /admin/add-user → ?tab=add) */}
        <motion.div
          id="admin-bulk-add-one"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <ShellCard glow="violet">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-slate-800">
                Quick Single Add ({role === "student" ? "Student" : "Faculty"})
              </h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <input
                value={singleUserForm.name}
                onChange={(e) =>
                  setSingleUserForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                placeholder="Full name"
              />
              <input
                value={singleUserForm.email}
                onChange={(e) =>
                  setSingleUserForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                placeholder="Email"
              />
              <input
                value={singleUserForm.password}
                onChange={(e) =>
                  setSingleUserForm((prev) => ({ ...prev, password: e.target.value }))
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                placeholder="Password"
                type="password"
              />
              {role === "student" ? (
                <input
                  value={singleUserForm.register_no}
                  onChange={(e) =>
                    setSingleUserForm((prev) => ({ ...prev, register_no: e.target.value }))
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                  placeholder="Register no"
                />
              ) : (
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                  Register number not required for faculty.
                </div>
              )}
            </div>

            {singleUserFeedback ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  singleUserFeedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {singleUserFeedback.message}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSingleUserCreate()}
                disabled={singleSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all hover:from-violet-500 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {singleSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Add Single {role === "student" ? "Student" : "Faculty"}
                  </>
                )}
              </button>
            </div>
          </ShellCard>
        </motion.div>

        {/* STEP 2: File drop zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <ShellCard>
            <div className="mb-4 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-cyan-600" />
              <h3 className="text-sm font-semibold text-slate-800">Upload File</h3>
            </div>

            <label className="group relative flex cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 transition-all hover:border-blue-300 hover:bg-blue-50/40">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] via-transparent to-cyan-500/[0.02] opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 ring-1 ring-blue-500/20 transition-all group-hover:from-blue-500/20 group-hover:to-cyan-500/20 group-hover:shadow-lg group-hover:shadow-blue-500/10">
                <Upload className="h-6 w-6 text-blue-400 transition-transform group-hover:scale-110" />
              </div>
              <div className="relative text-center">
                <p className="text-sm font-medium text-slate-700">
                  Drop your file here, or <span className="text-blue-400">browse</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  CSV, XLS, XLSX, XLSM, XLSB, ODS &middot; Max 10MB
                </p>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.xlsm,.xlsb,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroenabled.12,application/vnd.ms-excel.sheet.binary.macroenabled.12,application/vnd.oasis.opendocument.spreadsheet"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            {headerHint && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-700">{headerHint}</p>
              </div>
            )}
          </ShellCard>
        </motion.div>

        {/* Data preview */}
        <AnimatePresence>
          {rows.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ShellCard glow="cyan">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-cyan-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Data Preview</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {invalidRowCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-amber-500/20">
                        <AlertCircle className="h-3 w-3" /> {invalidRowCount} incomplete
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
                      <Users className="h-3 w-3" /> {rows.length} row{rows.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">#</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Name</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Email</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Department</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Register No</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Year</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Sem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {rows.slice(0, 10).map((row, index) => {
                        const hasIssue = !row.email || !row.name;
                        return (
                          <tr
                            key={`${row.email}-${index}`}
                            className={`transition-colors ${hasIssue ? "bg-rose-50/70" : "hover:bg-blue-50/60"}`}
                          >
                            <td className="px-3 py-2 font-mono text-slate-500">{index + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{row.name || <span className="text-rose-500">—</span>}</td>
                            <td className="px-3 py-2 text-slate-700">{row.email || <span className="text-rose-500">—</span>}</td>
                            <td className="px-3 py-2 text-slate-700">{row.department || department || <span className="text-slate-500">—</span>}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{row.register_no || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{row.year || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{row.semester || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length > 10 && (
                  <p className="mt-2 text-center text-[11px] text-slate-500">
                    Showing first 10 of {rows.length} rows
                  </p>
                )}
              </ShellCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-sm text-rose-700">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload action + progress */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <ShellCard glow="emerald">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  Ready to Upload
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {rows.length === 0
                    ? "Upload a file first to begin"
                    : `${validRowCount} valid ${role}${validRowCount !== 1 ? "s" : ""} will be created`}
                </p>
              </div>

              <button
                onClick={() => void handleUpload()}
                disabled={uploading || rows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 ring-1 ring-blue-400/20 transition-all hover:from-blue-500 hover:to-indigo-400 hover:shadow-blue-900/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload {role === "student" ? "Students" : "Faculty"}
                  </>
                )}
              </button>
            </div>

            {/* Progress bar */}
            <AnimatePresence>
              {(uploading || uploadStep > 0) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {uploadStep === 1 ? "Checking server..." : uploadStep === 2 ? "Uploading data..." : uploadStep >= 3 ? "Complete!" : "Starting..."}
                    </span>
                    <span className="font-mono text-slate-500">Step {Math.max(uploadStep, 1)} / 3</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400"
                      initial={{ width: "0%" }}
                      animate={{ width: `${uploadStep === 1 ? 33 : uploadStep === 2 ? 66 : uploadStep >= 3 ? 100 : 0}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </ShellCard>
        </motion.div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <ShellCard glow={result.failed > 0 ? "violet" : "emerald"}>
                <div className="mb-4 flex items-center gap-2">
                  {result.failed === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-400" />
                  )}
                  <h3 className="text-sm font-semibold text-slate-800">
                    {result.failed === 0 ? "Upload Complete" : "Upload Completed with Issues"}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Created", value: result.success, color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
                    { label: "Updated", value: result.updated ?? 0, color: "text-cyan-700", bg: "bg-cyan-50 ring-cyan-200" },
                    { label: "Skipped", value: result.skipped ?? 0, color: "text-amber-400", bg: "bg-amber-500/10 ring-amber-500/20" },
                    { label: "Failed", value: result.failed, color: "text-rose-700", bg: "bg-rose-50 ring-rose-200" },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-xl px-4 py-3 ring-1 ${stat.bg}`}>
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {result.errors.length > 0 && (
                  <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {result.errors.map((msg, i) => (
                      <p key={`${msg}-${i}`} className="mb-1 flex items-start gap-1.5 text-xs text-rose-300/80">
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500/60" />
                        {msg}
                      </p>
                    ))}
                  </div>
                )}
              </ShellCard>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}

export default function BulkUploadPage() {
  return (
    <AdminShell title="Bulk Upload">
      <BulkUploadWorkspace />
    </AdminShell>
  );
}
