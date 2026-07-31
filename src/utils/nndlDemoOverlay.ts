export type DemoExperiment = {
  id: string;
  title?: string | null;
  status?: string | null;
  marks?: number | null;
};

const DEMO_MARKS = [8, 9, 7, 8, 8, 8, 8, 8, 9, 9] as const;

export function isDemoMode(searchParams: URLSearchParams): boolean {
  return searchParams.get("demo_nndl") === "1";
}

export function isNNDLSubject(subjectName: string): boolean {
  const normalized = String(subjectName || "").toUpperCase();
  return (
    normalized.includes("NNDL") ||
    normalized.includes("NEURAL NETWORK") ||
    normalized.includes("DEEP LEARNING")
  );
}

export function getDemoMarks(): number[] {
  return [...DEMO_MARKS];
}

export function applyExperimentOverlay<T extends DemoExperiment>(experiments: T[]): T[] {
  return experiments.map((experiment, index) => {
    const mark = DEMO_MARKS[index];
    if (mark === undefined) return experiment;
    return {
      ...experiment,
      status: "evaluated",
      marks: mark,
    };
  });
}

export function getAggregateStats() {
  return {
    totalExperiments: 10,
    completed: 10,
    pending: 0,
    totalMarks: 82,
    internalPercent: 82,
    progress: 100,
  };
}
