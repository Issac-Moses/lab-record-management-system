const SECTION_WEIGHTS = {
  aim: 2,
  procedure: 2,
  program: 3,
  output: 2,
  result: 1,
};

const SECTION_ORDER = ["aim", "procedure", "program", "output", "result", "viva"];
const SECTION_LABELS = {
  aim: ["AIM"],
  procedure: ["PROCEDURE", "ALGORITHM"],
  program: ["PROGRAM", "SOURCE CODE", "CODE"],
  output: ["OUTPUT"],
  result: ["RESULT"],
  viva: ["VIVA QUESTIONS", "VIVA"],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSectionRegex(label) {
  const allLabels = SECTION_ORDER
    .flatMap((key) => SECTION_LABELS[key] || [])
    .map((value) => value.replace(/\s+/g, "\\s*"))
    .join("|");
  const current = String(label || "").replace(/\s+/g, "\\s*");
  return new RegExp(
    `(?:^|\\n)\\s*${current}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${allLabels})\\s*[:\\-]?)|$)`,
    "i"
  );
}

function detectSectionsFromText(rawText) {
  const source = normalizeText(rawText);
  const sections = {
    aim: "",
    procedure: "",
    program: "",
    output: "",
    result: "",
    viva: "",
  };
  for (const key of SECTION_ORDER) {
    const labels = SECTION_LABELS[key] || [];
    for (const label of labels) {
      const match = source.match(buildSectionRegex(label));
      const captured = normalizeText(match?.[1] || "");
      if (captured) {
        sections[key] = captured;
        break;
      }
    }
  }
  return sections;
}

function qualityTierToMarks(weight, tier) {
  if (tier === "missing") return 0;
  if (tier === "weak") return Number((weight * 0.3).toFixed(2));
  if (tier === "average") return Number((weight * 0.7).toFixed(2));
  return Number(weight.toFixed(2));
}

function scoreAim(text) {
  const content = normalizeText(text);
  if (!content) return { tier: "missing", reason: "AIM section missing" };
  const hasActionVerb = /\b(implement|analy[sz]e|design|develop|build|simulate|evaluate|demonstrate|study)\b/i.test(content);
  if (!hasActionVerb || content.length < 24) {
    return { tier: "weak", reason: "AIM is too short or unclear" };
  }
  if (content.length < 60) {
    return { tier: "average", reason: "AIM exists but lacks depth" };
  }
  return { tier: "strong", reason: "AIM is clear and objective-driven" };
}

function scoreProcedure(text) {
  const content = normalizeText(text);
  if (!content) return { tier: "missing", reason: "PROCEDURE/ALGORITHM section missing" };
  const numberedSteps = /(^|\n)\s*(\d+[\).\s]|step\s+\d+[\s:.-])/i.test(content);
  const flowWords = /\b(initiali[sz]e|input|process|compute|loop|iterate|return|end)\b/i.test(content);
  if (!numberedSteps || content.length < 40) {
    return { tier: "weak", reason: "Procedure is not step-wise" };
  }
  if (!flowWords || content.length < 90) {
    return { tier: "average", reason: "Procedure has steps but limited flow detail" };
  }
  return { tier: "strong", reason: "Procedure has clear logical steps" };
}

function scoreProgram(text) {
  const content = normalizeText(text);
  if (!content) return { tier: "missing", reason: "PROGRAM section missing" };
  const codeSignals = /\b(import|from|def|class|function|public\s+class|#include|print\s*\(|console\.log|model|fit|predict|SELECT|INSERT)\b|[{}();]/i.test(content);
  const helloOnly = /hello\s*world/i.test(content) && content.length < 140;
  if (!codeSignals || content.length < 45) {
    return { tier: "weak", reason: "Program lacks real code structure" };
  }
  if (helloOnly) {
    return { tier: "weak", reason: "Program appears trivial (Hello World)" };
  }
  if (content.length < 170) {
    return { tier: "average", reason: "Program is valid but limited in complexity" };
  }
  return { tier: "strong", reason: "Program shows substantive implementation" };
}

function scoreOutput(text, hasOutputImage) {
  const content = normalizeText(text);
  const outputSignals = /\b(output|result|accuracy|loss|value|table|graph|screenshot|figure|prediction)\b/i.test(content);
  const hasNumbers = /\b\d+(?:\.\d+)?\b/.test(content);
  if (!content && !hasOutputImage) {
    return { tier: "missing", reason: "OUTPUT section missing" };
  }
  if (!outputSignals && !hasNumbers && !hasOutputImage) {
    return { tier: "weak", reason: "Output lacks concrete evidence" };
  }
  if ((outputSignals || hasNumbers) && content.length >= 20) {
    if (content.length >= 80 || hasOutputImage) {
      return { tier: "strong", reason: "Output contains meaningful result evidence" };
    }
    return { tier: "average", reason: "Output is present but brief" };
  }
  return { tier: "average", reason: "Output evidence is partial" };
}

function scoreResult(text) {
  const content = normalizeText(text);
  if (!content) return { tier: "missing", reason: "RESULT section missing" };
  const conclusionSignals = /\b(thus|successfully|conclusion|result|therefore|hence)\b/i.test(content);
  if (!conclusionSignals || content.length < 18) {
    return { tier: "weak", reason: "Result lacks conclusion statement" };
  }
  if (content.length < 45) {
    return { tier: "average", reason: "Result concludes but is brief" };
  }
  return { tier: "strong", reason: "Result clearly concludes the experiment" };
}

function calculateMarks(input, legacyReferenceText, legacyOutputImage) {
  try {
    const payload =
      input && typeof input === "object" && !Array.isArray(input)
        ? input
        : {
            rawText: input,
            referenceText: legacyReferenceText,
            outputImage: legacyOutputImage,
          };

    const rawText = normalizeText(payload.rawText || payload.studentText || "");
    const sections = detectSectionsFromText(rawText);
    const hasOutputImage = Boolean(payload.outputImage);

    const aimEval = scoreAim(sections.aim);
    const procedureEval = scoreProcedure(sections.procedure);
    const programEval = scoreProgram(sections.program);
    const outputEval = scoreOutput(sections.output, hasOutputImage);
    const resultEval = scoreResult(sections.result);

    const marks = {
      aim: qualityTierToMarks(SECTION_WEIGHTS.aim, aimEval.tier),
      procedure: qualityTierToMarks(SECTION_WEIGHTS.procedure, procedureEval.tier),
      program: qualityTierToMarks(SECTION_WEIGHTS.program, programEval.tier),
      output: qualityTierToMarks(SECTION_WEIGHTS.output, outputEval.tier),
      result: qualityTierToMarks(SECTION_WEIGHTS.result, resultEval.tier),
    };
    const total = Number(
      clamp(
        marks.aim + marks.procedure + marks.program + marks.output + marks.result,
        0,
        10
      ).toFixed(2)
    );
    const missingSections = Object.entries(sections)
      .filter(([key, value]) => key !== "viva" && !normalizeText(value))
      .map(([key]) => key);
    const manualReviewRequired = !rawText || missingSections.length > 0;

    return {
      total,
      breakdown: marks,
      sections,
      tiers: {
        aim: aimEval.tier,
        procedure: procedureEval.tier,
        program: programEval.tier,
        output: outputEval.tier,
        result: resultEval.tier,
      },
      reasons: {
        aim: aimEval.reason,
        procedure: procedureEval.reason,
        program: programEval.reason,
        output: outputEval.reason,
        result: resultEval.reason,
      },
      status: manualReviewRequired
        ? "Unable to evaluate — manual review required"
        : total >= 8
          ? "Good"
          : total >= 5
            ? "Average"
            : "Needs Improvement",
      manualReviewRequired,
      missingSections,
      maxTotal: 10,
      scale: "10",
    };
  } catch (error) {
    console.error("calculateMarks error:", error);
    return {
      total: 0,
      breakdown: {
        aim: 0,
        procedure: 0,
        program: 0,
        output: 0,
        result: 0,
      },
      sections: {
        aim: "",
        procedure: "",
        program: "",
        output: "",
        result: "",
        viva: "",
      },
      tiers: {
        aim: "missing",
        procedure: "missing",
        program: "missing",
        output: "missing",
        result: "missing",
      },
      reasons: {
        aim: "Unable to evaluate",
        procedure: "Unable to evaluate",
        program: "Unable to evaluate",
        output: "Unable to evaluate",
        result: "Unable to evaluate",
      },
      status: "Unable to evaluate — manual review required",
      manualReviewRequired: true,
      missingSections: ["aim", "procedure", "program", "output", "result"],
      maxTotal: 10,
      scale: "10",
    };
  }
}

module.exports = {
  calculateMarks,
};
