import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

export type BulkExperimentRow = {
  rowNumber: number;
  experiment_no: number | null;
  title: string;
  description: string;
  /** Raw or ISO datetime string for due date; empty = none */
  due_date: string | null;
};

export type BulkInsertResult = {
  success: number;
  failed: number;
  errors: { rowNumber: number; message: string }[];
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

function normalizeHeader(header: string): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveColumnIndex(headers: string[]): Record<string, number> {
  const norm = headers.map((h) => normalizeHeader(h));
  const find = (...aliases: string[]): number => {
    for (const alias of aliases) {
      const a = normalizeHeader(alias);
      const idx = norm.findIndex((n) => n === a || n.endsWith(`_${a}`) || n.startsWith(`${a}_`));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const titleIdx = find("title", "experiment_title", "name", "lab_title");
  const descIdx = find("description", "desc", "instructions", "details", "body");
  const noIdx = find("experiment_no", "exp_no", "lab_no", "number", "no", "seq");
  const dueIdx = find("due_date", "deadline", "due", "end_date", "closes");

  return { titleIdx, descIdx, noIdx, dueIdx };
}

function parseOptionalNumber(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalDue(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

/**
 * Parse CSV text into experiment rows (header row required).
 */
export function parseExperimentCsvText(text: string): BulkExperimentRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const firstLine = lines[0] ?? "";
  const delimiter = detectCsvDelimiter(firstLine);
  const headerCells = splitCsvLine(firstLine, delimiter);
  const { titleIdx, descIdx, noIdx, dueIdx } = resolveColumnIndex(headerCells);

  const tIdx = typeof titleIdx === "number" ? titleIdx : -1;
  const dIdx = typeof descIdx === "number" ? descIdx : -1;
  const nIdx = typeof noIdx === "number" ? noIdx : -1;
  const duIdx = typeof dueIdx === "number" ? dueIdx : -1;

  if (tIdx < 0 || dIdx < 0) {
    throw new Error(
      'CSV must include columns for title and description (e.g. "title" and "description").'
    );
  }

  const out: BulkExperimentRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const rowLine = lines[i];
    if (!rowLine) continue;
    const rowNumber = i + 1;
    const cells = splitCsvLine(rowLine, delimiter);
    const title = String(cells[tIdx] ?? "").trim();
    const description = String(cells[dIdx] ?? "").trim();
    const experiment_no = nIdx >= 0 ? parseOptionalNumber(cells[nIdx] ?? "") : null;
    const dueRaw = duIdx >= 0 ? String(cells[duIdx] ?? "").trim() : "";
    const due_date = dueRaw ? parseOptionalDue(dueRaw) : null;

    if (!title && !description) continue;
    out.push({
      rowNumber,
      experiment_no,
      title,
      description,
      due_date,
    });
  }
  return out;
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

/**
 * Map a generic sheet row object to BulkExperimentRow using flexible keys.
 */
function rowObjectToBulk(row: Record<string, unknown>, rowNumber: number): BulkExperimentRow | null {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const nk = normalizeHeader(k);
      for (const [rk, rv] of Object.entries(row)) {
        if (normalizeHeader(rk) === nk || normalizeHeader(rk).replace(/s$/, "") === nk) {
          return String(rv ?? "").trim();
        }
      }
    }
    return "";
  };

  const title = get("title", "experiment_title", "name", "lab_title");
  const description = get("description", "desc", "instructions", "details");
  const noStr = get("experiment_no", "exp_no", "lab_no", "number", "no", "seq");
  const dueStr = get("due_date", "deadline", "due", "end_date", "closes");

  if (!title && !description) return null;

  return {
    rowNumber,
    experiment_no: noStr ? parseOptionalNumber(noStr) : null,
    title,
    description,
    due_date: dueStr ? parseOptionalDue(dueStr) : null,
  };
}

export async function parseExperimentFile(file: File): Promise<BulkExperimentRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseExperimentCsvText(text);
  }

  if (isSpreadsheetFilename(name)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      const out: BulkExperimentRow[] = [];
      let rn = 2;
      for (const jr of jsonRows) {
        const mapped = rowObjectToBulk(jr, rn);
        rn += 1;
        if (mapped) out.push(mapped);
      }
      if (out.length > 0) return out;
    }
    throw new Error(
      "No data rows found in spreadsheet. Use columns: title, description, and optionally experiment_no, due_date."
    );
  }

  throw new Error("Unsupported file type. Please upload CSV, XLSX, or XLS.");
}

export function validateBulkExperimentRows(rows: BulkExperimentRow[]): {
  valid: BulkExperimentRow[];
  rowErrors: { rowNumber: number; message: string }[];
} {
  const valid: BulkExperimentRow[] = [];
  const rowErrors: { rowNumber: number; message: string }[] = [];

  for (const r of rows) {
    if (!r.title.trim()) {
      rowErrors.push({ rowNumber: r.rowNumber, message: "Title is required." });
      continue;
    }
    if (!r.description.trim()) {
      rowErrors.push({ rowNumber: r.rowNumber, message: "Description is required." });
      continue;
    }
    valid.push(r);
  }

  return { valid, rowErrors };
}

function buildPayload(
  row: BulkExperimentRow,
  subjectId: string,
  userId: string,
  includeExperimentNo: boolean,
  includeDueDate: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: row.title.trim(),
    description: row.description.trim(),
    subject_id: subjectId,
    created_by: userId,
    status: "draft",
  };
  if (includeExperimentNo && row.experiment_no != null) {
    payload.experiment_no = row.experiment_no;
  }
  if (includeDueDate && row.due_date) {
    payload.due_date = row.due_date;
  }
  return payload;
}

async function insertOneExperiment(
  row: BulkExperimentRow,
  subjectId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const variants: Array<{ includeExperimentNo: boolean; includeDueDate: boolean }> = [
    { includeExperimentNo: true, includeDueDate: true },
    { includeExperimentNo: true, includeDueDate: false },
    { includeExperimentNo: false, includeDueDate: true },
    { includeExperimentNo: false, includeDueDate: false },
  ];

  let lastMsg = "Insert failed.";
  for (const v of variants) {
    const payload = buildPayload(row, subjectId, userId, v.includeExperimentNo, v.includeDueDate);
    const attempt = await supabase.from("experiments").insert(payload);
    if (!attempt.error) return { ok: true };
    lastMsg = attempt.error?.message || lastMsg;
  }

  return { ok: false, message: lastMsg };
}

/**
 * Insert validated experiment rows one-by-one (clear per-row errors for faculty).
 */
export async function bulkInsertExperiments(
  rows: BulkExperimentRow[],
  subjectId: string,
  userId: string
): Promise<BulkInsertResult> {
  const errors: { rowNumber: number; message: string }[] = [];
  let success = 0;

  for (const row of rows) {
    const res = await insertOneExperiment(row, subjectId, userId);
    if (res.ok) {
      success += 1;
    } else {
      errors.push({ rowNumber: row.rowNumber, message: res.message });
    }
  }

  return {
    success,
    failed: errors.length,
    errors,
  };
}

/** Sample CSV content for download helper */
export const EXPERIMENTS_BULK_TEMPLATE_CSV = `experiment_no,title,description,due_date
1,Introduction to Lab,Safety and environment setup,
2,Arrays and pointers,Implement basic array operations.,`;
