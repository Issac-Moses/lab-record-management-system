import { useMemo, useRef, useCallback } from "react";

export type SectionKey = "aim" | "procedure" | "code" | "output" | "result" | "viva";
export type SectionState = "completed" | "active" | "pending";

export interface SectionProgress {
  key: SectionKey;
  label: string;
  state: SectionState;
  detail: string;
}

interface ProgressInput {
  aim: string;
  procedure: string;
  code: string;
  output: string;
  result: string;
  vivaAnswers: string[];
  vivaTotal: number;
  attachmentCount: number;
  showCode: boolean;
}

const SECTION_ORDER: SectionKey[] = ["aim", "procedure", "code", "output", "result", "viva"];

function isAimComplete(aim: string) {
  return aim.trim().length >= 10;
}

function countNumberedSteps(text: string): number {
  return text.split(/\r?\n/).filter((line) => /^\s*\d+[\.\)]\s/.test(line)).length;
}

function isProcedureComplete(procedure: string) {
  const trimmed = procedure.trim();
  const numberedSteps = countNumberedSteps(trimmed);
  return numberedSteps >= 2 || trimmed.length >= 25;
}

function countCodeLines(code: string): number {
  return code
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("#") && !trimmed.startsWith("--");
    }).length;
}

function isCodeComplete(code: string) {
  return countCodeLines(code) >= 3;
}

function isOutputComplete(output: string, attachmentCount: number) {
  return output.trim().length > 0 || attachmentCount > 0;
}

function isResultComplete(result: string) {
  return result.trim().length >= 20;
}

function countVivaAnswered(answers: string[]): number {
  return answers.filter((a) => a.trim().length > 0).length;
}

export default function useExperimentProgress(input: ProgressInput) {
  const {
    aim,
    procedure,
    code,
    output,
    result,
    vivaAnswers,
    vivaTotal,
    attachmentCount,
    showCode,
  } = input;

  const completionMap = useMemo(() => ({
    aim: isAimComplete(aim),
    procedure: isProcedureComplete(procedure),
    code: showCode ? isCodeComplete(code) : true,
    output: isOutputComplete(output, attachmentCount),
    result: isResultComplete(result),
    viva: vivaTotal > 0 ? countVivaAnswered(vivaAnswers) === vivaTotal : true,
  }), [aim, procedure, code, output, result, vivaAnswers, vivaTotal, attachmentCount, showCode]);

  const progressSectionKeys = useMemo(
    () =>
      SECTION_ORDER.filter((key) => {
        if (key === "code") return showCode;
        if (key === "viva") return vivaTotal > 0;
        return true;
      }),
    [showCode, vivaTotal]
  );

  const prevCompletionRef = useRef<Record<SectionKey, boolean>>({ ...completionMap });

  const sections: SectionProgress[] = useMemo(() => {
    let chainBroken = false;
    return SECTION_ORDER.map((key, idx) => {
      const meetsCompletion = completionMap[key];
      const allPreviousComplete = SECTION_ORDER.slice(0, idx).every((k) => completionMap[k]);
      const isComplete = meetsCompletion && allPreviousComplete;
      let state: SectionState;

      if (isComplete && !chainBroken) {
        state = "completed";
      } else if (!chainBroken) {
        state = "active";
        chainBroken = true;
      } else {
        state = "pending";
      }

      let detail = "";
      switch (key) {
        case "aim":
          detail = isComplete ? `${aim.trim().length} chars` : aim.trim().length > 0 ? `${aim.trim().length} chars` : "Not started";
          break;
        case "procedure": {
          const steps = countNumberedSteps(procedure);
          if (steps > 0) {
            detail = isComplete
              ? `${steps} steps`
              : `${steps} step${steps !== 1 ? "s" : ""}`;
          } else {
            const chars = procedure.trim().length;
            detail = chars > 0 ? `${chars} chars` : "Not started";
          }
          break;
        }
        case "code":
          if (!showCode) { detail = "N/A"; break; }
          detail = isComplete ? `${countCodeLines(code)} lines` : code.trim().length > 0 ? "In progress" : "Not started";
          break;
        case "output":
          detail = isComplete ? (attachmentCount > 0 ? `${attachmentCount} file${attachmentCount !== 1 ? "s" : ""}` : "Text added") : "Not started";
          break;
        case "result":
          detail = isComplete ? `${result.trim().length} chars` : result.trim().length > 0 ? `${result.trim().length} chars` : "Not started";
          break;
        case "viva": {
          const answered = countVivaAnswered(vivaAnswers);
          detail = vivaTotal > 0 ? `${answered}/${vivaTotal} answered` : "Optional";
          break;
        }
      }

      return {
        key,
        label: key === "viva" ? "Viva" : key.charAt(0).toUpperCase() + key.slice(1),
        state,
        detail,
      };
    });
  }, [completionMap, aim, procedure, code, output, result, vivaAnswers, vivaTotal, attachmentCount, showCode]);

  const completedCount = useMemo(
    () => progressSectionKeys.filter((key) => completionMap[key]).length,
    [progressSectionKeys, completionMap]
  );
  const totalSections = progressSectionKeys.length;
  const progress =
    totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

  const activeSection = useMemo(
    () => sections.find((s) => s.state === "active")?.key ?? null,
    [sections]
  );

  const getNewlyCompleted = useCallback((): SectionKey | null => {
    for (const key of SECTION_ORDER) {
      if (completionMap[key] && !prevCompletionRef.current[key]) {
        prevCompletionRef.current = { ...completionMap };
        return key;
      }
    }
    prevCompletionRef.current = { ...completionMap };
    return null;
  }, [completionMap]);

  return {
    sections,
    progress,
    completedCount,
    totalSections,
    activeSection,
    completionMap,
    getNewlyCompleted,
  };
}
