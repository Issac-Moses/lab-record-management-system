import { CheckCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ApproveModalProps {
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
  student: string;
  experiment: string;
}

export default function ApproveModal({
  open,
  onClose,
  onApprove,
  student,
  experiment,
}: ApproveModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h2 className="mb-2 text-2xl font-bold text-slate-900">
              Approve Submission
            </h2>

            <p className="mb-4 text-slate-500">
              Are you sure you want to approve this experiment?
            </p>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">Student: {student}</p>
              <p className="text-sm text-slate-500">
                Experiment: {experiment}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onApprove}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2 font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:from-emerald-500 hover:to-emerald-600"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
