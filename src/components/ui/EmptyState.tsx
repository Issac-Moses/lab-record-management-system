import { motion } from "framer-motion";
import { FileX } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  message?: string;
  title?: string;
  icon?: ReactNode;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  message,
  title,
  icon,
  description,
  action,
}: EmptyStateProps) {
  const displayTitle = title || message || "Nothing found";
  const displayIcon = icon || <FileX className="w-8 h-8 text-gray-500" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="student-page-enter flex justify-center px-4 py-10"
    >
      <div className="faculty-surface w-full max-w-xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-blue-200/70 bg-blue-50/70 text-blue-400">
          {displayIcon}
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-700">{displayTitle}</h3>
        {description && (
          <p className="mx-auto mb-6 max-w-md text-sm text-slate-500">
            {description}
          </p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="btn-student student-btn-primary"
          >
            {action.label}
          </button>
        )}
      </div>
    </motion.div>
  );
}

