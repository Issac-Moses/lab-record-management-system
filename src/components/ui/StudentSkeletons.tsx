import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

const TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

export function FadeSwitch({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={TRANSITION}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={TRANSITION}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Bone({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`faculty-shimmer rounded-xl bg-slate-200 ${className}`}
    />
  );
}

function Card({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`faculty-surface rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-8">
      {/* Header */}
      <Card className="p-6 md:p-8">
        <Bone className="h-4 w-32 mb-2" />
        <Bone className="h-8 w-64 mb-3" />
        <Bone className="h-4 w-44" />
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-10 w-36 rounded-xl" />
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <Bone className="h-8 w-8 rounded-lg mb-3" />
            <Bone className="h-7 w-16 mb-1" />
            <Bone className="h-3 w-24" />
          </Card>
        ))}
      </div>

      {/* Two-column */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <Bone className="h-5 w-40 mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-12 w-full mb-2" />
          ))}
        </Card>
        <Card>
          <Bone className="h-5 w-32 mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-12 w-full mb-2" />
          ))}
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <Bone className="h-5 w-40 mb-5" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-4">
            <Bone className="h-3 w-24 mb-2" />
            <Bone className="h-2 w-full rounded-full" />
          </div>
        ))}
      </Card>
      </div>
    </div>
  );
}

export function SubjectsSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen w-full px-6 py-10 md:px-10 lg:px-14">
      <div className="mx-auto max-w-[1380px] space-y-10">
      {/* Hero */}
      <Card className="p-6 md:p-8">
        <div className="flex items-start gap-4">
          <Bone className="h-14 w-14 rounded-2xl flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Bone className="h-8 w-72" />
            <Bone className="h-4 w-48" />
            <Bone className="h-7 w-56 rounded-full mt-1" />
          </div>
        </div>
      </Card>

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <Bone className="h-1 w-full rounded-none -mx-5 -mt-5 mb-5" />
            <Bone className="h-12 w-12 rounded-xl mb-4" />
            <Bone className="h-5 w-40 mb-2" />
            <Bone className="h-4 w-24 mb-5" />
            <div className="border-t border-slate-200 pt-4">
              <div className="flex justify-between mb-4">
                <Bone className="h-6 w-20 rounded-md" />
                <Bone className="h-4 w-16" />
              </div>
              <Bone className="h-10 w-full rounded-xl" />
            </div>
          </Card>
        ))}
      </div>
      </div>
    </div>
  );
}

export function ExperimentsSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <Bone className="h-8 w-8 rounded-lg" />
          <div>
            <Bone className="h-6 w-48 mb-2" />
            <Bone className="h-4 w-32" />
          </div>
        </div>
      </Card>

      {/* Filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Card grid */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <div className="flex items-center gap-3 mb-4">
              <Bone className="h-10 w-10 rounded-xl" />
              <Bone className="h-6 w-20 rounded-full" />
            </div>
            <Bone className="h-5 w-48 mb-2" />
            <Bone className="h-4 w-full mb-1" />
            <Bone className="h-4 w-3/4 mb-4" />
            <div className="flex justify-between items-center">
              <Bone className="h-3 w-28" />
              <Bone className="h-8 w-28 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
      </div>
    </div>
  );
}

export function SubmissionsSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-lg" />
        <Bone className="h-6 w-36" />
        <Bone className="h-6 w-12 rounded-full" />
      </div>

      {/* Card grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <div className="flex items-center gap-3 mb-3">
              <Bone className="h-9 w-9 rounded-full" />
              <div className="flex-1">
                <Bone className="h-4 w-32 mb-1" />
                <Bone className="h-3 w-20" />
              </div>
              <Bone className="h-6 w-20 rounded-full" />
            </div>
            <Bone className="h-3 w-40 mb-3" />
            <div className="flex gap-2">
              <Bone className="h-8 w-16 rounded-lg" />
              <Bone className="h-8 w-16 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>
      </div>
    </div>
  );
}

export function MarksSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-lg" />
        <Bone className="h-6 w-36" />
      </div>

      {/* Summary card */}
      <Card>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center gap-3">
            <Bone className="h-28 w-28 rounded-full" />
            <Bone className="h-4 w-20" />
          </div>
          <Card>
            <Bone className="h-8 w-16 mb-2" />
            <Bone className="h-4 w-24" />
          </Card>
          <Card>
            <Bone className="h-8 w-16 mb-2" />
            <Bone className="h-4 w-24" />
          </Card>
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <Bone className="h-8 w-8 rounded-lg mb-2" />
            <Bone className="h-6 w-12 mb-1" />
            <Bone className="h-3 w-20" />
          </Card>
        ))}
      </div>

      {/* Exam marks list */}
      <Card>
        <Bone className="h-5 w-32 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-12 w-full mb-2" />
        ))}
      </Card>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-8">
      {/* Profile header */}
      <Card className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <Bone className="h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-2 text-center md:text-left">
            <Bone className="h-7 w-48 mx-auto md:mx-0" />
            <Bone className="h-4 w-56 mx-auto md:mx-0" />
            <Bone className="h-6 w-20 rounded-full mx-auto md:mx-0" />
          </div>
        </div>
      </Card>

      {/* Info cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <div className="flex items-center gap-3">
              <Bone className="h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <Bone className="h-3 w-16 mb-1" />
                <Bone className="h-5 w-40" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Bone className="h-8 w-8 rounded-lg mb-2" />
            <Bone className="h-6 w-12 mb-1" />
            <Bone className="h-3 w-20" />
          </Card>
        ))}
      </div>

      {/* Experiment list */}
      <Card>
        <Bone className="h-5 w-40 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-14 w-full mb-2" />
        ))}
      </Card>

      {/* Action cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <Bone className="h-10 w-10 rounded-xl mb-3" />
            <Bone className="h-5 w-28 mb-2" />
            <Bone className="h-3 w-40" />
          </Card>
        ))}
      </div>
      </div>
    </div>
  );
}

export function ExperimentFormSkeleton() {
  return (
    <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-lg" />
        <div>
          <Bone className="h-6 w-52 mb-1" />
          <Bone className="h-4 w-32" />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3">
        <Bone className="h-7 w-24 rounded-full" />
        <Bone className="h-4 w-36" />
      </div>

      {/* Form sections */}
      {["Aim", "Procedure", "Code", "Output", "Result"].map((label) => (
        <Card key={label}>
          <Bone className="h-4 w-24 mb-3" />
          <Bone className="h-32 w-full rounded-lg" />
        </Card>
      ))}

      {/* Action bar */}
      <div className="flex gap-3 justify-end">
        <Bone className="h-10 w-28 rounded-xl" />
        <Bone className="h-10 w-28 rounded-xl" />
      </div>
      </div>
    </div>
  );
}
