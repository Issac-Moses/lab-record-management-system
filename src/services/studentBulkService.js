import { supabase } from "@/lib/supabase";
import { postAdminApi } from "@/services/adminApiClient";

const EMAIL_REGEX = /\S+@\S+\.\S+/;
const BATCH_SIZE = 50;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function parseCsvLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
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

function detectDelimiter(headerLine) {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = parseCsvLine(headerLine, candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function mapHeader(rawHeader) {
  const header = normalizeString(rawHeader).toLowerCase().replace(/[^\w]+/g, "_");
  const aliases = {
    reg_no: "reg_no",
    register_no: "reg_no",
    register_number: "reg_no",
    roll_no: "reg_no",
    name: "name",
    student_name: "name",
    email: "email",
    password: "password",
    department: "department",
    departement: "department",
    year: "year",
    semester: "semester",
  };
  return aliases[header] || header;
}

export function parseStudentFileText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, "").trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(mapHeader);

  const records = [];
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const values = parseCsvLine(lines[rowIndex], delimiter);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = normalizeString(values[headerIndex]);
    });
    records.push({
      rowNumber: rowIndex + 1,
      reg_no: normalizeString(row.reg_no),
      name: normalizeString(row.name),
      email: normalizeString(row.email),
      password: normalizeString(row.password),
      department: normalizeString(row.department),
      year: normalizeString(row.year),
      semester: normalizeString(row.semester),
    });
  }
  return records;
}

async function autoMapImportedStudentsToSubjects(rows) {
  const successfulRegs = rows
    .filter((row) => row.status === "added" || row.status === "updated")
    .map((row) => normalizeString(row.reg_no))
    .filter(Boolean);

  if (!successfulRegs.length) return;

  const chunkedRegs = [];
  for (let start = 0; start < successfulRegs.length; start += BATCH_SIZE) {
    chunkedRegs.push(successfulRegs.slice(start, start + BATCH_SIZE));
  }

  for (const regChunk of chunkedRegs) {
    // student_subjects.student_id is scoped to auth/profile student ids in this app.
    // Always resolve ids from profiles to satisfy FK constraints.
    const { data: students, error: studentsError } = await supabase
      .from("profiles")
      .select("id, register_no, department, year")
      .eq("role", "student")
      .in("register_no", regChunk);

    if (studentsError) {
      console.error("Failed to fetch newly imported students for subject mapping:", studentsError);
      continue;
    }

    for (const student of Array.isArray(students) ? students : []) {
      const department = normalizeString(student?.department);
      const year = normalizeString(student?.year);
      if (!student?.id || !department || !year) continue;

      try {
        // Students are mapped by department + year so the same cohort is
        // available across both semesters in that academic year.
        const { data: subjects, error: subjectsError } = await supabase
          .from("subjects")
          .select("id")
          .eq("department", department)
          .eq("year", year);

        if (subjectsError) {
          console.error(
            `Failed to load subjects for student ${student.register_no || student.id}:`,
            subjectsError
          );
          continue;
        }

        const mappings = (subjects || []).map((subject) => ({
          student_id: student.id,
          subject_id: subject.id,
        }));

        if (!mappings.length) continue;

        let { error: mappingError } = await supabase.from("student_subjects").upsert(mappings, {
          onConflict: ["student_id", "subject_id"],
        });

        if (mappingError) {
          const retryRes = await supabase.from("student_subjects").upsert(mappings, {
            onConflict: "student_id,subject_id",
          });
          mappingError = retryRes.error;
        }

        if (mappingError) {
          console.error(
            `Failed to create student_subjects mappings for student ${student.register_no || student.id}:`,
            mappingError
          );
        }
      } catch (error) {
        console.error(
          `Unexpected student subject mapping error for ${student.register_no || student.id}:`,
          error
        );
      }
    }
  }
}

export async function validateStudents(rows) {
  const errors = [];
  const duplicateRegNo = new Set();
  const required = ["reg_no", "name", "email", "password"];
  const seenRegNos = new Set();

  rows.forEach((row) => {
    required.forEach((field) => {
      if (!normalizeString(row[field])) {
        errors.push({ rowNumber: row.rowNumber, message: `Missing column value: ${field}` });
      }
    });

    if (row.email && !EMAIL_REGEX.test(row.email)) {
      errors.push({ rowNumber: row.rowNumber, message: "Email invalid" });
    }

    const regNoKey = row.reg_no.toLowerCase();
    if (seenRegNos.has(regNoKey)) duplicateRegNo.add(regNoKey);
    seenRegNos.add(regNoKey);
  });

  rows.forEach((row) => {
    if (duplicateRegNo.has(row.reg_no.toLowerCase())) {
      errors.push({ rowNumber: row.rowNumber, message: "Duplicate Reg No in file" });
    }
  });

  const regNos = rows.map((row) => row.reg_no).filter(Boolean);
  const chunked = [];
  for (let start = 0; start < regNos.length; start += BATCH_SIZE) {
    chunked.push(regNos.slice(start, start + BATCH_SIZE));
  }

  const existing = new Set();
  for (const chunk of chunked) {
    const { data } = await supabase
      .from("profiles")
      .select("register_no")
      .in("register_no", chunk)
      .eq("role", "student");
    (data || []).forEach((row) => {
      existing.add(normalizeString(row.register_no).toLowerCase());
    });
  }

  const preview = rows.map((row) => {
    const isInvalid = errors.some((error) => error.rowNumber === row.rowNumber);
    const exists = existing.has(normalizeString(row.reg_no).toLowerCase());
    return {
      ...row,
      status: isInvalid ? "invalid" : exists ? "exists" : "valid",
    };
  });

  return {
    preview,
    errors,
  };
}

export async function logAdminActivity(adminId, action, details) {
  try {
    await supabase.from("admin_activity_logs").insert({
      admin_id: adminId,
      action,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin activity log failed:", error);
  }
}

export async function importStudents(rows, { token, adminId, onProgress, departmentOverride = "" }) {
  const validRows = rows.filter((row) => row.status === "valid");
  const reportRows = [];
  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const batch = validRows.slice(start, start + BATCH_SIZE);
    try {
      const requestPayload = {
        role: "student",
        department: departmentOverride,
        users: batch.map((row) => ({
          email: row.email,
          password: row.password,
          name: row.name,
          department: departmentOverride || row.department,
          register_no: row.reg_no,
          year: row.year || "",
          semester: row.semester || "",
        })),
      };
      const { response } = await postAdminApi("admin/bulk-create", requestPayload, token);

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        errors += batch.length;
        batch.forEach((row) => {
          reportRows.push({
            reg_no: row.reg_no,
            name: row.name,
            email: row.email,
            status: "error",
            message: payload?.error || payload?.message || "Batch import failed",
          });
        });
      } else {
        const batchErrors = payload?.data?.errors || [];
        const batchSuccess = payload?.data?.success ?? batch.length;
        const batchSkipped = payload?.data?.skipped ?? 0;
        const batchFailed = payload?.data?.failed ?? 0;

        added += batchSuccess;
        skipped += batchSkipped + batchFailed;
        errors += batchErrors.length;

        batch.forEach((row) => {
          const rowError = batchErrors.find((message) => message?.includes(row.email) || message?.includes(row.reg_no));
          reportRows.push({
            reg_no: row.reg_no,
            name: row.name,
            email: row.email,
            status: rowError ? "skipped" : "added",
            message: rowError || "Imported",
          });
        });
      }
    } catch (error) {
      errors += batch.length;
      batch.forEach((row) => {
        reportRows.push({
          reg_no: row.reg_no,
          name: row.name,
          email: row.email,
          status: "error",
          message: "Network/server error",
        });
      });
    } finally {
      if (onProgress) {
        onProgress(Math.min(100, Math.round(((start + batch.length) / Math.max(1, validRows.length)) * 100)));
      }
    }
  }

  rows
    .filter((row) => row.status === "invalid" || row.status === "exists")
    .forEach((row) => {
      reportRows.push({
        reg_no: row.reg_no,
        name: row.name,
        email: row.email,
        status: row.status === "exists" ? "skipped" : "error",
        message: row.status === "exists" ? "Already exists" : "Invalid row",
      });
      skipped += 1;
    });

  await logAdminActivity(
    adminId,
    "BULK_STUDENT_IMPORT",
    `Added: ${added}, Skipped: ${skipped}, Errors: ${errors}`
  );

  try {
    await autoMapImportedStudentsToSubjects(reportRows);
  } catch (mappingError) {
    console.error("Student subject auto-mapping failed:", mappingError);
  }

  return {
    added,
    skipped,
    errors,
    reportRows,
  };
}

export function exportImportReportCsv(reportRows) {
  const headers = ["reg_no", "name", "email", "status", "message"];
  const csv = [
    headers.join(","),
    ...reportRows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `import-report-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
