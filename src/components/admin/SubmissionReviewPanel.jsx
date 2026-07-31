import { AnimatePresence, motion } from "framer-motion";

export default function SubmissionReviewPanel({ open, data, onClose, onSave }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="absolute right-0 top-0 h-full w-full max-w-md border-l border-slate-200 bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Submission Review</h3>
            <p className="mt-1 text-sm text-slate-500">{data?.studentName || "Student"} · {data?.experiment || "Experiment"}</p>
            <div className="mt-5 space-y-3">
              <label className="block text-sm text-slate-700">Score</label>
              <input
                defaultValue={data?.score ?? ""}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              />
              <label className="block text-sm text-slate-700">Remarks</label>
              <textarea className="h-32 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={onSave} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500">Save Review</button>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

