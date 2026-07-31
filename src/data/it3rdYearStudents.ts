export type It3rdYearStudent = {
  name: string;
  regNo: string;
  department: "IT";
  year: 3;
};

// Source: manually maintained converted dataset for IT 3rd year usage in runtime.
// NOTE: Keep this file aligned with your exported CSV/JSON from the uploaded sheet.
export const IT_3RD_YEAR: It3rdYearStudent[] = [
  { name: "VIGNESH K", regNo: "112723205035", department: "IT", year: 3 },
  { name: "HARISH R", regNo: "112723205024", department: "IT", year: 3 },
  { name: "DINESH K", regNo: "112723205036", department: "IT", year: 3 },
  { name: "SURESH P", regNo: "112723205011", department: "IT", year: 3 },
  { name: "KISHORE M", regNo: "112723205019", department: "IT", year: 3 },
];

export function getITStudents(): It3rdYearStudent[] {
  return IT_3RD_YEAR.filter((student) => student.department === "IT");
}

