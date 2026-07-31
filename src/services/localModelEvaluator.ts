import { evaluateSubmissionContent } from "@/utils/evaluationEngine";
import { supabase } from "@/lib/supabase";

type Input = {
  aim?: string | null;
  procedure?: string | null;
  program?: string | null;
  output?: string | null;
  result?: string | null;
  experimentTitle?: string | null;
  experimentId?: string | null;
};

type Output = {
  ai_score: number;
  confidence: number;
  status: string;
  breakdown: Record<string, number>;
  marksOutOf10: number;
  source: "local_model" | "local";
};

function getApiBaseUrl() {
  return String(import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001").replace(/\/$/, "");
}

export async function evaluateWithLocalModel(input: Input): Promise<Output> {
  const fallback = evaluateSubmissionContent({
    aim: input.aim,
    algorithm: input.procedure,
    program: input.program,
    output: input.output,
    result: input.result,
    experimentId: input.experimentId,
    autoGenerateIfEmpty: true,
  });

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    console.log("[AI] Session:", session);
    console.log("[AI] Access token exists:", !!session?.access_token);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    console.log("[AI] Request headers:", {
      ...headers,
      Authorization: headers.Authorization ? "Bearer <present>" : undefined,
    });

    const response = await fetch(`${getApiBaseUrl()}/api/ai/local-evaluate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        aim: input.aim || "",
        procedure: input.procedure || "",
        program: input.program || "",
        output: input.output || "",
        result: input.result || "",
        experimentTitle: input.experimentTitle || "",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data?.success) {
      throw new Error(String(data?.error || "Model evaluation failed"));
    }

    const predicted = Math.max(0, Math.min(100, Number(data.predicted_score || 0)));
    const confidence = Math.max(0, Math.min(100, Number(data.confidence || 0)));
    const marksOutOf10 = Number((predicted / 10).toFixed(1));
    const breakdown =
      data.breakdown && typeof data.breakdown === "object" ? data.breakdown : fallback.breakdown;

    return {
      ai_score: predicted,
      confidence,
      status: String(data.status || fallback.status || "Needs Improvement"),
      breakdown,
      marksOutOf10,
      source: "local_model",
    };
  } catch (error) {
    console.error("[AI] local-evaluate failed:", error);

    return {
      ai_score: fallback.aiScore,
      confidence: fallback.confidence,
      status: fallback.status,
      breakdown: fallback.breakdown,
      marksOutOf10: fallback.marksOutOf10,
      source: "local",
    };
  }
}

