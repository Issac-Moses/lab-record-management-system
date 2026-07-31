import { memo } from "react";
import type { SectionProgress } from "@/hooks/useExperimentProgress";
import ProgressRing from "./ProgressRing";
import SectionProgressItem from "./SectionProgressItem";

interface ProgressPanelProps {
  progress: number;
  completedCount: number;
  totalSections: number;
  sections: SectionProgress[];
  onSectionClick: (key: string) => void;
}

function ProgressPanelInner({
  progress,
  completedCount,
  totalSections,
  sections,
  onSectionClick,
}: ProgressPanelProps) {
  return (
    <div className="sticky top-24 space-y-5">
      {/* Progress ring card */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0c0e1a]/80 p-5">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Progress
        </p>
        <div className="flex justify-center">
          <ProgressRing progress={progress} />
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          {completedCount} of {totalSections} sections
        </p>
      </div>

      {/* Section checklist */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#0c0e1a]/80 p-4">
        <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Sections
        </p>
        <div className="space-y-0.5">
          {sections.map((section) => (
            <SectionProgressItem
              key={section.key}
              section={section}
              onClick={onSectionClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const ProgressPanel = memo(ProgressPanelInner);
export default ProgressPanel;
