import { useState, useCallback, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Play, ChevronDown, Sparkles } from "lucide-react";
import { detectLanguage } from "@/services/languageDetector";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  onLanguageChange?: (language: string) => void;
  onRun?: () => void;
  isRunning?: boolean;
  customInput?: string;
  onCustomInputChange?: (value: string) => void;
}

const LANGUAGES = [
  { id: "python", name: "Python" },
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "java", name: "Java" },
  { id: "cpp", name: "C++" },
  { id: "c", name: "C" },
  { id: "go", name: "Go" },
  { id: "ruby", name: "Ruby" },
  { id: "php", name: "PHP" },
  { id: "sql", name: "SQL" },
  { id: "html", name: "HTML" },
  { id: "css", name: "CSS" },
  { id: "json", name: "JSON" },
  { id: "xml", name: "XML" },
  { id: "bash", name: "Bash" },
];

const MONACO_LANGUAGE_MAP: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
  go: "go",
  ruby: "ruby",
  php: "php",
  sql: "sql",
  html: "html",
  css: "css",
  json: "json",
  xml: "xml",
  bash: "shell",
};

export default function CodeEditor({
  value,
  onChange,
  language = "python",
  onLanguageChange,
  onRun,
  isRunning = false,
  customInput = "",
  onCustomInputChange,
}: CodeEditorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [isAutoDetectEnabled, setIsAutoDetectEnabled] = useState(true);

  const debounceTimerRef = useRef<number | null>(null);

  // Auto-detection logic (debounced 300ms)
  useEffect(() => {
    // If editor is cleared, automatically re-enable auto-detection
    if (!value || value.trim().length === 0) {
      if (!isAutoDetectEnabled) {
        setIsAutoDetectEnabled(true);
      }
      return;
    }

    if (!isAutoDetectEnabled || !onLanguageChange) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      const result = detectLanguage(value, {
        currentLanguage: language,
        threshold: 0.35,
      });

      if (
        result.detectedLanguage &&
        result.detectedLanguage !== language &&
        result.confidence >= 0.35
      ) {
        onLanguageChange(result.detectedLanguage);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, isAutoDetectEnabled, language, onLanguageChange]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      onChange(value || "");
    },
    [onChange]
  );

  const handleLanguageSelect = (langId: string) => {
    // Manual selection pauses auto-detect until cleared or user re-enables
    setIsAutoDetectEnabled(false);
    if (onLanguageChange) {
      onLanguageChange(langId);
    }
    setIsDropdownOpen(false);
  };

  const currentLanguage = LANGUAGES.find((l) => l.id === language) || LANGUAGES[0];
  const displayName = currentLanguage?.name || "Python";
  const monacoLanguage = MONACO_LANGUAGE_MAP[language] || "plaintext";

  const needsInput = /input\(|cin|Scanner|sys\.stdin|readline|readLine|gets/i.test(value);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      {/* TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        {/* Language Selector & Auto-Detect Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 hover:bg-slate-700 transition"
            >
              <span className="font-medium">{displayName}</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageSelect(lang.id)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition ${
                      language === lang.id
                        ? "text-blue-400 bg-slate-700/50"
                        : "text-slate-200"
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto Detect Indicator / Reset Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoDetectEnabled(!isAutoDetectEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
              isAutoDetectEnabled
                ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
                : "border-slate-700 bg-slate-800/80 text-slate-400 hover:bg-slate-700"
            }`}
            title={
              isAutoDetectEnabled
                ? "Auto Language Detection is active"
                : "Auto Detection paused due to manual selection. Click to re-enable."
            }
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>{isAutoDetectEnabled ? "Auto Detect On" : "Auto Detect Off"}</span>
          </button>

          {onCustomInputChange && (
            <button
              type="button"
              onClick={() => setShowInputPanel(!showInputPanel)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
                showInputPanel || customInput.trim()
                  ? "border-indigo-500 bg-indigo-950/60 text-indigo-300"
                  : needsInput
                    ? "border-amber-500/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 animate-pulse"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              <span>{showInputPanel ? "Hide Stdin Input" : "Custom Input (stdin)"}</span>
              {needsInput && !customInput.trim() && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-[10px] text-amber-200 font-semibold">
                  Input Needed
                </span>
              )}
            </button>
          )}
        </div>

        {/* Run Button */}
        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-sm font-medium text-white hover:from-green-700 hover:to-green-600 transition shadow-lg shadow-green-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {isRunning ? "Running..." : "Run Code"}
        </button>
      </div>

      {/* STDIN INPUT PANEL */}
      {showInputPanel && onCustomInputChange && (
        <div className="p-3 bg-slate-900/90 border-b border-slate-800">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Program Input (stdin)
          </label>
          <textarea
            value={customInput}
            onChange={(e) => onCustomInputChange(e.target.value)}
            placeholder="Enter raw values only separated by spaces or lines (e.g. 1 3 or 1\n3). Do NOT include variable names like a=1."
            className="w-full h-20 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono outline-none focus:border-indigo-500 transition"
          />
        </div>
      )}

      {/* MONACO EDITOR */}
      <div className="h-96">
        <Editor
          height="100%"
          language={monacoLanguage}
          value={value}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  );
}

