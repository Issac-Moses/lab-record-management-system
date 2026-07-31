import * as XLSX from "xlsx";

export function exportMarksToExcel(data = []) {
  const worksheetRows = (Array.isArray(data) ? data : []).map((row) => ({
    "Register Number": row.registerNumber || "-",
    "Student Name": row.studentName || "-",
    Experiment: row.experiment || "-",
    Marks: row.marks ?? "-",
    Grade: row.grade || "N/A",
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Marks Report");
  XLSX.writeFile(workbook, "subject_marks_report.xlsx");
}

export function exportFacultyDashboardToExcel(data = [], fileBaseName = "lab_report") {
  const worksheetRows = (Array.isArray(data) ? data : []).map((row) => ({
    student_name: row.studentName || "-",
    register_no: row.registerNumber || "-",
    department: row.department || "-",
    subject: row.subject || "-",
    experiment_number: row.experimentNumber ?? "-",
    experiment: row.experiment || "-",
    status: row.status || "-",
    marks: row.marks ?? "-",
    ai_score: row.aiScore ?? "-",
    updated_at: row.updatedAt || "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Faculty Dashboard");
  XLSX.writeFile(workbook, `${fileBaseName}.xlsx`);
}

export function exportFacultySuperDashboardToExcel(data = [], fileBaseName = "lab_report") {
  const worksheetRows = (Array.isArray(data) ? data : []).map((row) => ({
    student_name: row.studentName || "-",
    register_no: row.registerNumber || "-",
    subject: row.subject || "-",
    total_experiments: row.totalExperiments ?? 0,
    completed_experiments: row.completedExperiments ?? 0,
    progress_percentage: row.progressPercentage ?? 0,
    total_marks: row.totalMarks ?? "-",
    avg_ai_score: row.avgAiScore ?? "-",
    leaderboard_rank: row.leaderboardRank ?? "-",
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Faculty Super Dashboard");
  XLSX.writeFile(workbook, `${fileBaseName}.xlsx`);
}
