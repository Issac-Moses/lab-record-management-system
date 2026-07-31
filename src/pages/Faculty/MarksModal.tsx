import { Award, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MarksModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (marks: number, feedback: string) => void;
  student: string;
  experiment: string;
}

export default function MarksModal({
  open,
  onClose,
  onSubmit,
  student,
  experiment,
}: MarksModalProps) {
  const [marks, setMarks] = useState<number>(0);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (open) {
      setMarks(0);
      setFeedback("");
    }
  }, [open]);

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
            <div className="flex justify-between items-center mb-4">
              <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                <Award className="h-6 w-6 text-indigo-600" />
                Enter Marks
              </h2>

              <button
                onClick={onClose}
                className="text-slate-400 transition-colors hover:text-rose-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">Student: {student}</p>
              <p className="text-sm text-slate-500">
                Experiment: {experiment}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Marks
                </label>
                <input
                  type="number"
                  value={marks}
                  onChange={(e) => setMarks(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Enter marks"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Feedback
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Optional feedback"
                  rows={3}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                Cancel
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSubmit(marks, feedback)}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500"
              >
                Save Marks
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
