import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  parseStudentFileText,
  validateStudents,
  importStudents,
  exportImportReportCsv,
} from "@/services/studentBulkService";
import { supabase } from "@/lib/supabase";

function previewStatusClasses(status) {
  if (status === "valid") return "text-emerald-700";
  if (status === "exists") return "text-amber-700";
  return "text-rose-700";
}

function isSpreadsheetFilename(name) {
  const lower = String(name || "").toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".xlsm") ||
    lower.endsWith(".xlsb") ||
    lower.endsWith(".ods")
  );
}

export default function BulkStudentUpload({ adminId, onImported, notify }) {
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [departmentOverride, setDepartmentOverride] = useState("");
  const [result, setResult] = useState(null);

  const previewRows = useMemo(() => rows.slice(0, 30), [rows]);

  async function parseFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const text = await file.text();
      return parseStudentFileText(text);
    }

    if (isSpreadsheetFilename(name)) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
      for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        const normalizedText = [
          "reg_no,name,email,password,department",
          ...jsonRows.map((row) =>
            [
              row.reg_no || row.register_no || row.register_number || row["REGISTER NUMBER"] || "",
              row.name || row.student_name || row.NAME || "",
              row.email || row["EMAIL "] || row.EMAIL || "",
              row.password || row["PASSWORD "] || row.PASSWORD || "",
              row.department || row.departement || row.DEPARTEMENT || "",
            ]
              .map((value) => String(value ?? "").replace(/,/g, " "))
              .join(",")
          ),
        ].join("\n");
        const parsed = parseStudentFileText(normalizedText);
        if (parsed.length > 0) {
          return parsed;
        }
      }
      return [];
    }

    throw new Error("Unsupported file type. Please upload CSV/XLS/XLSX/XLSM/XLSB/ODS.");
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setRows([]);
    setErrors([]);
    setResult(null);
    try {
      const parsedRows = await parseFile(file);
      const validation = await validateStudents(parsedRows);
      setRows(validation.preview);
      setErrors(validation.errors);
      notify("success", `File parsed: ${validation.preview.length} rows.`);
    } catch (error) {
      console.error("Validation failed:", error);
      notify("error", error.message || "Validation failed.");
    } finally {
      setValidating(false);
    }
  }

  async function handleImport() {
    if (rows.length === 0) {
      notify("warning", "Upload and validate a file first.");
      return;
    }

    setImporting(true);
    setProgress(0);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        notify("error", "Admin session expired. Please login again.");
        setImporting(false);
        return;
      }

      const importResult = await importStudents(rows, {
        token,
        adminId,
        onProgress: setProgress,
        departmentOverride,
      });
      setResult(importResult);
      onImported?.();
      notify(
        "success",
        `Import finished. Added ${importResult.added}, Skipped ${importResult.skipped}, Errors ${importResult.errors}.`
      );
    } catch (error) {
      console.error("Import failed:", error);
      notify("error", "Import failed. Please retry.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="faculty-surface rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Bulk Student Upload</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.xlsm,.xlsb,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroenabled.12,application/vnd.ms-excel.sheet.binary.macroenabled.12,application/vnd.oasis.opendocument.spreadsheet"
          onChange={handleFileChange}
          className="w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white"
        />
        <input
          value={departmentOverride}
          onChange={(event) => setDepartmentOverride(event.target.value)}
          placeholder="Department override (optional)"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
        />
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Expected columns: <code>reg_no</code>, <code>name</code>, <code>email</code>, <code>password</code>
      </p>

      {validating ? <p className="mt-2 text-sm text-slate-600">Validating file...</p> : null}

      {errors.length > 0 ? (
        <div className="mt-3 max-h-28 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {errors.slice(0, 20).map((error) => (
            <p key={`${error.rowNumber}-${error.message}`}>
              Row {error.rowNumber} → {error.message}
            </p>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="p-2">Reg No</th>
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={`${row.rowNumber}-${row.reg_no}`} className="border-t border-slate-100">
                  <td className="p-2 text-slate-900">{row.reg_no || "—"}</td>
                  <td className="p-2 text-slate-900">{row.name || "—"}</td>
                  <td className="p-2 text-slate-600">{row.email || "—"}</td>
                  <td className={`p-2 capitalize ${previewStatusClasses(row.status)}`}>
                    {row.status === "valid" ? "Valid" : row.status === "exists" ? "Already exists" : "Invalid"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void handleImport()}
          disabled={importing || rows.length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {importing ? "Importing..." : "Import Students"}
        </button>
        {result ? (
          <button
            onClick={() => exportImportReportCsv(result.reportRows)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Download Import Report.csv
          </button>
        ) : null}
      </div>

      {importing ? (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-600">Importing students... {progress}%</p>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-emerald-800">Students Added: {result.added}</p>
          <p className="text-amber-800">Skipped: {result.skipped}</p>
          <p className="text-rose-700">Errors: {result.errors}</p>
        </div>
      ) : null}
    </div>
  );
}
