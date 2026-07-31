import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function PdfPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pdfUrl = searchParams.get("url");

  return (
    <div className="mx-auto min-h-screen max-w-7xl p-6 md:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5 ring-1 ring-blue-200">
            <FileText className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            PDF Preview
          </h1>
        </div>

        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </motion.button>

          {pdfUrl && (
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </motion.a>
          )}
        </div>
      </motion.div>

      {/* Viewer Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            title="PDF Preview"
            className="w-full h-[650px] rounded-xl border-0"
          />
        ) : (
          <div className="flex h-[650px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
            <FileText className="mb-4 w-16 h-16 text-slate-400" />
            <p className="text-lg font-medium text-slate-700">
              No PDF to preview
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Select a submission to view its PDF.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
