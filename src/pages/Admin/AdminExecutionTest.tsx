import { useState } from "react";
import AdminShell from "@/layouts/AdminShell";
import { CheckCircle2, XCircle, Clock, RefreshCw, Play } from "lucide-react";

const BACKEND = "http://localhost:7001";

type TestStatus = "idle" | "running" | "pass" | "fail";

type LangResult = {
  language: string;
  status: TestStatus;
  errorCategory: string | null;
  exitCode: number | null;
  executionTime: number | null;
  stdout: string;
  stderr: string;
  error: string;
  isTimeout: boolean;
  isOOM: boolean;
};

const TESTS = [
  { language: "python",     label: "Python 3",          code: `print("hello from python")`,                                                                                    expectOutput: "hello from python" },
  { language: "java",       label: "Java 17",            code: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("hello from java");\n  }\n}`, expectOutput: "hello from java" },
  { language: "c",          label: "C (GCC)",            code: `#include <stdio.h>\nint main() { printf("hello from c\\n"); return 0; }`,                                        expectOutput: "hello from c" },
  { language: "cpp",        label: "C++ (G++)",          code: `#include <iostream>\nint main() { std::cout << "hello from cpp" << std::endl; return 0; }`,                       expectOutput: "hello from cpp" },
  { language: "javascript", label: "JavaScript (Node)",  code: `console.log("hello from javascript");`,                                                                          expectOutput: "hello from javascript" },
  { language: "go",         label: "Go 1.22",            code: `package main\nimport "fmt"\nfunc main() { fmt.Println("hello from go") }`,                                        expectOutput: "hello from go" },
  { language: "ruby",       label: "Ruby 3.3",           code: `puts "hello from ruby"`,                                                                                         expectOutput: "hello from ruby" },
  { language: "php",        label: "PHP 8.3",            code: `<?php echo "hello from php" . PHP_EOL;`,                                                                         expectOutput: "hello from php" },
];

const CAT_LABEL: Record<string, string> = {
  compilation: "COMPILATION ERROR",
  runtime:     "RUNTIME ERROR",
  timeout:     "TIMEOUT",
  memory:      "MEMORY EXCEEDED",
  docker:      "DOCKER FAILURE",
};
const CAT_COLOR: Record<string, string> = {
  compilation: "bg-orange-50 text-orange-700 border-orange-200",
  runtime:     "bg-red-50 text-red-700 border-red-200",
  timeout:     "bg-amber-50 text-amber-700 border-amber-200",
  memory:      "bg-purple-50 text-purple-700 border-purple-200",
  docker:      "bg-rose-50 text-rose-700 border-rose-200",
};

function StatusBadge({ status, errorCategory }: { status: TestStatus; errorCategory: string | null }) {
  if (status === "idle")    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">IDLE</span>;
  if (status === "running") return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 animate-pulse"><RefreshCw className="h-3 w-3 animate-spin" /> RUNNING</span>;
  if (status === "pass")    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3" /> PASS</span>;
  const cat = errorCategory || "runtime";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border ${CAT_COLOR[cat] || CAT_COLOR.runtime}`}>
      <XCircle className="h-3 w-3" /> {CAT_LABEL[cat] || "FAIL"}
    </span>
  );
}

export default function AdminExecutionTest() {
  const [results, setResults] = useState<LangResult[]>(
    TESTS.map((t) => ({ language: t.language, status: "idle" as TestStatus, errorCategory: null, exitCode: null, executionTime: null, stdout: "", stderr: "", error: "", isTimeout: false, isOOM: false }))
  );
  const [running, setRunning] = useState(false);

  async function runSingle(idx: number) {
    const test = TESTS[idx];
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, status: "running" as TestStatus, stdout: "", stderr: "", error: "", errorCategory: null } : r));
    try {
      const resp = await fetch(`${BACKEND}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: test.language, code: test.code, input: "" }),
      });
      const data = await resp.json();
      const passed = data.success && String(data.stdout || data.output || "").trim().includes(test.expectOutput);
      setResults((prev) => prev.map((r, i) => i === idx ? {
        ...r,
        status: (passed ? "pass" : "fail") as TestStatus,
        errorCategory: data.errorCategory || (data.success ? null : "runtime"),
        exitCode: data.exitCode ?? null,
        executionTime: data.executionTime ?? null,
        stdout: String(data.stdout || data.output || "").trim(),
        stderr: String(data.stderr || "").trim(),
        error: String(data.error || "").trim(),
        isTimeout: !!data.isTimeout,
        isOOM: !!data.isOOM,
      } : r));
    } catch (err) {
      setResults((prev) => prev.map((r, i) => i === idx ? {
        ...r, status: "fail" as TestStatus, errorCategory: "docker", exitCode: -1, executionTime: null,
        stdout: "", stderr: "", error: err instanceof Error ? err.message : "Network error — backend unreachable",
        isTimeout: false, isOOM: false,
      } : r));
    }
  }

  async function runAll() {
    setRunning(true);
    for (let i = 0; i < TESTS.length; i++) { await runSingle(i); }
    setRunning(false);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;

  return (
    <AdminShell title="Execution Engine Test">
      <div className="col-span-12 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Execution Engine Compatibility Test</h1>
            <p className="mt-1 text-sm text-slate-500">Runs a minimal "hello world" in each supported language against the live Docker backend. Verifies stdout, exit code, and error classification.</p>
          </div>
          <button onClick={runAll} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running Tests…" : "Run All Tests"}
          </button>
        </div>

        {/* Summary */}
        {(passed + failed) > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total",  value: TESTS.length, cls: "border-slate-200 bg-white text-slate-900" },
              { label: "Passed", value: passed,        cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
              { label: "Failed", value: failed,        cls: "border-red-200 bg-red-50 text-red-700" },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border p-4 text-center shadow-sm ${s.cls}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-medium uppercase tracking-wider opacity-70">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Results table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3">Language</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Exit</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3 w-1/3">Output / Error</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r, idx) => (
                <tr key={r.language} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-semibold text-slate-800">{TESTS[idx].label}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">{r.language}</span>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={r.status} errorCategory={r.errorCategory} /></td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">
                    {r.exitCode !== null ? r.exitCode : "—"}
                    {r.isTimeout && <span className="ml-1 font-semibold text-amber-600">(TLE)</span>}
                    {r.isOOM    && <span className="ml-1 font-semibold text-purple-600">(OOM)</span>}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">{r.executionTime !== null ? `${r.executionTime}s` : "—"}</td>
                  <td className="px-5 py-4">
                    {r.status === "pass"    && <pre className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1 max-h-16 overflow-auto">{r.stdout}</pre>}
                    {r.status === "fail"    && <pre className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 max-h-24 overflow-auto whitespace-pre-wrap">{r.error || r.stderr || r.stdout || "Unknown failure"}</pre>}
                    {r.status === "idle"    && <span className="text-xs text-slate-400">Not run yet</span>}
                    {r.status === "running" && <span className="flex items-center gap-1 text-xs text-blue-500"><Clock className="h-3 w-3 animate-spin" />Executing…</span>}
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => runSingle(idx)} disabled={r.status === "running" || running}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      <Play className="h-3 w-3" /> Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Error Category Legend</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 text-xs">
            {[
              { cat: "COMPILATION ERROR", color: CAT_COLOR.compilation, desc: "Compiler rejected the source" },
              { cat: "RUNTIME ERROR",     color: CAT_COLOR.runtime,     desc: "Program crashed at runtime" },
              { cat: "TIMEOUT",           color: CAT_COLOR.timeout,     desc: "Exceeded 12-second time limit" },
              { cat: "MEMORY EXCEEDED",   color: CAT_COLOR.memory,      desc: "OOM-killed (512 MB limit)" },
              { cat: "DOCKER FAILURE",    color: CAT_COLOR.docker,      desc: "Docker daemon / image error" },
            ].map((item) => (
              <div key={item.cat} className={`rounded-lg border px-3 py-2 ${item.color}`}>
                <p className="font-bold">{item.cat}</p>
                <p className="mt-0.5 opacity-80">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
