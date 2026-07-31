import { generateMarksFromAI } from "@/utils/marksEngine";
import { getDepartmentForSubject } from "@/utils/subjectDepartmentMap";
import { getITStudents } from "@/data/it3rdYearStudents";

export type StudentPoolItem = {
  name: string;
  regNo: string;
  department: "IT";
};

export type StudentRecordExperiment = {
  experimentNo: number;
  experimentName: string;
  status: "evaluated" | "submitted" | "pending";
  aiScore: number | null;
  marks: number;
  aim: string;
  algorithm: string;
  program: string;
  output: string;
  result: string;
  updatedAt: string;
};

export type StudentRecord = {
  studentName: string;
  registerNumber: string;
  department: "IT";
  experiments: StudentRecordExperiment[];
};

export const studentPool: StudentPoolItem[] = [
  ...getITStudents().map((student) => ({
    name: student.name,
    regNo: student.regNo,
    department: "IT" as const,
  })),
];

function seededValue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash) / 2147483647;
}

function seededInt(seed: string, min: number, max: number): number {
  const rand = seededValue(seed);
  return Math.floor(rand * (max - min + 1)) + min;
}

export function generateStudentRecords(
  experiments: Array<{ experimentNo: number; title: string }>,
  subjectName = ""
): StudentRecord[] {
  const allowedStudents = getStudentsByDepartment(subjectName);
  const safeExperiments = experiments.length
    ? experiments
    : Array.from({ length: 10 }).map((_, index) => ({
        experimentNo: index + 1,
        title: `Experiment ${index + 1}`,
      }));

  return allowedStudents.map((student) => {
    const completedCount = seededInt(
      `${student.regNo}:completed`,
      5,
      Math.min(10, safeExperiments.length)
    );
    const experimentRecords = safeExperiments.map((exp, index) => {
      const completed = index < completedCount;
      const aiScore = completed ? seededInt(`${student.regNo}:${exp.experimentNo}:ai`, 60, 95) : null;
      const marks = completed && aiScore != null ? generateMarksFromAI(aiScore) : 0;
      return {
        experimentNo: exp.experimentNo,
        experimentName: exp.title,
        status: completed ? "evaluated" : "pending",
        aiScore,
        marks,
        aim: `To perform ${exp.title.toLowerCase()}.`,
        algorithm:
          "Step 1: Prepare environment.\nStep 2: Execute experiment steps.\nStep 3: Verify and analyze result.",
        program: `# ${exp.title}\nprint("Execution completed")`,
        output: completed ? "Execution output captured successfully." : "Pending execution.",
        result: completed ? "Experiment executed successfully." : "Experiment not yet evaluated.",
        updatedAt: new Date(Date.now() - index * 86400000).toISOString(),
      } as StudentRecordExperiment;
    });
    return {
      studentName: student.name,
      registerNumber: student.regNo,
      department: student.department,
      experiments: experimentRecords,
    };
  });
}

export function getStudentsByDepartment(subject: string): StudentPoolItem[] {
  const department = getDepartmentForSubject(subject);
  if (department !== "IT") return [];
  return studentPool.filter((student) => student.department === "IT");
}
