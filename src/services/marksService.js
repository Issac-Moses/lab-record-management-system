export function convertMarksToGrade(marks) {
  const numericMarks = Number(marks);
  if (!Number.isFinite(numericMarks)) return "N/A";

  if (numericMarks >= 9) return "O";
  if (numericMarks >= 8) return "A+";
  if (numericMarks >= 7) return "A";
  if (numericMarks >= 6) return "B+";
  if (numericMarks >= 5) return "B";
  return "RA";
}
