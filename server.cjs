process.on('uncaughtException', (err) => {
  console.error('=================================================================');
  console.error('FATAL UNCAUGHT EXCEPTION DURING STARTUP:');
  console.error(err);
  console.error(err.stack);
  console.error('=================================================================');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('=================================================================');
  console.error('FATAL UNHANDLED REJECTION DURING STARTUP:');
  console.error(err);
  if (err && err.stack) console.error(err.stack);
  console.error('=================================================================');
  process.exit(1);
});

const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const manualRoutes = require("./routes/manualRoutes.cjs");
const gamificationRoutes = require("./routes/gamificationRoutes.cjs");
const adminRoutes = require("./routes/adminRoutes.cjs");
const aiRoutes = require("./routes/aiRoutes.cjs");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("./middleware/authMiddleware.cjs");

const app = express();
const PORT = Number(process.env.RUNNER_PORT || process.env.PORT || 7001);
if (String(process.env.TRUST_PROXY || "").toLowerCase() === "1") {
  app.set("trust proxy", 1);
}
const jobsDirFromEnv = process.env.JOBS_DIR || "./jobs";
const JOBS_DIR = path.isAbsolute(jobsDirFromEnv)
  ? jobsDirFromEnv
  : path.resolve(process.cwd(), jobsDirFromEnv);

/**
 * `docker run` timeout (ms). Default 3 minutes so first-time `docker pull` of language images
 * does not fail (10s was too short for PHP/Ruby/etc. on slow networks).
 */
const DOCKER_RUN_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.DOCKER_RUN_TIMEOUT_MS || 180000)
);

/**
 * Code execution: Docker (local/VPS) or cloud APIs (Piston / Judge0 — no Docker on host).
 * - docker: only shell `docker run` (needs Docker on host)
 * - piston: only Piston API
 * - judge0: only Judge0 CE API
 * - auto: try Docker first; if `docker` is missing, use cloud chain (default)
 */
const CODE_RUNNER = String(process.env.CODE_RUNNER || "auto").toLowerCase();
const PISTON_API_URL =
  String(process.env.PISTON_API_URL || "https://emkc.org/api/v2/piston/execute").replace(/\/$/, "");
/** Judge0 CE public instance — free tier; self-host or RapidAPI for production load */
const JUDGE0_API_URL = String(process.env.JUDGE0_API_URL || "https://ce.judge0.com").replace(/\/$/, "");

/** Piston language id, runtime version, and main filename (engineer-man/piston). */
const PISTON_LANG = {
  python: { language: "python", version: "3.10.0", file: "main.py" },
  javascript: { language: "javascript", version: "18.15.0", file: "main.js" },
  java: { language: "java", version: "15.0.2", file: "Main.java" },
  go: { language: "go", version: "1.16.2", file: "main.go" },
  ruby: { language: "ruby", version: "3.0.1", file: "main.rb" },
  php: { language: "php", version: "8.0.2", file: "main.php" },
  c: { language: "c", version: "9.2.0", file: "main.c" },
  cpp: { language: "cpp", version: "9.2.0", file: "main.cpp" },
};

/** Judge0 CE language_id (see https://ce.judge0.com/languages — may change with CE updates) */
const JUDGE0_LANG = {
  python: 71,
  javascript: 63,
  java: 62,
  c: 50,
  cpp: 54,
  go: 60,
  ruby: 72,
  php: 68,
};

function dockerMissingError(stderr, err) {
  const t = `${String(stderr || "")} ${String(err?.message || "")}`.toLowerCase();
  return t.includes("docker") && (t.includes("not found") || t.includes("no such file"));
}

/**
 * Run code via public Piston API (no Docker on server). Rate limits may apply.
 */
async function runWithPiston(language, code) {
  const lang = String(language || "").toLowerCase();
  if (lang === "sql") {
    throw new Error("SQL runner needs Docker; run locally or use a VPS with Docker.");
  }
  const cfg = PISTON_LANG[lang];
  if (!cfg) {
    throw new Error(`Unsupported language for cloud runner: ${lang}`);
  }
  if (typeof fetch !== "function") {
    throw new Error("Node 18+ required for Piston runner (global fetch).");
  }
  const res = await fetch(PISTON_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language: cfg.language,
      version: cfg.version,
      files: [{ name: cfg.file, content: String(code || "") }],
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Piston HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : `Piston error (${res.status})`
    );
  }
  const run = data.run;
  if (!run) {
    throw new Error("Invalid Piston response (no run object)");
  }
  const stdout = String(run.stdout ?? "");
  const stderr = String(run.stderr ?? "");
  const exitCode = run.code;
  const failed = exitCode !== 0 && exitCode !== null && exitCode !== undefined;
  if (failed) {
    return {
      ok: false,
      stdout,
      stderr: stderr || `Exit code ${exitCode}`,
    };
  }
  return { ok: true, stdout, stderr };
}

/**
 * Judge0 CE — second free option when Piston is down / rate-limited (no API key on public CE).
 */
async function runWithJudge0(language, code, input = "") {
  const lang = String(language || "").toLowerCase();
  if (lang === "sql") {
    throw new Error("SQL runner needs Docker; run locally or use a VPS with Docker.");
  }
  const languageId = JUDGE0_LANG[lang];
  if (!languageId) {
    throw new Error(`Judge0: unsupported language: ${lang}`);
  }
  if (typeof fetch !== "function") {
    throw new Error("Node 18+ required for Judge0 runner (global fetch).");
  }
  const stdinVal = input != null && String(input).length > 0 ? String(input) : "0\n";
  const url = `${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: String(code || ""),
      language_id: languageId,
      stdin: stdinVal,
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Judge0 HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Judge0 error (${res.status})`
    );
  }
  const stdout = data.stdout != null ? String(data.stdout) : "";
  const stderrRun = data.stderr != null ? String(data.stderr) : "";
  const compileOut = data.compile_output != null ? String(data.compile_output) : "";
  const statusId = data.status && typeof data.status.id === "number" ? data.status.id : null;
  /** 3 = Accepted in Judge0 CE */
  const accepted = statusId === 3;
  const combinedErr = [compileOut, stderrRun].filter(Boolean).join("\n").trim();

  if (compileOut && !accepted) {
    return {
      ok: false,
      stdout: "",
      stderr: combinedErr || data.status?.description || "Compilation failed",
    };
  }
  if (!accepted && statusId != null && statusId !== 3) {
    return {
      ok: false,
      stdout,
      stderr: combinedErr || data.status?.description || `Status ${statusId}`,
    };
  }
  return { ok: true, stdout, stderr: combinedErr };
}

/**
 * Try Piston first; if it throws (network / HTTP / rate limit), try Judge0 CE.
 * If Piston returns ok:false for user code, that result is returned (no second run).
 */
async function runWithCloudChain(language, code, input = "") {
  try {
    return await runWithPiston(language, code, input);
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    console.warn("[run] Piston failed, trying Judge0:", msg);
    try {
      return await runWithJudge0(language, code, input);
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`Cloud runners failed — Piston: ${msg} | Judge0: ${msg2}`);
    }
  }
}

function normalizeOrigin(origin) {
  return typeof origin === "string" ? origin.trim().replace(/\/$/, "") : "";
}

/** True for common local dev origins (Vite, etc.) — avoid brittle regex on ports. */
function isLocalDevOrigin(origin) {
  const o = normalizeOrigin(origin).toLowerCase();
  if (!o) return false;
  return (
    o.startsWith("http://localhost:") ||
    o.startsWith("https://localhost:") ||
    o === "http://localhost" ||
    o === "https://localhost" ||
    o.startsWith("http://127.0.0.1:") ||
    o.startsWith("https://127.0.0.1:") ||
    o.startsWith("http://[::1]:") ||
    o.startsWith("https://[::1]:")
  );
}

/** Comma-separated origins for production (e.g. https://app.vercel.app). Localhost always allowed. */
function parseAllowedOrigins() {
  const explicit = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  /** On Render, forgetting CORS_ORIGINS breaks Vercel in the browser; default the known production UI. */
  const renderDefault =
    explicit.length === 0 && String(process.env.RENDER || "").toLowerCase() === "true"
      ? ["https://lab-record-system.vercel.app"]
      : [];
  return new Set([...explicit, ...renderDefault]);
}

const corsAllowedSet = parseAllowedOrigins();
/** Vercel preview deploys use unique *.vercel.app hosts; listing each in CORS_ORIGINS is impractical. */
function isVercelAppOrigin(origin) {
  return typeof origin === "string" && /^https:\/\/[^/]+\.vercel\.app$/i.test(origin.trim());
}
/**
 * Allow any https://*.vercel.app by default so Preview deployments work without setting RENDER=true.
 * Set CORS_ALLOW_VERCEL_PREVIEWS=false to disable (tighten CORS to CORS_ORIGINS only).
 */
const allowVercelPreviewOrigins = process.env.CORS_ALLOW_VERCEL_PREVIEWS !== "false";

if (String(process.env.RENDER || "").toLowerCase() === "true" || allowVercelPreviewOrigins) {
  console.log(
    "[cors] allowed origins:",
    [...corsAllowedSet].join(", ") || "(none — only same-origin / no Origin header)",
    "| set CORS_ORIGINS to add more (comma-separated)",
    "| vercel.app previews:",
    allowVercelPreviewOrigins ? "allowed (set CORS_ALLOW_VERCEL_PREVIEWS=false to disable)" : "off"
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (isLocalDevOrigin(normalized)) {
        callback(null, true);
        return;
      }
      if (corsAllowedSet.has(normalized)) {
        callback(null, true);
        return;
      }
      if (allowVercelPreviewOrigins && isVercelAppOrigin(normalized)) {
        callback(null, true);
        return;
      }
      if (process.env.CORS_ALLOW_ALL === "true") {
        callback(null, true);
        return;
      }
      console.warn("[cors] blocked origin:", origin, "| set CORS_ORIGINS or FRONTEND_URL in .env");
      callback(null, false);
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Department-Scope"],
    optionsSuccessStatus: 204,
  })
);
const jsonBodyLimit = String(process.env.JSON_BODY_LIMIT || "1mb");
app.use(express.json({ limit: jsonBodyLimit }));

const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 5000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = String(req.ip || "").toLowerCase();
    return ip === "127.0.0.1" || ip === "::1" || ip.includes("127.0.0.1") || ip === "localhost";
  },
});

const runLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_RUN_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_RUN_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
});

const aiEvaluateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_AI_WINDOW_MS || 60 * 1000),
  max: Number(process.env.RATE_LIMIT_AI_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use("/api/manual", manualRoutes);
app.use("/api/gamification", gamificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);

app.post("/api/ai/local-evaluate", aiEvaluateLimiter, requireAuth, async (req, res) => {
  const ollamaBaseUrl = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const ollamaModel = String(process.env.OLLAMA_MODEL || "llama3.2:3b").trim();
  const {
    aim = "",
    procedure = "",
    program = "",
    output = "",
    result = "",
    experimentTitle = "",
  } = req.body || {};

  const prompt = [
    "You are a strict lab-record evaluator.",
    "Return ONLY valid JSON with keys:",
    "predicted_score (0-100 number), confidence (0-100 number), status (Good|Fair|Needs Improvement), breakdown (object with algorithm, program, output, result as 0-100 numbers).",
    "No markdown, no explanation text.",
    "",
    "Evaluation rubric:",
    "- algorithm: logical steps and clarity of procedure",
    "- program: correctness signals, structure, and implementation detail",
    "- output: evidence and relevance of output",
    "- result: conclusion quality and interpretation",
    "",
    `Experiment: ${String(experimentTitle || "").trim()}`,
    "Submission:",
    `AIM: ${String(aim || "").trim()}`,
    `PROCEDURE: ${String(procedure || "").trim()}`,
    `PROGRAM: ${String(program || "").trim()}`,
    `OUTPUT: ${String(output || "").trim()}`,
    `RESULT: ${String(result || "").trim()}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return res.status(502).json({
        success: false,
        error: `Ollama request failed (${response.status}). ${text.slice(0, 200)}`,
      });
    }

    const payload = await response.json();
    const raw = String(payload?.response || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Ollama returned non-JSON response.",
      });
    }

    const predictedScore = Math.max(0, Math.min(100, Number(parsed?.predicted_score || 0)));
    const confidence = Math.max(0, Math.min(100, Number(parsed?.confidence || 0)));
    const status = String(parsed?.status || "Needs Improvement").trim() || "Needs Improvement";
    const breakdownRaw = parsed?.breakdown && typeof parsed.breakdown === "object" ? parsed.breakdown : {};
    const breakdown = {
      algorithm: Math.max(0, Math.min(100, Number(breakdownRaw.algorithm || 0))),
      program: Math.max(0, Math.min(100, Number(breakdownRaw.program || 0))),
      output: Math.max(0, Math.min(100, Number(breakdownRaw.output || 0))),
      result: Math.max(0, Math.min(100, Number(breakdownRaw.result || 0))),
    };

    return res.json({
      success: true,
      predicted_score: predictedScore,
      confidence,
      status,
      breakdown,
      model: ollamaModel,
    });
  } catch (error) {
    const msg = String(error?.message || error || "");
    return res.status(500).json({
      success: false,
      error:
        msg.includes("abort") || msg.includes("timed out")
          ? "Local model request timed out."
          : `Local model evaluation failed: ${msg}`,
    });
  }
});

function listRoutes(app) {
  console.log("\n=== REGISTERED EXPRESS ROUTES ===");
  const rootStack =
    (Array.isArray(app?._router?.stack) && app._router.stack) ||
    (Array.isArray(app?.router?.stack) && app.router.stack) ||
    [];

  if (!rootStack.length) {
    console.log("(route stack unavailable in current Express runtime)");
    console.log("=================================\n");
    return;
  }

  rootStack.forEach((middleware) => {
    if (middleware?.route?.methods && middleware?.route?.path) {
      const method = Object.keys(middleware.route.methods)[0]?.toUpperCase() || "USE";
      console.log(method, middleware.route.path);
      return;
    }

    if (middleware?.name === "router" && Array.isArray(middleware?.handle?.stack)) {
      middleware.handle.stack.forEach((handler) => {
        if (handler?.route?.methods && handler?.route?.path) {
          const method = Object.keys(handler.route.methods)[0]?.toUpperCase() || "USE";
          console.log(method, handler.route.path);
        }
      });
    }
  });

  console.log("=================================\n");
}

// Ensure jobs folder exists
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

app.get("/", (req, res) => {
  res.json({ status: "Runner OK" });
});

app.post("/run", runLimiter, async (req, res) => {
  const { language, code, input } = req.body;

  if (!language || !code) {
    return res.status(400).json({ error: "language and code required" });
  }

  const maxCodeChars = Math.max(1000, Number(process.env.RUN_MAX_CODE_CHARS || 120000));
  if (String(code).length > maxCodeChars) {
    return res.status(413).json({
      error: `code exceeds maximum length (${maxCodeChars} characters)`,
    });
  }

  /** Judge0 CE only (free public API, no Docker). */
  if (CODE_RUNNER === "judge0") {
    try {
      const r = await runWithJudge0(language, code);
      return res.json({
        success: r.ok,
        output: r.stdout || "",
        error: r.ok ? r.stderr || "" : r.stderr || "Execution failed",
      });
    } catch (e) {
      return res.json({
        success: false,
        output: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Piston (+ Judge0 on Piston throw) — for hosts without Docker (e.g. Render Node). */
  if (CODE_RUNNER === "piston") {
    try {
      const r = await runWithCloudChain(language, code);
      return res.json({
        success: r.ok,
        output: r.stdout || "",
        error: r.ok ? r.stderr || "" : r.stderr || "Execution failed",
      });
    } catch (e) {
      return res.json({
        success: false,
        output: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const jobId = Date.now().toString();
  const jobDir = path.join(JOBS_DIR, jobId);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    let fileName, image, cmd;

    fs.writeFileSync(
      path.join(jobDir, "input.txt"),
      input != null && String(input).length > 0 ? String(input) : "0\n"
    );

    const inputRedir = " < /code/input.txt";

    switch (language) {
      case "python":
        fileName = "main.py";
        image = "lab-python-ml:latest";
        cmd = `sh -c 'python /code/main.py${inputRedir}'`;
        break;

      case "javascript":
        fileName = "main.js";
        image = "node:18";
        cmd = `sh -c 'node /code/main.js${inputRedir}'`;
        break;

      case "c":
        fileName = "main.c";
        image = "gcc";
        cmd = `sh -c 'gcc -O2 /code/main.c -o /code/main -lm && /code/main${inputRedir}'`;
        break;

      case "cpp":
        fileName = "main.cpp";
        image = "gcc";
        cmd = `sh -c 'g++ -O2 -std=c++17 /code/main.cpp -o /code/main -lm && /code/main${inputRedir}'`;
        break;

      case "java": {
        const publicClassMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
        const anyClassMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
        const className = publicClassMatch
          ? publicClassMatch[1]
          : anyClassMatch
            ? anyClassMatch[1]
            : "Main";
        fileName = `${className}.java`;
        image = "eclipse-temurin:17";
        cmd = `sh -c 'javac /code/*.java && java -cp /code ${className}${inputRedir}'`;
        break;
      }

      case "go":
        fileName = "main.go";
        image = "golang:1.22-alpine";
        cmd = `sh -c 'go run /code/main.go${inputRedir}'`;
        break;

      case "ruby":
        fileName = "main.rb";
        image = "ruby:3.3";
        cmd = `sh -c 'ruby /code/main.rb${inputRedir}'`;
        break;

      case "php":
        fileName = "main.php";
        image = "php:8.3-cli-alpine";
        // Set PHP memory_limit to 256M (default 128M is too low for many lab programs)
        // and display_errors=On so fatal errors always appear on stderr.
        cmd = `sh -c 'php -d memory_limit=256M -d display_errors=On -d display_startup_errors=On /code/main.php${inputRedir} 2>&1'`;
        break;

      case "sql":
        fileName = "main.sql";
        image = "python:3.10";
        cmd = "python /code/run_sql.py";
        break;

      default:
        return res.status(400).json({ error: "Unsupported language" });
    }

    fs.writeFileSync(path.join(jobDir, fileName), code);
    if (language === "sql") {
      fs.writeFileSync(
        path.join(jobDir, "run_sql.py"),
        `import pathlib
import sqlite3
import sys

sql = pathlib.Path("/code/main.sql").read_text(encoding="utf-8")
conn = sqlite3.connect(":memory:")
cursor = conn.cursor()
output_lines = []

for statement in [part.strip() for part in sql.split(";") if part.strip()]:
  try:
    cursor.execute(statement)
    if statement.lower().startswith("select"):
      rows = cursor.fetchall()
      for row in rows:
        output_lines.append(" | ".join("" if item is None else str(item) for item in row))
    else:
      conn.commit()
  except Exception as error:
    print(f"SQL error: {error}", file=sys.stderr)
    sys.exit(1)

if output_lines:
  print("\\n".join(output_lines))
`
      );
    }

    const startTime = Date.now();
    const containerName = `runner-${jobId}`;
    const dockerCmd = `
docker run --rm \
--name ${containerName} \
--memory=512m \
--memory-swap=512m \
--cpus=1.0 \
--pids-limit=64 \
--network=none \
-w /code \
-v "${jobDir}":/code \
${image} \
${cmd}
`;

    exec(dockerCmd, { timeout: 12000, maxBuffer: 10 * 1024 * 1024, killSignal: "SIGKILL" }, async (err, stdout, stderr) => {
      const executionTime = Math.round((Date.now() - startTime) / 10) / 100;

      // ─── Accurate error classification ─────────────────────────────────────────
      // err.killed = true means Node's exec() timeout fired (we set timeout:12000ms)
      // exit code 137 = SIGKILL — could be Docker OOM-killer OR Node timeout SIGKILL
      // We distinguish them by checking err.killed first (Node timeout) then exit 137 (OOM)
      const isNodeTimeout = !!(err && err.killed);
      const isOOM = !isNodeTimeout && !!(err && err.code === 137);
      // Docker's own timeout (signal SIGTERM then 10s SIGKILL) shows as 124 or 143
      const isDockerTimeout = !!(err && (err.code === 124 || err.code === 143));
      const isTimeout = isNodeTimeout || isDockerTimeout;

      // Force kill container if timed out / orphaned
      if (err) {
        exec(`docker rm -f ${containerName}`, () => {});
      }

      // ─── Always preserve real stdout + stderr ──────────────────────────────────
      // Node's exec() puts real output in stdout/stderr args, NOT in err.message.
      // err.message is always just "Command failed: docker run ..."
      // Never return err.message as the error shown to students.
      const realStdout = String(stdout || "").trim();
      const realStderr = String(stderr || "").trim();

      // Combined output for languages that merge stdout+stderr (e.g. PHP with 2>&1)
      const combinedOutput = realStdout || realStderr;

      // ─── Language-specific error classification ────────────────────────────────
      function classifyError(lang, exitCode, outText, errText) {
        const out = String(outText || "").toLowerCase();
        const er  = String(errText || "").toLowerCase();
        const combined = out + " " + er;

        if (isTimeout)  return { category: "timeout",  userMessage: "Program exceeded the time limit (12s)." };
        if (isOOM)      return { category: "memory",   userMessage: "Program exceeded the memory limit (512 MB)." };

        // Compilation errors
        if (lang === "java" && combined.includes("error:"))          return { category: "compilation", userMessage: errText || outText };
        if (lang === "c"   && combined.includes("error:"))           return { category: "compilation", userMessage: errText || outText };
        if (lang === "cpp" && combined.includes("error:"))           return { category: "compilation", userMessage: errText || outText };
        if (lang === "go"  && combined.includes("syntax error"))     return { category: "compilation", userMessage: errText || outText };
        if (lang === "php" && combined.includes("parse error"))      return { category: "compilation", userMessage: errText || outText };
        if (lang === "php" && combined.includes("fatal error"))      return { category: "runtime",     userMessage: errText || outText };
        if (lang === "php" && combined.includes("allowed memory"))   return { category: "memory",     userMessage: "PHP: " + (errText || outText) };
        if (lang === "ruby" && combined.includes("syntaxerror"))     return { category: "compilation", userMessage: errText };
        if (lang === "python" && combined.includes("syntaxerror"))   return { category: "compilation", userMessage: errText };

        // Docker-level failure (image not found, daemon error)
        if (combined.includes("unable to find image") || combined.includes("docker daemon") ||
            combined.includes("no such image")) {
          return { category: "docker", userMessage: "Execution environment error. Please contact the administrator." };
        }

        // Generic runtime error — use the real output, not err.message
        const displayError = errText || outText || `Process exited with code ${exitCode}`;
        return { category: "runtime", userMessage: displayError };
      }

      // ─── Collect generated artifact files ─────────────────────────────────────
      const artifacts = [];
      const artifactDir = path.join(__dirname, "jobs", "artifacts", jobId);

      try {
        if (fs.existsSync(jobDir)) {
          const files = fs.readdirSync(jobDir);
          const ignoredFiles = new Set([
            fileName, "main", "main.exe", "main.py", "main.c", "main.cpp",
            "main.js", "main.go", "main.rb", "main.php", "main.sql",
            "run_sql.py", "input.txt",
          ]);

          const validExtensions = new Set([
            ".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp",
            ".pdf", ".csv", ".txt", ".json", ".xml", ".html"
          ]);

          const collected = files.filter((f) => {
            if (ignoredFiles.has(f)) return false;
            if (f.endsWith(".class") || f.endsWith(".o")) return false;
            const ext = path.extname(f).toLowerCase();
            return validExtensions.has(ext);
          });

          if (collected.length > 0) {
            fs.mkdirSync(artifactDir, { recursive: true });
            for (const f of collected) {
              const srcPath = path.join(jobDir, f);
              const destPath = path.join(artifactDir, f);
              fs.copyFileSync(srcPath, destPath);

              const stat = fs.statSync(destPath);
              const ext = path.extname(f).toLowerCase();

              let mimeType = "application/octet-stream";
              if (ext === ".png")  mimeType = "image/png";
              else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
              else if (ext === ".svg")  mimeType = "image/svg+xml";
              else if (ext === ".gif")  mimeType = "image/gif";
              else if (ext === ".pdf")  mimeType = "application/pdf";
              else if (ext === ".csv")  mimeType = "text/csv";
              else if (ext === ".txt")  mimeType = "text/plain";
              else if (ext === ".json") mimeType = "application/json";

              const fileBuffer = fs.readFileSync(destPath);
              const base64Data = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

              artifacts.push({
                name: f,
                size: stat.size,
                type: mimeType,
                url: `/api/run/files/${jobId}/${encodeURIComponent(f)}`,
                data: base64Data,
              });
            }
          }
        }
      } catch (scanErr) {
        console.error("[run] Error scanning artifacts:", scanErr);
      }

      fs.rmSync(jobDir, { recursive: true, force: true });

      const tryPiston =
        (CODE_RUNNER === "auto" || CODE_RUNNER === "") &&
        err &&
        dockerMissingError(stderr, err);

      if (tryPiston) {
        console.warn("[run] Docker unavailable, using Piston → Judge0 fallback for language=", language);
        try {
          const r = await runWithCloudChain(language, code);
          return res.json({
            success: r.ok,
            output: r.stdout || "",
            stdout: r.stdout || "",
            stderr: r.stderr || "",
            error: r.ok ? r.stderr || "" : r.stderr || "Execution failed",
            exitCode: r.ok ? 0 : 1,
            signal: null,
            isTimeout: false,
            isOOM: false,
            errorCategory: r.ok ? null : "runtime",
            executionTime,
            memory: "16 MB",
            language,
            artifacts: [],
          });
        } catch (e) {
          return res.json({
            success: false,
            output: "",
            stdout: "",
            stderr: e instanceof Error ? e.message : String(e),
            error: e instanceof Error ? e.message : String(e),
            exitCode: 1,
            signal: null,
            isTimeout: false,
            isOOM: false,
            errorCategory: "docker",
            executionTime,
            memory: "0 MB",
            language,
            artifacts: [],
          });
        }
      }

      if (err) {
        const exitCode = typeof err.code === "number" ? err.code : 1;
        const { category, userMessage } = classifyError(language, exitCode, realStdout, realStderr);

        console.error(`[run] ${language} exit=${exitCode} timeout=${isTimeout} oom=${isOOM} category=${category}`);
        if (realStderr) console.error(`[run] stderr: ${realStderr.slice(0, 500)}`);

        return res.json({
          success: false,
          output: realStdout,           // always include any partial stdout produced before crash
          stdout: realStdout,
          stderr: realStderr,           // always include real stderr, never err.message
          error: userMessage,           // classified, human-readable message
          exitCode,
          signal: err.signal || null,
          isTimeout,
          isOOM,
          errorCategory: category,      // "compilation" | "runtime" | "timeout" | "memory" | "docker"
          executionTime,
          memory: "512 MB (limit)",
          language,
          artifacts,
          dockerImage: image,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        output: realStdout,
        stdout: realStdout,
        stderr: realStderr,
        error: "",
        exitCode: 0,
        signal: null,
        isTimeout: false,
        isOOM: false,
        errorCategory: null,
        executionTime,
        memory: "32 MB",
        language,
        artifacts,
        dockerImage: image,
        runtimeVersion: language === "python" ? "lab-python-ml:latest (Python 3.11 + TensorFlow 2.16 + Keras)" : image,
        timestamp: new Date().toISOString(),
      });
    });

  } catch (e) {
    if (fs.existsSync(jobDir)) {
      fs.rmSync(jobDir, { recursive: true, force: true });
    }
    res.status(500).json({ error: e.message });
  }
});

// Endpoint to serve generated artifacts (graphs, CSV, PDF, text files)
app.get("/api/run/files/:jobId/:fileName", (req, res) => {
  try {
    const { jobId, fileName } = req.params;
    const safeName = path.basename(fileName);
    const filePath = path.join(__dirname, "jobs", "artifacts", jobId, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send("Error serving artifact file");
  }
});

// ===== SECURE JAVA EXECUTION API =====
// POST /api/run-java
// Input: { "code": "Java source code", "input": "optional user input" }
// Uses Docker with security limits
app.post("/api/run-java", runLimiter, async (req, res) => {
  const { code, input } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({
      success: false,
      error: "Code is required"
    });
  }

  // Generate unique runId
  const runId = Date.now().toString();
  const tempDir = path.join(JOBS_DIR, `temp-${runId}`);

  // Check if input is provided
  const hasInput = input && typeof input === "string" && input.trim().length > 0;

  try {
    // Create temp folder
    fs.mkdirSync(tempDir, { recursive: true });

    // Save code as Main.java
    const javaFilePath = path.join(tempDir, "Main.java");
    fs.writeFileSync(javaFilePath, code);

    // Build Docker command with optional input
    const runCmd = hasInput
      ? `javac Main.java && echo "${input.replace(/"/g, '\\"')}" | java Main`
      : "javac Main.java && java Main";

    // Docker command with security limits
    const dockerCmd = `docker run --rm \
--memory=100m \
--cpus=0.5 \
--pids-limit=64 \
--network=none \
-v "${tempDir}":/app \
-w /app \
eclipse-temurin:17 \
timeout 5 sh -c "${runCmd}"`;

    // Execute Docker command
    exec(dockerCmd, { timeout: 10000 }, (error, stdout, stderr) => {
      // Clean up temp folder
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (error) {
        // Check if it's a timeout
        if (error.killed || error.signal === 'SIGTERM') {
          return res.json({
            success: false,
            error: "Execution timed out (5 second limit)"
          });
        }
        return res.json({
          success: false,
          error: stderr || error.message
        });
      }

      if (stderr) {
        return res.json({
          success: false,
          error: stderr
        });
      }

      res.json({
        success: true,
        output: stdout
      });
    });

  } catch (err) {
    // Clean up on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const suppressListen =
  String(process.env.SUPPRESS_SERVER_LISTEN || "").toLowerCase() === "1" ||
  String(process.env.VITEST || "").toLowerCase() === "true";

if (!suppressListen) {
  const server = app.listen(PORT);
  let __agentServerListening = false;

  server.once("listening", () => {
    __agentServerListening = true;
    console.log(`Code Runner running on port ${PORT}`);
    console.log(
      `[run] CODE_RUNNER=${CODE_RUNNER} | Piston=${PISTON_API_URL} | Judge0=${JUDGE0_API_URL}`
    );
    listRoutes(app);
  });

  server.on("error", (error) => {
    console.error("Server listen error:", error);
    if (!__agentServerListening && error?.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop existing server process before starting a new one.`
      );
      process.exitCode = 1;
    }
  });
} else {
  console.log("[server] SUPPRESS_SERVER_LISTEN=1 — listening skipped (tests/imports).");
}

module.exports = app;
