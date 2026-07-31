import { useRef, useEffect, useState } from "react";
import {
  Terminal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
  Download,
  Maximize2,
  X,
  FileText,
  Table,
  Cpu,
  Clock,
  HardDrive,
  FileCheck,
} from "lucide-react";
import { ArtifactItem, ExecutionResult } from "@/services/dockerService";

interface OutputPanelProps {
  result?: ExecutionResult | null;
  output?: string;
  error?: string | null;
  isLoading?: boolean;
  executionTime?: number;
  language?: string;
}

export default function OutputPanel({
  result,
  output = "",
  error = null,
  isLoading = false,
  executionTime,
  language = "python",
}: OutputPanelProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const [zoomImage, setZoomImage] = useState<ArtifactItem | null>(null);

  const displayOutput = result?.stdout ?? result?.output ?? output;
  const displayError = result?.error ?? error;
  const isSuccess = result ? result.success : !displayError;
  const duration = result?.executionTime ?? (executionTime ? executionTime / 1000 : 0);
  const memory = result?.memory || "32 MB";
  const exitCode = result?.exitCode ?? (isSuccess ? 0 : 1);
  const lang = result?.language || language;
  const artifacts = result?.artifacts || [];

  const imageArtifacts = artifacts.filter(
    (a) =>
      a.type.startsWith("image/") ||
      /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(a.name)
  );

  const fileArtifacts = artifacts.filter(
    (a) =>
      !a.type.startsWith("image/") &&
      !/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(a.name)
  );

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayOutput, displayError]);

  const handleDownload = (artifact: ArtifactItem) => {
    const link = document.createElement("a");
    link.href = artifact.data || artifact.url;
    link.download = artifact.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Execution Output</span>
          {isSuccess && !isLoading && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Executed (Exit Code {exitCode})
            </span>
          )}
          {!isSuccess && !isLoading && displayError && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-[11px] font-medium text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Failed (Exit Code {exitCode})
            </span>
          )}
        </div>

        {!isLoading && (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              {duration.toFixed(2)}s
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              {memory}
            </span>
            <span className="flex items-center gap-1 font-mono uppercase bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300">
              <Cpu className="w-3 h-3 text-cyan-400" />
              {lang}
            </span>
          </div>
        )}
      </div>

      {/* SECTION 1: CONSOLE OUTPUT */}
      <div
        ref={outputRef}
        className="max-h-60 p-4 font-mono text-sm overflow-y-auto bg-slate-950/90 border-b border-slate-900"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Executing program in isolated container...</span>
          </div>
        ) : displayError ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4" />
              <span>Compilation / Runtime Error</span>
            </div>
            <pre className="text-red-300 whitespace-pre-wrap break-all bg-red-950/40 p-3 rounded-lg border border-red-900/60 leading-relaxed text-xs">
              {displayError}
            </pre>
            {displayError.includes("InputMismatchException") && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200 text-xs">
                💡 <strong>Input Format Tip:</strong> Java <code>Scanner.nextInt()</code> reads raw numbers (e.g. <code>1 3</code> or <code>1\n3</code>). Please remove variable assignments like <code>a=1</code> from your <strong>PROGRAM INPUT (STDIN)</strong> box.
              </div>
            )}
          </div>
        ) : displayOutput ? (
          <div className="space-y-1">
            <pre className="text-slate-200 whitespace-pre-wrap break-all leading-relaxed">
              {displayOutput}
            </pre>
          </div>
        ) : (
          <div className="text-slate-500 py-2">
            Click "Run Code" to execute your program and view stdout logs & visualizations...
          </div>
        )}
      </div>

      {/* SECTION 2: GENERATED GRAPHS & VISUALIZATIONS */}
      {imageArtifacts.length > 0 && (
        <div className="p-4 bg-slate-900/60 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300 uppercase tracking-wider">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span>Generated Visualizations & Graphs ({imageArtifacts.length})</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {imageArtifacts.map((art, idx) => (
              <div
                key={idx}
                className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-indigo-500/50 transition shadow-lg"
              >
                <div className="aspect-video bg-slate-950 flex items-center justify-center overflow-hidden p-2">
                  <img
                    src={art.data || art.url}
                    alt={art.name}
                    className="max-h-full max-w-full object-contain rounded"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-900/90 border-t border-slate-800/80">
                  <div className="truncate pr-2">
                    <p className="text-xs font-medium text-slate-200 truncate">{art.name}</p>
                    <p className="text-[10px] text-slate-400">{formatBytes(art.size)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setZoomImage(art)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                      title="Inspect Fullscreen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(art)}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                      title="Download Image"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: GENERATED FILES & DATA ARTIFACTS */}
      {fileArtifacts.length > 0 && (
        <div className="p-4 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-emerald-300 uppercase tracking-wider">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>Generated File Artifacts ({fileArtifacts.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fileArtifacts.map((art, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-emerald-500/40 transition"
              >
                <div className="flex items-center gap-3 truncate pr-2">
                  <div className="p-2 bg-slate-800 rounded-lg text-emerald-400">
                    {art.name.endsWith(".csv") ? (
                      <Table className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-medium text-slate-200 truncate">{art.name}</p>
                    <p className="text-[10px] text-slate-400">{formatBytes(art.size)}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownload(art)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FULLSCREEN IMAGE ZOOM MODAL */}
      {zoomImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <span className="text-sm font-semibold text-slate-200">{zoomImage.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(zoomImage)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setZoomImage(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-center overflow-auto max-h-[80vh]">
              <img
                src={zoomImage.data || zoomImage.url}
                alt={zoomImage.name}
                className="max-h-[75vh] object-contain rounded-lg shadow-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
