import type {
  StudentExperimentDashboardRow,
  StudentExperimentStatus,
} from "@/hooks/useStudentExperiments";

type ExperimentCardRow = StudentExperimentDashboardRow & {
  effectiveStatus: StudentExperimentStatus;
  canOpen: boolean;
};

type ExperimentCardProps = {
  experiment: ExperimentCardRow;
  onStart: (experiment: ExperimentCardRow) => void | Promise<void>;
  onOpen: (experiment: ExperimentCardRow) => void;
  onSubmit: (experiment: ExperimentCardRow) => void | Promise<void>;
};

const STATUS_STYLES: Record<StudentExperimentStatus, string> = {
  locked: "border-slate-300 bg-slate-100 text-slate-700",
  unlocked: "border-blue-300 bg-blue-50 text-blue-700",
  in_progress: "border-amber-300 bg-amber-50 text-amber-700",
  submitted: "border-purple-300 bg-purple-50 text-purple-700",
  evaluated: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getDaysLeft(deadlineDate: string | null): number | null {
  if (!deadlineDate) return null;
  const deadline = new Date(deadlineDate);
  if (Number.isNaN(deadline.getTime())) return null;
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getStatusLabel(status: StudentExperimentStatus): string {
  if (status === "locked") return "Locked";
  if (status === "unlocked") return "Unlocked";
  if (status === "in_progress") return "In Progress";
  if (status === "submitted") return "Submitted";
  return "Evaluated";
}

export default function ExperimentCard({
  experiment,
  onStart,
  onOpen,
  onSubmit,
}: ExperimentCardProps) {
  const daysLeft = getDaysLeft(experiment.deadlineDate);
  const isLate = daysLeft !== null && daysLeft < 0;

  return (
    <div
      className={`rounded-xl border p-4 ${
        experiment.effectiveStatus === "locked" ? "opacity-70" : "opacity-100"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Experiment {experiment.experimentNo}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {experiment.title}
          </h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[experiment.effectiveStatus]}`}
        >
          {experiment.effectiveStatus === "locked" ? "🔒 " : ""}
          {getStatusLabel(experiment.effectiveStatus)}
        </span>
      </div>

      <div className="space-y-1 text-sm text-slate-600">
        {experiment.effectiveStatus === "locked" && (
          <p>Complete previous experiment</p>
        )}

        {experiment.effectiveStatus === "in_progress" && (
          <p>Start Date: {formatDate(experiment.startDate)}</p>
        )}

        {experiment.effectiveStatus === "submitted" && (
          <p>Submitted Date: {formatDate(experiment.submittedDate)}</p>
        )}

        {experiment.effectiveStatus === "evaluated" && (
          <>
            <p>AI Marks: {experiment.aiMarks ?? "-"}</p>
            <p>Faculty Marks: {experiment.facultyMarks ?? "-"}</p>
          </>
        )}

        {daysLeft !== null && !isLate && (
          <p>
            Deadline: {formatDate(experiment.deadlineDate)} ({daysLeft} day
            {daysLeft === 1 ? "" : "s"} left)
          </p>
        )}
        {isLate && <p className="font-medium text-rose-600">Late Submission</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {experiment.effectiveStatus === "locked" && (
          <button
            type="button"
            disabled
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500"
          >
            Complete previous experiment
          </button>
        )}

        {experiment.effectiveStatus === "unlocked" && (
          <button
            type="button"
            onClick={() => void onStart(experiment)}
            className="rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Start Experiment
          </button>
        )}

        {experiment.effectiveStatus === "in_progress" && (
          <>
            <button
              type="button"
              onClick={() => onOpen(experiment)}
              className="rounded-lg border border-amber-200 bg-amber-500 px-3 py-1.5 text-sm font-medium text-white"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => void onSubmit(experiment)}
              className="rounded-lg border border-purple-200 bg-purple-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Submit
            </button>
          </>
        )}

        {experiment.effectiveStatus === "submitted" && (
          <button
            type="button"
            disabled
            className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700"
          >
            Waiting for evaluation
          </button>
        )}

        {experiment.effectiveStatus === "evaluated" && (
          <button
            type="button"
            onClick={() => onOpen(experiment)}
            className="rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}
