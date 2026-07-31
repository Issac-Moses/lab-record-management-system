import { motion } from "framer-motion";
import { FileText, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ViewRecord() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-600/10 text-blue-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">View Lab Record</h1>
              <p className="text-sm text-slate-400">
                Review submitted experiment records
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-slate-400">
            Select a record to view full experiment details.
          </p>

          <div className="mt-6 grid md:grid-cols-3 gap-4">
            {/* Placeholder Cards */}
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                whileHover={{ y: -6 }}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-left cursor-pointer"
              >
                <h3 className="font-semibold mb-1">Experiment {i}</h3>
                <p className="text-xs text-slate-400">
                  Click to view full record details
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
