import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadStudentExperimentRowsFromCatalog } from "@/utils/unifiedStudentData";

export type StudentExperimentStatus =
  | "locked"
  | "unlocked"
  | "in_progress"
  | "submitted"
  | "evaluated";

type StudentExperimentJoinRow = Record<string, unknown>;

export type StudentExperimentDashboardRow = {
  id: string;
  studentId: string;
  experimentId: string;
  title: string;
  experimentNo: number;
  status: StudentExperimentStatus;
  startDate: string | null;
  submittedDate: string | null;
  deadlineDate: string | null;
  aiMarks: number | null;
  facultyMarks: number | null;
};

function normalizeStatus(value: string | null): StudentExperimentStatus {
  if (value === "locked") return "locked";
  if (value === "unlocked") return "unlocked";
  if (value === "in_progress") return "in_progress";
  if (value === "submitted") return "submitted";
  if (value === "evaluated") return "evaluated";
  return "locked";
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function text(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function sortByExperimentNo(
  rows: StudentExperimentDashboardRow[]
): StudentExperimentDashboardRow[] {
  return [...rows].sort((a, b) => a.experimentNo - b.experimentNo);
}

export function useStudentExperiments() {
  const [experiments, setExperiments] = useState<StudentExperimentDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Unable to load student session.");
        return;
      }

      const activeSubjectId =
        new URLSearchParams(window.location.search).get("subject") ||
        localStorage.getItem("student_subject_id");
      if (!activeSubjectId) {
        setExperiments([]);
        return;
      }

      /** Same source as Student Experiments page: `experiments` + submissions (not full_student_data view). */
      const data = await loadStudentExperimentRowsFromCatalog(user.id, activeSubjectId);

      const mapped = ((data || []) as StudentExperimentJoinRow[]).map((row, index) => ({
        id: text(row.id, `row-${index + 1}`),
        studentId: text(row.student_id, user.id),
        experimentId: text(row.experiment_id ?? row.exp_id ?? row.id, `exp-${index + 1}`),
        title: text(row.title ?? row.experiment_title, "Untitled Experiment"),
        experimentNo: Number(row.experiment_no || 0),
        status: normalizeStatus(text(row.status) as StudentExperimentStatus),
        startDate: text(row.start_date) || null,
        submittedDate: text(row.submitted_date) || null,
        deadlineDate: text(row.deadline_date) || null,
        aiMarks: toNumberOrNull(row.ai_marks),
        facultyMarks: toNumberOrNull(row.faculty_marks),
      }));

      setExperiments(sortByExperimentNo(mapped));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load experiments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  const startExperiment = useCallback(async (id: string): Promise<boolean> => {
    const { error: updateError } = await supabase
      .from("student_experiments")
      .update({
        status: "in_progress",
        start_date: new Date().toISOString(),
      })
      .eq("id", id)
      .is("start_date", null);

    if (updateError) return false;

    setExperiments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "in_progress",
              startDate: item.startDate || new Date().toISOString(),
            }
          : item
      )
    );

    return true;
  }, []);

  const submitExperiment = useCallback(async (id: string): Promise<boolean> => {
    const submittedDate = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("student_experiments")
      .update({
        status: "submitted",
        submitted_date: submittedDate,
      })
      .eq("id", id);

    if (updateError) return false;

    setExperiments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "submitted",
              submittedDate,
            }
          : item
      )
    );

    return true;
  }, []);

  return {
    experiments,
    loading,
    error,
    refetch,
    startExperiment,
    submitExperiment,
  };
}
