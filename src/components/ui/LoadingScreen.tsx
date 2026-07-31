import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface LoadingScreenProps {
  message?: string;
  /** Override wrapper (e.g. min-h-[40vh] for embedded use). */
  className?: string;
}

export default function LoadingScreen({
  message = "Loading...",
  className = "min-h-screen bg-slate-950 flex flex-col items-center justify-center",
}: LoadingScreenProps) {
  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-10 h-10 text-student-accent" />
        </motion.div>
        <p className="text-gray-400 text-sm font-medium">{message}</p>
      </motion.div>
    </div>
  );
}

