export interface ArtifactItem {
  name: string;
  size: number;
  type: string;
  url: string;
  data?: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  stdout?: string;
  stderr?: string;
  error?: string | null;
  executionTime?: number;
  memory?: string;
  exitCode?: number;
  language?: string;
  artifacts?: ArtifactItem[];
  dockerImage?: string;
  runtimeVersion?: string;
  timestamp?: string;
}

export async function executeCode(
  language: string,
  code: string,
  input: string = ""
): Promise<ExecutionResult> {
  const base = String(
    import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001"
  ).replace(/\/+$/, "");

  try {
    const response = await fetch(`${base}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: (language || "python").toLowerCase(),
        code: code || "",
        input: input || "",
      }),
    });

    if (!response.ok) {
      let errorMessage = "Execution server error";
      try {
        const errorData = await response.json();
        if (
          typeof errorData?.error === "string" &&
          errorData.error.trim().length > 0
        ) {
          errorMessage =
            errorData.error === "Unsupported language"
              ? "Execution not supported for this language"
              : errorData.error;
        }
      } catch {
        // keep default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json().catch(
      () => ({} as Record<string, unknown>)
    );

    const success = data?.success === true;
    const output = typeof data.output === "string" ? data.output : "";
    const stdout = typeof data.stdout === "string" ? data.stdout : output;
    const stderr = typeof data.stderr === "string" ? data.stderr : "";
    const error =
      typeof data.error === "string" && data.error.length > 0
        ? data.error
        : null;

    const rawArtifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
    const artifacts: ArtifactItem[] = rawArtifacts.map((a: any) => {
      const artifactUrl =
        typeof a.url === "string" && a.url.startsWith("/")
          ? `${base}${a.url}`
          : a.url;

      return {
        name: String(a.name || "artifact"),
        size: Number(a.size || 0),
        type: String(a.type || "application/octet-stream"),
        url: artifactUrl,
        data: typeof a.data === "string" ? a.data : undefined,
      };
    });

    return {
      success,
      output,
      stdout,
      stderr,
      error: success ? null : error || stderr || "Execution failed",
      executionTime:
        typeof data.executionTime === "number" ? data.executionTime : 0,
      memory: typeof data.memory === "string" ? data.memory : "32 MB",
      exitCode: typeof data.exitCode === "number" ? data.exitCode : success ? 0 : 1,
      language: typeof data.language === "string" ? data.language : language,
      artifacts,
    };
  } catch (err) {
    console.error("Execution error:", err);
    const errorMessage =
      err instanceof Error && err.message
        ? err.message
        : "Execution server not running on localhost:7001";
    return {
      success: false,
      output: "",
      stdout: "",
      stderr: errorMessage,
      error: errorMessage,
      executionTime: 0,
      memory: "0 MB",
      exitCode: 1,
      language,
      artifacts: [],
    };
  }
}
