import { ensurePdfMakeFonts } from "@/pdf/pdfFonts";
import { supabase } from "@/lib/supabase";
import type { UnifiedStudentDataResult } from "@/utils/unifiedStudentData";
import manualCollegeLogoUrl from "@/pdf/assets/manual-college-logo.png?url";
import manualHeaderBannerUrl from "@/pdf/assets/manual-header-banner.png?url";

type PdfImageValue = string | null;

type ManualAssets = {
  headerBanner?: PdfImageValue;
  collegeLogoLeft?: PdfImageValue;
  accreditationLogoRight?: PdfImageValue;
  digitalSeal?: PdfImageValue;
  facultySignature?: PdfImageValue;
};

type ManualFrontMatter = {
  institutionVision: string;
  institutionMission: string[];
  departmentVision: string;
  departmentMission: string[];
  courseObjectives: string[];
  courseOutcomes: Array<{ code: string; description: string }>;
  coPoHeaders: string[];
  coPoRows: string[][];
};

type RecordPdfPayload = {
  collegeName: string;
  subjectName: string;
  studentName: string;
  registerNo: string;
  yearSemester: string;
  data: UnifiedStudentDataResult;
  branch?: string;
  departmentName?: string;
  academicYear?: string;
  assets?: ManualAssets;
  frontMatter?: Partial<ManualFrontMatter>;
};

type RecordExperiment = {
  no: number;
  title: string;
  date: string;
  aim: string;
  procedure: string;
  program: string;
  output: string;
  result: string;
  vivaQuestions: string[];
  finalMarks: number;
  aiScore: number;
  facultyVerified: boolean;
  images: string[];
};

type ManualRecordData = {
  collegeName: string;
  autonomousLine: string;
  affiliatedLine: string;
  addressLine: string;
  departmentName: string;
  subjectName: string;
  studentName: string;
  registerNo: string;
  branch: string;
  yearSemester: string;
  academicYear: string;
  experiments: RecordExperiment[];
};

const PAGE_SIZE = "A4";
const PAGE_MARGINS: [number, number, number, number] = [42, 57, 42, 57];
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const BORDER_INSET_MM = 10;
const MM_TO_PT = 2.83464567;
const BORDER_INSET_PT = BORDER_INSET_MM * MM_TO_PT;
const DEFAULT_VIVA = [
  "Define the objective of this experiment.",
  "What concept is applied in this experiment?",
  "What are the expected outcomes for this experiment?",
  "Which tools or libraries are used and why?",
  "How can this experiment be improved further?",
  "What input is required to run this experiment?",
  "Which output validates successful execution?",
  "What are the limitations of this approach?",
  "How will you debug errors in this experiment?",
  "How is this experiment used in real applications?",
];

const OOSE_EXPERIMENT_TITLES: Record<number, string> = {
  1: "Study of UML",
  2: "Passport Automation System.",
  3: "Book Bank Management System.",
  4: "Exam Registration System.",
  5: "Stock Maintenance System.",
  6: "Online Course Reservation System",
  7: "E-Ticketing.",
  8: "Software Personnel Management System.",
  9: "Credit Card Processing System.",
  10: "E-Book Management System.",
  11: "Online Recruitment System",
  12: "Foreign Trading System",
  13: "Conference management System",
  14: "BPO Management System",
  15: "Library Management System",
};

const TABLE_LAYOUT = {
  hLineWidth: () => 0.8,
  vLineWidth: () => 0.8,
  hLineColor: () => "#000000",
  vLineColor: () => "#000000",
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

const NO_BORDER_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

const DEFAULT_FRONT_MATTER: ManualFrontMatter = {
  institutionVision:
    "To emerge as an Institution of Excellence by providing High Quality Education in Engineering, Technology and Management to contribute for the economic as well as societal growth of our Nation.",
  institutionMission: [
    "To impart strong fundamental and Value-Based Academic knowledge in various Engineering, Technology and Management disciplines to nurture creativity.",
    "To promote innovative Research and Development activities by collaborating with Industries, R&D organizations and other statutory bodies.",
    "To provide conducive learning environment and training so as to empower the students with dynamic skill development for employability.",
    "To foster Entrepreneurial spirit amongst the students for making a positive impact on remarkable community development.",
  ],
  departmentVision:
    "To emerge as a center of academic excellence to meet the industrial needs of the competitive world with IT technocrats and researchers for the social and economic growth of the country in the area of Information Technology.",
  departmentMission: [
    "To provide quality education to the students to attain new heights in IT industry and research.",
    "To create employable students at national/international level by training them with adequate skills.",
    "To produce good citizens with high personal and professional ethics to serve both the IT industry and society.",
  ],
  courseObjectives: [
    "To understand the basics in deep neural networks.",
    "To understand the basics of associative memory and unsupervised learning networks.",
    "To apply CNN architectures of deep neural networks.",
    "To analyze the key computations underlying deep learning, then use them to build and train deep neural networks for various tasks.",
    "To apply autoencoders and generative models for suitable applications.",
  ],
  courseOutcomes: [
    { code: "CO1", description: "Apply Convolution Neural Network for image processing." },
    {
      code: "CO2",
      description: "Understand the basics of associative memory and unsupervised learning networks.",
    },
    { code: "CO3", description: "Apply CNN and its variants for suitable applications." },
    {
      code: "CO4",
      description:
        "Analyze the key computations underlying deep learning and use them to build and train deep neural networks for various tasks.",
    },
    { code: "CO5", description: "Apply autoencoders and generative models for suitable applications." },
  ],
  coPoHeaders: [
    "CO",
    "PO1",
    "PO2",
    "PO3",
    "PO4",
    "PO5",
    "PO6",
    "PO7",
    "PO8",
    "PO9",
    "PO10",
    "PO11",
    "PO12",
    "PSO1",
    "PSO2",
    "PSO3",
  ],
  coPoRows: [
    ["CO1", "3", "2", "3", "2", "3", "1", "-", "-", "2", "1", "-", "-", "2", "2", "1"],
    ["CO2", "3", "1", "2", "1", "-", "-", "-", "-", "-", "1", "2", "2", "-", "1", "-"],
    ["CO3", "3", "3", "3", "3", "3", "1", "-", "-", "2", "1", "-", "-", "2", "2", "1"],
    ["CO4", "3", "3", "3", "3", "3", "-", "-", "-", "2", "-", "2", "3", "2", "2", "2"],
    ["CO5", "1", "1", "3", "2", "3", "-", "-", "-", "2", "-", "-", "-", "1", "1", "-"],
  ],
};

function cleanText(value: unknown): string {
  return String(value || "").replace(/\r/g, "").trim();
}

/** Normalizes labels like "ACADEMIC YEAR : 2024-2025" and legacy ranges to 2025-2026. */
function normalizeAcademicYearValue(raw: string | undefined): string {
  let v = cleanText(raw).trim();
  v = v.replace(/^academic\s+year\s*:\s*/i, "").trim();
  if (!v) return "2025-2026";
  if (/2024\s*([-–/])\s*2025/i.test(v)) {
    return v.replace(/2024\s*([-–/])\s*2025/gi, "2025$12026");
  }
  return v;
}

/** Bonafide line uses spaced year (e.g. "2025 - 2026") derived from normalized academic year. */
function formatBonafideDuringYearLine(academicYear: string): string {
  const normalized = normalizeAcademicYearValue(academicYear);
  const m = normalized.match(/(\d{4})\s*([-–/])\s*(\d{4})/);
  if (m) return `________________________________________during the year ${m[1]} - ${m[3]}.`;
  return "________________________________________during the year 2025 - 2026.";
}

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampMarks(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, value));
}

function toDataImage(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("data:image/")) return text;
  // Ignore URL/blob paths: pdfmake browser mode expects data URLs only.
  if (
    text.startsWith("blob:") ||
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("/") ||
    text.startsWith("./")
  ) {
    return null;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(text)) {
    return `data:image/png;base64,${text}`;
  }
  return null;
}

function resolveWindowImage(
  key:
    | "COLLEGE_LOGO_BASE64"
    | "ACCREDITATION_LOGO_BASE64"
    | "SEAL_BASE64"
    | "FACULTY_SIGNATURE_BASE64"
): string | null {
  if (typeof window === "undefined") return null;
  return toDataImage((window as any)[key]);
}

export function createManualImageEmbeddingExample() {
  return {
    headerBanner: "data:image/png;base64,<college-header-banner>",
    collegeLogoLeft: "data:image/png;base64,<college-logo>",
    accreditationLogoRight: "data:image/png;base64,<naac-iso-logo>",
    digitalSeal: "data:image/png;base64,<digital-seal>",
    facultySignature: "data:image/png;base64,<faculty-signature>",
  };
}

function resolveAssets(assets?: ManualAssets): Required<ManualAssets> {
  return {
    headerBanner: toDataImage(assets?.headerBanner),
    collegeLogoLeft: toDataImage(assets?.collegeLogoLeft) || resolveWindowImage("COLLEGE_LOGO_BASE64"),
    accreditationLogoRight:
      toDataImage(assets?.accreditationLogoRight) || resolveWindowImage("ACCREDITATION_LOGO_BASE64"),
    digitalSeal: toDataImage(assets?.digitalSeal) || resolveWindowImage("SEAL_BASE64"),
    facultySignature:
      toDataImage(assets?.facultySignature) || resolveWindowImage("FACULTY_SIGNATURE_BASE64"),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to load image asset"));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(url: string, accessToken?: string | null): Promise<string | null> {
  try {
    const headers: HeadersInit = {};
    if (accessToken) {
      (headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(url, { headers, credentials: "omit" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function resolveBundledManualAssets(): Promise<ManualAssets> {
  const [headerBanner, collegeLogo] = await Promise.all([
    fetchImageAsDataUrl(manualHeaderBannerUrl),
    fetchImageAsDataUrl(manualCollegeLogoUrl),
  ]);
  return {
    headerBanner,
    collegeLogoLeft: collegeLogo,
    accreditationLogoRight: headerBanner,
  };
}

function isLikelyRawBase64Image(value: string): boolean {
  return /^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s/g, "").length > 64;
}

/**
 * pdfmake needs embedded images in browser PDFs; HTTP(S) URLs or raw base64 from DB must become data URLs.
 * Does not change PDF layout — only the image strings passed to the same {@link imageSection} pipeline.
 */
async function embedExperimentImagesForPdf(data: UnifiedStudentDataResult): Promise<UnifiedStudentDataResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;

  const experiments = await Promise.all(
    data.experiments.map(async (exp) => {
      const expAny = exp as UnifiedStudentDataResult["experiments"][number] & { attachments?: unknown };
      const raw = coerceExperimentImageList(exp.images, expAny.attachments);
      const resolved = await Promise.all(
        raw.map(async (item) => {
          const s = String(item || "").trim();
          if (!s) return "";
          if (s.startsWith("data:image/")) return s;
          if (s.startsWith("data:application/")) return "";
          if (s.startsWith("http://") || s.startsWith("https://")) {
            let dataUrl = await fetchImageAsDataUrl(s, accessToken);
            if (!dataUrl && accessToken) {
              dataUrl = await fetchImageAsDataUrl(s, null);
            }
            return dataUrl || "";
          }
          if (s.startsWith("blob:")) return "";
          if (isLikelyRawBase64Image(s)) {
            const compact = s.replace(/\s/g, "");
            return `data:image/png;base64,${compact}`;
          }
          return s;
        })
      );
      return { ...exp, images: resolved.filter(Boolean) };
    })
  );
  return { ...data, experiments };
}

function extractSectionsFromCombinedText(raw: string): {
  aim: string;
  procedure: string;
  program: string;
  output: string;
  result: string;
} {
  const text = cleanText(raw);
  if (!text) {
    return { aim: "", procedure: "", program: "", output: "", result: "" };
  }
  const normalized = text.replace(/\r/g, "\n");
  const get = (label: string, nextLabels: string[]) => {
    const nextPattern = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(
      `${label}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})\\s*:|$)`,
      "i"
    );
    const match = normalized.match(regex);
    return cleanText(match?.[1] || "");
  };
  return {
    aim: get("AIM", ["PROCEDURE", "ALGORITHM", "PROGRAM", "OUTPUT", "RESULT"]),
    procedure: get("PROCEDURE|ALGORITHM", ["PROGRAM", "OUTPUT", "RESULT"]),
    program: get("PROGRAM|SOURCE CODE|CODE", ["OUTPUT", "RESULT"]),
    output: get("OUTPUT", ["RESULT"]),
    result: get("RESULT", []),
  };
}

function mergeFrontMatter(override?: Partial<ManualFrontMatter>): ManualFrontMatter {
  return {
    institutionVision: cleanText(override?.institutionVision) || DEFAULT_FRONT_MATTER.institutionVision,
    institutionMission:
      override?.institutionMission?.map(cleanText).filter(Boolean) || DEFAULT_FRONT_MATTER.institutionMission,
    departmentVision: cleanText(override?.departmentVision) || DEFAULT_FRONT_MATTER.departmentVision,
    departmentMission:
      override?.departmentMission?.map(cleanText).filter(Boolean) || DEFAULT_FRONT_MATTER.departmentMission,
    courseObjectives:
      override?.courseObjectives?.map(cleanText).filter(Boolean) || DEFAULT_FRONT_MATTER.courseObjectives,
    courseOutcomes:
      override?.courseOutcomes?.map((row) => ({
        code: cleanText(row.code),
        description: cleanText(row.description),
      })) || DEFAULT_FRONT_MATTER.courseOutcomes,
    coPoHeaders: override?.coPoHeaders?.map(cleanText).filter(Boolean) || DEFAULT_FRONT_MATTER.coPoHeaders,
    coPoRows:
      override?.coPoRows?.map((row) => row.map(cleanText)) || DEFAULT_FRONT_MATTER.coPoRows,
  };
}

function blankLines(count: number): string {
  const line = "________________________________________________________________________________";
  return new Array(count).fill(line).join("\n");
}

function fallbackMarks(input: {
  aim: string;
  procedure: string;
  program: string;
  output: string;
  result: string;
}): number {
  const section = (text: string, full: number, weak: number, average: number) => {
    const len = cleanText(text).length;
    if (!len) return 0;
    if (len < weak) return full * 0.3;
    if (len < average) return full * 0.7;
    return full;
  };
  return round2(
    clampMarks(
      section(input.aim, 2, 60, 160) +
        section(input.procedure, 2, 100, 260) +
        section(input.program, 3, 140, 360) +
        section(input.output, 2, 60, 170) +
        section(input.result, 1, 40, 110)
    )
  );
}

function toDisplayDate(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB");
}

function isOOSESubject(subjectName: unknown): boolean {
  const name = cleanText(subjectName).toLowerCase();
  return (
    name.includes("oose") ||
    name.includes("object oriented software engineering") ||
    name.includes("object-oriented software engineering")
  );
}

/** Match `numOrNull` semantics — do not treat null as 0 (breaks `??` for marks). */
function pickFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same as unifiedStudentData `asImages` for PDF row merge (attachments JSON string, etc.). */
function coerceExperimentImageList(images: unknown, attachments: unknown): string[] {
  const merge = (v: unknown): string[] => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map((item) => String(item || "").trim()).filter(Boolean);
    if (typeof v === "object" && v !== null) {
      const vals = Object.values(v as Record<string, unknown>);
      if (vals.length > 0) {
        return vals.map((item) => String(item ?? "").trim()).filter(Boolean);
      }
    }
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) return [];
      if (t.startsWith("[") && t.endsWith("]")) {
        try {
          const parsed = JSON.parse(t) as unknown;
          if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item || "").trim()).filter(Boolean);
          }
        } catch {
          return [t];
        }
      }
      return [t];
    }
    return [];
  };
  const a = merge(images);
  if (a.length > 0) return a;
  return merge(attachments);
}

function resolveExperimentFinalMarks(
  row: UnifiedStudentDataResult["experiments"][number],
  rowWithExtra: Record<string, unknown>
): { finalMarks: number; facultyVerified: boolean; aiScoreOutOf10: number } {
  const r = row as { facultyMarks?: number | null; finalMarks?: number; marks?: number; aiScore?: number | null };
  const facultyMarks = pickFiniteNumber(
    rowWithExtra.facultyMarks ?? rowWithExtra.faculty_marks ?? r.facultyMarks
  );
  const finalMarksCol = pickFiniteNumber(
    rowWithExtra.finalMarks ?? rowWithExtra.final_marks ?? r.finalMarks
  );
  const baseMarks = pickFiniteNumber((row as { marks?: number }).marks ?? r.marks);
  const aiRaw = pickFiniteNumber(rowWithExtra.aiScore ?? rowWithExtra.ai_marks ?? r.aiScore);
  const aiScaled =
    aiRaw != null ? clampMarks(aiRaw > 10 ? aiRaw / 10 : aiRaw) : null;

  /** Prefer combined `marks` before legacy columns so re-grades that only touch `marks` win. */
  const resolvedRaw = baseMarks ?? facultyMarks ?? finalMarksCol ?? aiScaled ?? 0;
  const finalMarks = clampMarks(resolvedRaw);
  const facultyVerified =
    facultyMarks != null ||
    finalMarksCol != null ||
    (baseMarks != null && baseMarks > 0) ||
    (aiScaled != null && aiScaled > 0);

  const aiScoreOutOf10 =
    aiRaw != null && Number.isFinite(aiRaw)
      ? clampMarks(aiRaw > 10 ? aiRaw / 10 : aiRaw)
      : 0;

  return { finalMarks, facultyVerified, aiScoreOutOf10 };
}

function normalizeExperiments(data: UnifiedStudentDataResult, subjectName?: string): RecordExperiment[] {
  const rows = Array.isArray(data.experiments) ? data.experiments : [];
  const useOooseTitles = isOOSESubject(subjectName);
  if (!rows.length) {
    return [
      {
        no: 1,
        title: "EXPERIMENT 1",
        date: "",
        aim: "",
        procedure: "",
        program: "",
        output: "",
        result: "",
        vivaQuestions: DEFAULT_VIVA,
        finalMarks: 0,
        aiScore: 0,
        facultyVerified: false,
        images: [],
      },
    ];
  }
  const mapped = rows
    .map((row, idx) => {
      const rowWithExtra = row as typeof row & {
        experimentNo?: number | null;
        experiment_no?: number | null;
        updatedAt?: string | null;
        vivaQuestions?: string[];
        viva?: string;
        procedure?: string;
        sourceCode?: string;
        source_code?: string;
        studentContent?: string;
        student_content?: string;
        content?: string;
        rawText?: string;
        raw_text?: string;
        aiScore?: number | null;
        ai_marks?: number | null;
        facultyMarks?: number | null;
        faculty_marks?: number | null;
        finalMarks?: number | null;
        final_marks?: number | null;
        isOverridden?: boolean | null;
        is_overridden?: boolean | null;
        images?: string[] | null;
      };
      const parsedSections = extractSectionsFromCombinedText(
        cleanText(
          rowWithExtra.studentContent ||
            rowWithExtra.student_content ||
            rowWithExtra.content ||
            rowWithExtra.rawText ||
            rowWithExtra.raw_text
        )
      );
      const aim = cleanText(row.aim || parsedSections.aim);
      const procedure = cleanText(row.algorithm || rowWithExtra.procedure || parsedSections.procedure);
      const program = cleanText(row.program || rowWithExtra.sourceCode || rowWithExtra.source_code || parsedSections.program);
      const output = cleanText(row.output || parsedSections.output);
      const result = cleanText(row.result || parsedSections.result);
      const rowWithDate = rowWithExtra;
      const extractedViva =
        Array.isArray(rowWithDate.vivaQuestions) && rowWithDate.vivaQuestions.length > 0
          ? rowWithDate.vivaQuestions.map((item) => cleanText(item)).filter(Boolean)
          : cleanText(rowWithDate.viva)
              .split("\n")
              .map((item) => cleanText(item).replace(/^\d+[\).]\s*/, ""))
              .filter(Boolean);
      const { finalMarks: explicitMarks, facultyVerified, aiScoreOutOf10 } =
        resolveExperimentFinalMarks(row, rowWithExtra as Record<string, unknown>);
      const experimentNoRaw = String(
        rowWithExtra.experimentNo ?? rowWithExtra.experiment_no ?? idx + 1
      ).trim();
      const numericPart = parseInt(experimentNoRaw.replace(/\D/g, ""), 10);
      const normalizedNo = Math.max(
        1,
        Number.isFinite(numericPart) ? numericPart : Math.trunc(toFinite(experimentNoRaw, idx + 1) || idx + 1)
      );
      const defaultTitle = useOooseTitles
        ? OOSE_EXPERIMENT_TITLES[normalizedNo] || `EXPERIMENT ${normalizedNo}`
        : `EXPERIMENT ${normalizedNo}`;
      const rAny = rowWithDate as any;
      const dateVal =
        toDisplayDate(rAny.completedAt) ||
        toDisplayDate(rAny.completed_at) ||
        toDisplayDate(rAny.submittedAt) ||
        toDisplayDate(rAny.submitted_at) ||
        toDisplayDate(rAny.submittedDate) ||
        toDisplayDate(rAny.updatedAt) ||
        toDisplayDate(rAny.updated_at) ||
        toDisplayDate(rAny.createdAt) ||
        toDisplayDate(rAny.created_at) ||
        "";
      return {
        no: normalizedNo,
        orderKey: experimentNoRaw || String(normalizedNo),
        title: cleanText(row.title) || defaultTitle,
        date: dateVal,
        aim,
        procedure,
        program,
        output,
        result,
        vivaQuestions: extractedViva.length > 0 ? extractedViva : DEFAULT_VIVA,
        finalMarks: clampMarks(explicitMarks),
        aiScore: aiScoreOutOf10,
        facultyVerified,
        images: coerceExperimentImageList(
          rowWithExtra.images,
          (row as { attachments?: unknown }).attachments
        ),
      } as RecordExperiment & { orderKey: string };
    });
  return mapped
    .sort((a, b) => {
      if (a.no !== b.no) return a.no - b.no;
      return String(a.orderKey || "").localeCompare(String(b.orderKey || ""));
    })
    .map((item, index) => ({
      no: item.no || index + 1,
      title: useOooseTitles ? OOSE_EXPERIMENT_TITLES[item.no] || item.title : item.title,
      date: item.date,
      aim: item.aim,
      procedure: item.procedure,
      program: item.program,
      output: item.output,
      result: item.result,
      vivaQuestions: item.vivaQuestions,
      finalMarks: item.finalMarks,
      aiScore: item.aiScore,
      facultyVerified: item.facultyVerified,
      images: item.images,
    }));
}

function topExperimentBox(exp: RecordExperiment) {
  const displayDate = exp.date ? exp.date : "";
  return {
    table: {
      widths: [115, "*"],
      body: [[
        {
          stack: [
            { text: `Expt. No: ${exp.no}`, bold: true, alignment: "left" as const },
            {
              text: `Date: ${displayDate || "___/___/______"}`,
              bold: true,
              fontSize: 9.5,
              color: displayDate ? "#0f172a" : "#64748b",
              alignment: "left" as const,
              margin: [0, 2, 0, 0] as [number, number, number, number],
            },
          ],
        },
        { text: exp.title, alignment: "left" as const, bold: true },
      ]],
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function imageSection(images: string[]) {
  const safeImages = (Array.isArray(images) ? images : []).filter(Boolean).slice(0, 4);
  const cells =
    safeImages.length > 0
      ? safeImages.map((src) => ({
          image: src,
          fit: [240, 140] as [number, number],
          alignment: "center" as const,
          margin: [0, 4, 0, 4] as [number, number, number, number],
        }))
      : [
          {
            stack: [
              { text: "Screenshot / Figure", alignment: "center" as const, bold: true, margin: [0, 10, 0, 6] as [number, number, number, number] },
              { text: "Image placeholder", alignment: "center" as const, italics: true, color: "#475569" },
            ],
            margin: [0, 14, 0, 14] as [number, number, number, number],
          },
        ];

  return {
    stack: [
      { text: "IMAGE / SCREENSHOT", bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
      {
        table: {
          widths: ["*"],
          body: cells.map((cell) => [cell]),
        },
        layout: TABLE_LAYOUT,
      },
    ],
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

function manualSection(title: string, body: string) {
  return {
    stack: [
      { text: `${title}:`, bold: true, margin: [0, 12, 0, 3] as [number, number, number, number] },
      {
        text: cleanText(body) || "",
        margin: [0, 0, 0, 2] as [number, number, number, number],
      },
    ],
  };
}

function wrapLine(line: string, maxChars: number): string[] {
  const input = String(line || "").trimEnd();
  if (!input) return [""];
  if (input.length <= maxChars) return [input];
  const words = input.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines;
}

function toWrappedLines(text: string, maxChars = 95): string[] {
  return cleanText(text)
    .split("\n")
    .flatMap((line) => wrapLine(line, maxChars));
}

function splitSectionByLines(title: string, body: string, maxLines = 38) {
  const lines = toWrappedLines(body || "");
  const chunks: Array<{ title: string; body: string }> = [];
  if (!lines.length) {
    return [{ title, body: blankLines(4) }];
  }
  for (let i = 0; i < lines.length; i += maxLines) {
    const chunk = lines.slice(i, i + maxLines);
    const sectionTitle = i === 0 ? title : `${title} (CONT.)`;
    chunks.push({ title: sectionTitle, body: chunk.join("\n") });
  }
  return chunks;
}

function buildTopHeader(
  record: ManualRecordData,
  assets: Required<ManualAssets>,
  compact = false,
  options?: { dateText?: string; showLogos?: boolean; showLeftLogo?: boolean; showCollegeHeader?: boolean }
) {
  const showCollegeHeader = options?.showCollegeHeader !== false;
  if (!showCollegeHeader) {
    return { text: "", margin: [0, 0, 0, 8] as [number, number, number, number] };
  }
  if (assets.headerBanner) {
    return {
      image: assets.headerBanner,
      width: 511.28,
      alignment: "center" as const,
      margin: [0, 0, 0, compact ? 8 : 10] as [number, number, number, number],
    };
  }
  const leftLogoWidth = compact ? 52 : 60;
  const rightLogoWidth = compact ? 110 : 120;
  const headingSize = compact ? 8.8 : 10.2;
  const subHeadingSize = compact ? 7.3 : 8.6;
  const showLogos = options?.showLogos !== false;
  const showLeftLogo = options?.showLeftLogo !== false;

  return {
    table: {
      widths: [leftLogoWidth, "*", rightLogoWidth],
      body: [[
        showLogos && showLeftLogo && assets.collegeLogoLeft
          ? { image: assets.collegeLogoLeft, fit: [leftLogoWidth, compact ? 52 : 58], alignment: "left" as const }
          : { text: "" },
        {
          stack: [
            { text: "St. PETER'S", color: "#c1121f", bold: true, fontSize: compact ? 17 : 20, alignment: "center" as const },
            {
              text: "COLLEGE OF ENGINEERING AND TECHNOLOGY",
              color: "#c1121f",
              bold: true,
              fontSize: headingSize,
              alignment: "center" as const,
            },
            {
              text: "(An Autonomous Institution)",
              color: "#c1121f",
              bold: true,
              fontSize: subHeadingSize,
              alignment: "center" as const,
              margin: [0, 1, 0, 0] as [number, number, number, number],
            },
            { text: "Affiliated to Anna University | Approved by AICTE", bold: true, fontSize: subHeadingSize, alignment: "center" as const },
            { text: "Avadi, Chennai, Tamilnadu - 600 054", bold: true, fontSize: subHeadingSize, alignment: "center" as const },
          ],
        },
        showLogos && assets.accreditationLogoRight
          ? { image: assets.accreditationLogoRight, fit: [rightLogoWidth, compact ? 48 : 56], alignment: "right" as const }
          : { text: "" },
      ]],
    },
    layout: NO_BORDER_LAYOUT,
    margin: [0, 0, 0, compact ? 8 : 10] as [number, number, number, number],
  };
}

function buildFrontPages(record: ManualRecordData, frontMatter: ManualFrontMatter, assets: Required<ManualAssets>) {
  const outcomesRows = frontMatter.courseOutcomes.map((item) => [item.code, item.description]);
  const compactTopHeaderCourseObjectives = buildTopHeader(record, assets, true, { showLeftLogo: false });
  const fullHeaderBlock = assets.headerBanner
    ? {
        image: assets.headerBanner,
        width: 511.28,
        alignment: "center" as const,
        margin: [0, 0, 0, 14] as [number, number, number, number],
      }
    : {
        table: {
          widths: [52, "*", 110],
          body: [[
            assets.collegeLogoLeft
              ? { image: assets.collegeLogoLeft, fit: [52, 52], alignment: "left" as const }
              : { text: "" },
            {
              stack: [
                { text: "St. PETER'S", color: "#c1121f", bold: true, fontSize: 17, alignment: "center" as const },
                { text: "COLLEGE OF ENGINEERING AND TECHNOLOGY", color: "#c1121f", bold: true, fontSize: 8.8, alignment: "center" as const },
                { text: "(An Autonomous Institution)", color: "#c1121f", bold: true, fontSize: 7.3, alignment: "center" as const, margin: [0, 1, 0, 0] as [number, number, number, number] },
                { text: "Affiliated to Anna University | Approved by AICTE", bold: true, fontSize: 7.3, alignment: "center" as const },
                { text: "Avadi, Chennai, Tamilnadu - 600 054", bold: true, fontSize: 7.3, alignment: "center" as const },
              ],
            },
            assets.accreditationLogoRight
              ? { image: assets.accreditationLogoRight, fit: [110, 48], alignment: "right" as const }
              : { text: "" },
          ]],
        },
        layout: NO_BORDER_LAYOUT,
        margin: [0, 0, 0, 14] as [number, number, number, number],
      };
  /** Same as full header but no top-left college logo (Institution Vision page only). */
  const fullHeaderBlockNoLeftLogo = assets.headerBanner
    ? {
        image: assets.headerBanner,
        width: 511.28,
        alignment: "center" as const,
        margin: [0, 0, 0, 14] as [number, number, number, number],
      }
    : {
        table: {
          widths: ["*", 110],
          body: [[
            {
              stack: [
                { text: "St. PETER'S", color: "#c1121f", bold: true, fontSize: 17, alignment: "center" as const },
                { text: "COLLEGE OF ENGINEERING AND TECHNOLOGY", color: "#c1121f", bold: true, fontSize: 8.8, alignment: "center" as const },
                { text: "(An Autonomous Institution)", color: "#c1121f", bold: true, fontSize: 7.3, alignment: "center" as const, margin: [0, 1, 0, 0] as [number, number, number, number] },
                { text: "Affiliated to Anna University | Approved by AICTE", bold: true, fontSize: 7.3, alignment: "center" as const },
                { text: "Avadi, Chennai, Tamilnadu - 600 054", bold: true, fontSize: 7.3, alignment: "center" as const },
              ],
            },
            assets.accreditationLogoRight
              ? { image: assets.accreditationLogoRight, fit: [110, 48], alignment: "right" as const }
              : { text: "" },
          ]],
        },
        layout: NO_BORDER_LAYOUT,
        margin: [0, 0, 0, 14] as [number, number, number, number],
      };
  const coverDepartment =
    cleanText(record.departmentName).toUpperCase() === "DEPARTMENT OF IT"
      ? "DEPARTMENT OF INFORMATION TECHNOLOGY"
      : cleanText(record.departmentName).toUpperCase();
  return [
    {
      stack: [
        { text: "", margin: [0, 8, 0, 0] as [number, number, number, number] },
        assets.headerBanner
          ? {
              image: assets.headerBanner,
              width: 511.28,
              alignment: "center" as const,
              margin: [0, 0, 0, 26] as [number, number, number, number],
            }
          : {
              table: {
                widths: ["*", 110],
                body: [[
                  {
                    stack: [
                      { text: "St. PETER'S", bold: true, color: "#d00000", fontSize: 22, alignment: "center" as const },
                      {
                        text: "COLLEGE OF ENGINEERING AND TECHNOLOGY",
                        bold: true,
                        color: "#d00000",
                        fontSize: 15,
                        alignment: "center" as const,
                      },
                      { text: "(An Autonomous Institution)", bold: true, color: "#d00000", fontSize: 10.5, alignment: "center" as const },
                      {
                        text: "Affiliated to Anna University | Approved by AICTE",
                        bold: true,
                        fontSize: 8.8,
                        alignment: "center" as const,
                      },
                      { text: "AVADI, CHENNAI - 600054.", bold: true, fontSize: 8.8, alignment: "center" as const },
                    ],
                  },
                  assets.accreditationLogoRight
                    ? { image: assets.accreditationLogoRight, width: 98, alignment: "center" as const }
                    : { text: "" },
                ]],
              },
              layout: NO_BORDER_LAYOUT,
              margin: [0, 0, 0, 26] as [number, number, number, number],
            },
        {
          text: coverDepartment,
          bold: true,
          fontSize: 14,
          alignment: "center" as const,
          margin: [0, 0, 0, 26] as [number, number, number, number],
        },
        assets.collegeLogoLeft
          ? {
              image: assets.collegeLogoLeft,
              width: 130,
              alignment: "center" as const,
              margin: [0, 0, 0, 34] as [number, number, number, number],
            }
          : { text: "", margin: [0, 0, 0, 34] as [number, number, number, number] },
        {
          text: record.subjectName.toUpperCase(),
          bold: true,
          fontSize: 15,
          alignment: "center" as const,
          margin: [0, 0, 0, 30] as [number, number, number, number],
        },
        {
          text: "RECORD NOTEBOOK",
          bold: true,
          fontSize: 16,
          alignment: "center" as const,
          margin: [0, 0, 0, 28] as [number, number, number, number],
        },
        {
          table: {
            widths: [145, 20, "*"],
            body: [
              [
                { text: "NAME", bold: true },
                { text: ":", bold: true, alignment: "center" as const },
                { text: record.studentName ? record.studentName.toUpperCase() : "", bold: true },
              ],
              [
                { text: "REG.NO", bold: true },
                { text: ":", bold: true, alignment: "center" as const },
                { text: record.registerNo && record.registerNo !== "N/A" ? record.registerNo : "", bold: true },
              ],
              [
                { text: "BRANCH", bold: true },
                { text: ":", bold: true, alignment: "center" as const },
                { text: record.branch ? record.branch.toUpperCase() : "", bold: true },
              ],
              [
                { text: "YEAR/SEM", bold: true },
                { text: ":", bold: true, alignment: "center" as const },
                { text: record.yearSemester && record.yearSemester !== "N/A" ? record.yearSemester.toUpperCase() : "", bold: true },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
          margin: [56, 0, 56, 26] as [number, number, number, number],
        },
        {
          text: record.academicYear,
          alignment: "center" as const,
          bold: true,
          fontSize: 13,
          margin: [0, 10, 0, 0] as [number, number, number, number],
        },
      ],
      pageBreak: "after" as const,
    },
    {
      stack: [
        fullHeaderBlockNoLeftLogo,
        assets.collegeLogoLeft
          ? {
              image: assets.collegeLogoLeft,
              width: 122,
              alignment: "center" as const,
              margin: [0, 2, 0, 12] as [number, number, number, number],
            }
          : { text: "" },
        {
          text: coverDepartment,
          bold: true,
          fontSize: 14,
          alignment: "center" as const,
          margin: [0, 0, 0, 12] as [number, number, number, number],
        },
        {
          text: "BONAFIDE CERTIFICATE",
          alignment: "center",
          bold: true,
          fontSize: 15,
          decoration: "underline",
          margin: [0, 0, 0, 12] as [number, number, number, number],
        },
        {
          text: [
            { text: "NAME : ", bold: true },
            { text: record.studentName ? record.studentName.toUpperCase() : "............................................................................................", bold: true },
          ],
          margin: [8, 0, 8, 6] as [number, number, number, number],
        },
        {
          text: [
            { text: "YEAR / SEMESTER : ", bold: true },
            { text: record.yearSemester && record.yearSemester !== "N/A" ? record.yearSemester.toUpperCase() : "............................................................................................", bold: true },
          ],
          margin: [8, 0, 8, 6] as [number, number, number, number],
        },
        {
          text: [
            { text: "BRANCH : ", bold: true },
            { text: record.branch ? record.branch.toUpperCase() : "............................................................................................", bold: true },
          ],
          margin: [8, 0, 8, 6] as [number, number, number, number],
        },
        {
          text: [
            { text: "REGISTER NO : ", bold: true },
            { text: record.registerNo && record.registerNo !== "N/A" ? record.registerNo : "............................................................................................", bold: true },
          ],
          margin: [8, 0, 8, 16] as [number, number, number, number],
        },
        {
          text: "Certified that this bonafide record of work done by the above student of the ____________________",
          margin: [8, 0, 8, 4] as [number, number, number, number],
        },
        {
          text: formatBonafideDuringYearLine(record.academicYear),
          margin: [8, 0, 8, 34] as [number, number, number, number],
        },
        {
          table: {
            widths: ["*", "*"],
            body: [[
              { text: "Faculty-in-Charge", alignment: "left", border: [false, false, false, false] },
              { text: "Head of the Department", alignment: "right", border: [false, false, false, false] },
            ]],
          },
          layout: NO_BORDER_LAYOUT,
          margin: [0, 0, 0, 28] as [number, number, number, number],
        },
        {
          text: "Submitted for the practical Examination held on ..................... at ST. PETER'S COLLEGE",
          margin: [8, 0, 8, 6] as [number, number, number, number],
        },
        {
          text: "OF ENGINEERING AND TECHNOLOGY",
          margin: [8, 0, 8, 34] as [number, number, number, number],
        },
        {
          table: {
            widths: ["*", "*"],
            body: [[
              { text: "INTERNAL EXAMINER", alignment: "left", border: [false, false, false, false], bold: true },
              { text: "EXTERNAL EXAMINER", alignment: "right", border: [false, false, false, false], bold: true },
            ]],
          },
          layout: NO_BORDER_LAYOUT,
          margin: [0, 0, 0, 0] as [number, number, number, number],
        },
      ],
      pageBreak: "after" as const,
    },
    {
      stack: [
        fullHeaderBlockNoLeftLogo,
        { text: "INSTITUTION  VISION", bold: true, decoration: "underline", alignment: "center" as const, margin: [0, 8, 0, 10] as [number, number, number, number] },
        { text: frontMatter.institutionVision, alignment: "justify", margin: [8, 0, 8, 12] as [number, number, number, number] },
        { text: "INSTITUTION  MISSION", bold: true, decoration: "underline", alignment: "center" as const, margin: [0, 0, 0, 8] as [number, number, number, number] },
        { ul: frontMatter.institutionMission, margin: [20, 0, 8, 12] as [number, number, number, number] },
        { text: "DEPARTMENT VISION", bold: true, decoration: "underline", alignment: "center" as const, margin: [0, 2, 0, 8] as [number, number, number, number] },
        { text: frontMatter.departmentVision, alignment: "justify", margin: [8, 0, 8, 12] as [number, number, number, number] },
        { text: "DEPARTMENT MISSION", bold: true, decoration: "underline", alignment: "center" as const, margin: [0, 0, 0, 8] as [number, number, number, number] },
        { ul: frontMatter.departmentMission, margin: [20, 0, 8, 10] as [number, number, number, number] },
      ],
      pageBreak: "after" as const,
    },
    {
      stack: [
        compactTopHeaderCourseObjectives,
        { text: "COURSE OBJECTIVES", bold: true, margin: [0, 0, 0, 8] as [number, number, number, number] },
        { ul: frontMatter.courseObjectives, margin: [14, 0, 0, 12] as [number, number, number, number] },
        { text: "COURSE OUTCOMES", bold: true, margin: [0, 0, 0, 8] as [number, number, number, number] },
        { table: { widths: [60, "*"], body: [[{ text: "CO", bold: true }, { text: "Description", bold: true }], ...outcomesRows] }, layout: TABLE_LAYOUT, margin: [0, 0, 0, 12] as [number, number, number, number] },
        { text: "CO-PO MAPPING TABLE", bold: true, margin: [0, 0, 0, 8] as [number, number, number, number] },
        {
          table: {
            headerRows: 1,
            widths: [40, "*", 30, 30, 30, 30],
            body: [
              ["CO", "Description", "PO1", "PO2", "PO3", "PO4"],
              ...frontMatter.courseOutcomes.map((item, index) => {
                const row = frontMatter.coPoRows[index] || [];
                return [
                  item.code,
                  item.description,
                  row[1] || "-",
                  row[2] || "-",
                  row[3] || "-",
                  row[4] || "-",
                ];
              }),
            ],
          },
          layout: {
            ...TABLE_LAYOUT,
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
          },
          margin: [10, 0, 10, 0] as [number, number, number, number],
        },
      ],
      pageBreak: "after" as const,
    },
  ];
}

function buildIndexPage(experiments: RecordExperiment[], record: ManualRecordData, assets: Required<ManualAssets>) {
  const yearLabel = normalizeAcademicYearValue(record.academicYear);
  return {
    stack: [
      buildTopHeader(record, assets, true, { showLeftLogo: false }),
      {
        text: `ACADEMIC YEAR : ${yearLabel}`,
        alignment: "center" as const,
        bold: true,
        fontSize: 11,
        margin: [0, 0, 0, 10] as [number, number, number, number],
      },
      { text: "INDEX SHEET", alignment: "center", bold: true, fontSize: 15, margin: [0, 0, 0, 20] as [number, number, number, number] },
      {
        table: {
          headerRows: 1,
          // Slightly wider Marks + Instructor columns (index page only); keep Title as flex bulk.
          widths: [28, 40, "*", 40, 40, 48],
          body: [
            ["Exp.\nNo.", "Date", "Title of the Program", "Completion\nDate", "Marks", "Instructor's\nSign"],
            ...experiments.map((exp, idx) => [
              { text: String(idx + 1), alignment: "center" as const },
              "",
              { text: cleanText(exp.title), noWrap: false },
              "",
              { text: exp.finalMarks.toFixed(2), alignment: "center" as const },
              "",
            ]),
          ],
        },
        layout: TABLE_LAYOUT,
      },
      { text: "Internal Marks Awarded: ______", margin: [0, 18, 0, 6] as [number, number, number, number] },
      {
        table: {
          widths: ["*", "*"],
          body: [[
            { text: "Signature of the Faculty Member", border: [false, false, false, false] },
            { text: "Head of the Department", alignment: "right", border: [false, false, false, false] },
          ]],
        },
        layout: NO_BORDER_LAYOUT,
      },
    ],
    pageBreak: "after" as const,
  };
}

function buildExperimentPages(
  experiments: RecordExperiment[],
  assets: Required<ManualAssets>,
  dateText: string,
  record: ManualRecordData
) {
  return experiments.flatMap((exp, idx) => {
    const vivaList = Array.isArray(exp.vivaQuestions)
      ? exp.vivaQuestions.map((item) => cleanText(item)).filter(Boolean)
      : [];
    const contentPage: Record<string, unknown> = {
      stack: [
        buildTopHeader(record, assets, true, { dateText: exp.date || dateText, showLogos: false, showCollegeHeader: false }),
        topExperimentBox(exp),
        manualSection("AIM", exp.aim),
        manualSection("PROCEDURE", exp.procedure),
        manualSection("PROGRAM", exp.program),
        manualSection("OUTPUT", exp.output),
        imageSection(exp.images),
        manualSection("RESULT", exp.result),
      ],
      pageBreak: "after",
    };
    const vivaPage: Record<string, unknown> = {
      stack: [
        buildTopHeader(record, assets, true, { dateText: exp.date || dateText, showLogos: false, showCollegeHeader: false }),
        topExperimentBox(exp),
        { text: "VIVA QUESTIONS", alignment: "center", bold: true, fontSize: 14, margin: [0, 4, 0, 10] as [number, number, number, number] },
        {
          ol: vivaList.length > 0 ? vivaList : DEFAULT_VIVA,
          margin: [14, 0, 0, 18] as [number, number, number, number],
        },
        {
          text: `Faculty Marks: ${exp.facultyVerified ? `${exp.finalMarks.toFixed(2)} / 10` : "Not Evaluated"}`,
          margin: [0, 0, 0, 4] as [number, number, number, number],
        },
        { text: `Faculty Verified: ${exp.facultyVerified && exp.finalMarks > 0 ? "YES" : "NO"}`, margin: [0, 0, 0, 8] as [number, number, number, number] },
        { text: "Signature of the Faculty members with date:", margin: [0, 0, 0, 8] as [number, number, number, number] },
        {
          table: {
            widths: ["*", 140],
            body: [[
              { text: "", border: [false, false, false, false] },
              {
                stack: [
                  assets.digitalSeal
                    ? {
                        image: assets.digitalSeal,
                        fit: [102, 76],
                        alignment: "right",
                        margin: [0, 0, 0, 6] as [number, number, number, number],
                      }
                    : { text: "" },
                  assets.facultySignature
                    ? { image: assets.facultySignature, fit: [108, 34], alignment: "right" }
                    : { text: "" },
                ],
                border: [false, false, false, false],
              },
            ]],
          },
          layout: NO_BORDER_LAYOUT,
        },
      ],
      pageBreak: idx < experiments.length - 1 ? ("after" as const) : undefined,
    };
    return [contentPage, vivaPage];
  });
}

export function buildAnnaManualDocDefinition(payload: RecordPdfPayload) {
  const profile = payload.data.profile;
  const experiments = normalizeExperiments(payload.data, payload.subjectName);
  const frontMatter = mergeFrontMatter(payload.frontMatter);
  const assets = resolveAssets(payload.assets);
  const today = new Date().toLocaleDateString("en-GB");
  const record: ManualRecordData = {
    collegeName: cleanText(payload.collegeName) || "ST. PETER'S COLLEGE OF ENGINEERING AND TECHNOLOGY",
    autonomousLine: "(An Autonomous Institution)",
    affiliatedLine: "Affiliated to Anna University | Approved by AICTE",
    addressLine: "AVADI, CHENNAI - 600054.",
    departmentName: cleanText(payload.departmentName) || `DEPARTMENT OF ${cleanText(profile.department) || "INFORMATION TECHNOLOGY"}`,
    subjectName: cleanText(payload.subjectName) || "LABORATORY SUBJECT",
    studentName: cleanText(payload.studentName) || cleanText(profile.studentName) || "STUDENT",
    registerNo: cleanText(payload.registerNo) || cleanText(profile.registerNo) || "N/A",
    branch: cleanText(payload.branch) || cleanText(profile.department) || "INFORMATION TECHNOLOGY",
    yearSemester: cleanText(payload.yearSemester) || cleanText(profile.yearSemester) || "N/A",
    academicYear: normalizeAcademicYearValue(payload.academicYear),
    experiments,
  };
  return {
    pageSize: PAGE_SIZE,
    pageMargins: PAGE_MARGINS,
    defaultStyle: { font: "Times", fontSize: 11, lineHeight: 1.3 },
    background: () => ({
      canvas: [
        {
          type: "rect",
          x: BORDER_INSET_PT,
          y: BORDER_INSET_PT,
          w: A4_WIDTH - BORDER_INSET_PT * 2,
          h: A4_HEIGHT - BORDER_INSET_PT * 2,
          lineWidth: 1.5,
          lineColor: "#000000",
        },
      ],
    }),
    content: [
      ...buildFrontPages(record, frontMatter, assets),
      buildIndexPage(record.experiments, record, assets),
      ...buildExperimentPages(record.experiments, assets, today, record),
    ],
    info: {
      title: `Record-${record.registerNo}`,
      author: record.collegeName,
      subject: record.subjectName,
      creator: "pdfmake Anna University Manual Generator",
    },
    pageOrientation: "portrait",
  };
}

export async function generateRecordPdf(payload: RecordPdfPayload) {
  const pdfMake = await ensurePdfMakeFonts();
  const bundledAssets = await resolveBundledManualAssets();
  const overrideAssets = payload.assets || {};
  const payloadWithAssets: RecordPdfPayload = {
    ...payload,
    assets: {
      ...bundledAssets,
      ...(overrideAssets.headerBanner ? { headerBanner: overrideAssets.headerBanner } : {}),
      ...(overrideAssets.collegeLogoLeft ? { collegeLogoLeft: overrideAssets.collegeLogoLeft } : {}),
      ...(overrideAssets.accreditationLogoRight
        ? { accreditationLogoRight: overrideAssets.accreditationLogoRight }
        : {}),
      ...(overrideAssets.digitalSeal ? { digitalSeal: overrideAssets.digitalSeal } : {}),
      ...(overrideAssets.facultySignature ? { facultySignature: overrideAssets.facultySignature } : {}),
    },
  };
  const payloadWithEmbeddedImages: RecordPdfPayload = {
    ...payloadWithAssets,
    data: await embedExperimentImagesForPdf(payloadWithAssets.data),
  };
  const docDefinition = buildAnnaManualDocDefinition(payloadWithEmbeddedImages);
  (pdfMake as { createPdf: (definition: Record<string, unknown>) => { download: (name: string) => void } })
    .createPdf(docDefinition as Record<string, unknown>)
    .download(`Record-${cleanText(payload.registerNo) || "student"}.pdf`);
}

