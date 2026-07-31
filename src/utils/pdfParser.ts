import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker;

type ParsedSections = {
  aim: string;
  procedure: string;
  program: string;
  output: string;
  result: string;
};

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBetween(text: string, start: string, end: string): string {
  const source = String(text || "");
  const pattern = new RegExp(
    `${escapeRegex(start)}\\s*[:\\-]?\\s*([\\s\\S]*?)\\s*(?=${escapeRegex(end)}\\s*[:\\-]?|$)`,
    "i"
  );
  const match = source.match(pattern);
  return cleanText(match?.[1] || "");
}

function getAfter(text: string, start: string): string {
  const source = String(text || "");
  const pattern = new RegExp(`${escapeRegex(start)}\\s*[:\\-]?\\s*([\\s\\S]*)$`, "i");
  const match = source.match(pattern);
  return cleanText(match?.[1] || "");
}

function extractSections(text: string): ParsedSections {
  return {
    aim: getBetween(text, "AIM", "PROCEDURE"),
    procedure: getBetween(text, "PROCEDURE", "PROGRAM"),
    program: getBetween(text, "PROGRAM", "OUTPUT"),
    output: getBetween(text, "OUTPUT", "RESULT"),
    result: getAfter(text, "RESULT"),
  };
}

export async function parsePDF(file: File): Promise<ParsedSections> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = (pdfjsLib as any).getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let text = "";
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((item: any) => String(item?.str || ""))
      .join(" ");
    text += ` ${pageText}`;
  }

  return extractSections(text);
}

export type { ParsedSections };
import { supabase } from "@/lib/supabase";

export type ParsedExperimentSection = {
  exNo: number;
  title: string;
  aim: string;
  algorithm: string;
  program: string;
  output: string;
  result: string;
};

const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
const EX_BLOCK_REGEX = /EX\s*NO[:.-]?\s*\d+/gi;
let recordTextEndpointAvailable: boolean | null = null;
const unavailableParsedSubjects = new Set<string>();
const parsedRecordCache = new Map<string, ParsedExperimentSection[]>();

function readSection(block: string, label: string): string {
  const sectionLabels = ["AIM", "ALGORITHM", "PROGRAM", "OUTPUT", "RESULT"];
  const regex = new RegExp(
    `${label}\\s*:\\s*([\\s\\S]*?)(?=(?:${sectionLabels.join("|")})\\s*:|$)`,
    "i"
  );
  const match = String(block || "").match(regex);
  return String(match?.[1] || "").trim();
}

export function parseRecordText(text: string): ParsedExperimentSection[] {
  const source = String(text || "").trim();
  if (!source) {
    throw new Error("Parsed PDF text is empty.");
  }

  const matches = Array.from(source.matchAll(EX_BLOCK_REGEX));
  if (matches.length === 0) {
    throw new Error("No experiment blocks found in PDF text.");
  }

  const blocks = matches.map((match, index) => {
    const start = match.index ?? 0;
    const nextMatch = matches[index + 1];
    const end = nextMatch && typeof nextMatch.index === "number" ? nextMatch.index : source.length;
    return source.slice(start, end).trim();
  });

  return blocks.map((block, index) => {
    const exNoMatch = block.match(/EX\s*NO[:.-]?\s*(\d+)/i);
    const exNo = Number(exNoMatch?.[1] || index + 1);
    const titleMatch = block.match(/TITLE\s*:\s*(.+)/i);
    const title = String(titleMatch?.[1] || `Experiment ${exNo}`).trim();
    const experiment = {
      exNo,
      title,
      aim: readSection(block, "AIM"),
      algorithm: readSection(block, "ALGORITHM"),
      program: readSection(block, "PROGRAM"),
      output: readSection(block, "OUTPUT"),
      result: readSection(block, "RESULT"),
    };
    if (!experiment.aim || !experiment.algorithm || !experiment.program || !experiment.output || !experiment.result) {
      throw new Error(`Incomplete sections found for experiment ${exNo}.`);
    }
    return experiment;
  });
}

export async function getParsedRecordBySubject(subjectId: string): Promise<ParsedExperimentSection[]> {
  const key = String(subjectId || "").trim();
  if (!key) return [];
  if (parsedRecordCache.has(key)) {
    return parsedRecordCache.get(key) || [];
  }
  if (unavailableParsedSubjects.has(key)) {
    return [];
  }
  if (recordTextEndpointAvailable === false) {
    return [];
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(
      `${MANUAL_API_BASE_URL}/api/manual/record-text/${encodeURIComponent(key)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (_error) {
    recordTextEndpointAvailable = false;
    unavailableParsedSubjects.add(key);
    return [];
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    if (response.status === 404) {
      recordTextEndpointAvailable = false;
    }
    if (response.status >= 400 && response.status < 500) {
      unavailableParsedSubjects.add(key);
    }
    return [];
  }
  recordTextEndpointAvailable = true;

  const recordText = String(payload?.data?.text || "").trim();
  try {
    const parsed = parseRecordText(recordText);
    if (parsed.length === 0) {
      unavailableParsedSubjects.add(key);
      return [];
    }
    parsedRecordCache.set(key, parsed);
    return parsed;
  } catch (_error) {
    unavailableParsedSubjects.add(key);
    return [];
  }
}
