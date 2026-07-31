import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorScreenProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorScreen({
  message = "Something went wrong",
  onRetry,
}: ErrorScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-16"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-200 bg-amber-50">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-amber-700">{message}</h3>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-all hover:bg-slate-50 hover:text-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </motion.div>
  );
}

