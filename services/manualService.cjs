const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const pdfParseModule = require("pdf-parse");
const { createWorker } = require("tesseract.js");
const OCR_WORKER_IDLE_TTL_MS = 2 * 60 * 1000;
let sharedOcrWorkerPromise = null;
let sharedOcrWorkerIdleTimer = null;

function safeError(message, error) {
  return {
    success: false,
    message,
    error: error || "Operation failed",
    data: null,
  };
}

function safeSuccess(message, data) {
  return {
    success: true,
    message,
    error: null,
    data: data || null,
  };
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, serviceKey);
}

function getFileTitle(fileName) {
  const base = path.basename(String(fileName || "manual"));
  const ext = path.extname(base);
  return base.replace(ext, "") || "manual";
}

async function uploadManual(file) {
  try {
    if (!file || !file.buffer) {
      return safeError("Invalid file", "File buffer is required");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeError(
        "Unable to initialize manual service",
        "Supabase configuration missing"
      );
    }

    const bucketName = process.env.SUPABASE_MANUALS_BUCKET || "manuals";
    const originalName = String(file.originalname || "manual.bin");
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storagePath = `${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return safeError("Failed to upload manual", uploadError.message);
    }

    const { data: publicData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(storagePath);

    const fileUrl = publicData?.publicUrl || "";
    const title = getFileTitle(originalName);

    const { data: insertedManual, error: insertError } = await supabase
      .from("manuals")
      .insert({
        title,
        file_url: fileUrl,
      })
      .select("id, title, file_url, uploaded_at, extracted_text, is_processed")
      .single();

    let data = insertedManual;
    if (insertError) {
      const duplicateTitle = /duplicate key|unique_manual_title/i.test(
        String(insertError.message || "")
      );

      if (!duplicateTitle) {
        return safeError("Failed to save manual record", insertError.message);
      }

      // If the title already exists, reuse that row and overwrite file_url so
      // re-uploads of the same manual name can trigger fresh extraction.
      const { data: updatedManual, error: updateExistingError } = await supabase
        .from("manuals")
        .update({
          file_url: fileUrl,
          extracted_text: "",
          is_processed: false,
        })
        .eq("title", title)
        .select("id, title, file_url, uploaded_at, extracted_text, is_processed")
        .single();

      if (updateExistingError || !updatedManual) {
        return safeError(
          "Failed to save manual record",
          updateExistingError?.message || "Unable to load existing manual"
        );
      }

      data = updatedManual;
    }

    let extractedText = String(data?.extracted_text || "");
    const isProcessed = data?.is_processed === true;

    if (isProcessed) {
      console.log("Manual already processed — using cached text");
    } else {
      console.log("Manual not processed — running extraction");
      extractedText = await extractText(file);
      const hasExtractedText = String(extractedText || "").trim().length > 0;
      if (!hasExtractedText) {
        console.warn(
          "Manual extraction produced empty text; keeping is_processed=false for safe retry"
        );
      }

      const { error: updateError } = await supabase
        .from("manuals")
        .update({
          extracted_text: extractedText,
          is_processed: hasExtractedText,
        })
        .eq("id", data.id);

      if (updateError) {
        console.error("Failed to update manual extraction cache:", updateError);
      }
    }

    // Pass cached/fresh extracted text to downstream route flow
    if (file && typeof file === "object") {
      file.__cachedExtractedText = extractedText;
      file.__manualProcessed = String(extractedText || "").trim().length > 0;
    }

    return safeSuccess("Manual uploaded", {
      manual_id: data.id,
      file_url: data.file_url,
      title: data.title,
      uploaded_at: data.uploaded_at,
      extracted_text: extractedText,
    });
  } catch (error) {
    return safeError("Failed to upload manual", error?.message || "Unexpected error");
  }
}

async function getSharedOcrWorker() {
  if (!sharedOcrWorkerPromise) {
    sharedOcrWorkerPromise = createWorker("eng").catch((error) => {
      sharedOcrWorkerPromise = null;
      throw error;
    });
  }
  return sharedOcrWorkerPromise;
}

async function scheduleOcrWorkerCleanup() {
  if (sharedOcrWorkerIdleTimer) {
    clearTimeout(sharedOcrWorkerIdleTimer);
  }
  sharedOcrWorkerIdleTimer = setTimeout(async () => {
    if (!sharedOcrWorkerPromise) return;
    try {
      const worker = await sharedOcrWorkerPromise;
      await worker.terminate();
    } catch (error) {
      console.error("extractText: shared OCR worker terminate failed", error);
    } finally {
      sharedOcrWorkerPromise = null;
      sharedOcrWorkerIdleTimer = null;
    }
  }, OCR_WORKER_IDLE_TTL_MS);
}

async function runImageOcr(buffer) {
  try {
    const worker = await getSharedOcrWorker();
    const { data } = await worker.recognize(buffer);
    const text = String(data?.text || "");
    console.log("extractText: OCR extracted text length =", text.length);
    await scheduleOcrWorkerCleanup();
    return text;
  } catch (ocrError) {
    console.error("extractText: OCR extract failed", ocrError);
    sharedOcrWorkerPromise = null;
    return "";
  }
}

async function parsePdfBuffer(buffer) {
  const legacyPdfParse = pdfParseModule?.default || pdfParseModule;
  if (typeof legacyPdfParse === "function") {
    const parsed = await legacyPdfParse(buffer);
    return String(parsed?.text || "");
  }

  if (typeof pdfParseModule?.PDFParse === "function") {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return String(parsed?.text || "");
    } finally {
      await parser.destroy();
    }
  }

  throw new Error("Unsupported pdf-parse API shape");
}

async function extractText(file) {
  try {
    if (
      file &&
      typeof file.__cachedExtractedText === "string" &&
      file.__cachedExtractedText.length >= 0
    ) {
      return file.__cachedExtractedText;
    }

    if (!file || !file.buffer) {
      console.warn("extractText: missing file buffer");
      return "";
    }

    console.log("extractText: buffer length =", file.buffer.length);

    const mime = String(file.mimetype || "").toLowerCase();
    const originalName = String(file.originalname || "").toLowerCase();
    const isPdf = mime.includes("pdf") || originalName.endsWith(".pdf");
    const isImage = mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp|tiff?)$/.test(originalName);

    if (isPdf) {
      try {
        const text = await parsePdfBuffer(file.buffer);

        console.log("extractText: extracted text length =", text.length);

        // OCR fallback is expensive and can make upload appear stuck.
        // Keep it opt-in so faculty upload returns quickly by default.
        const enablePdfOcrFallback =
          String(process.env.MANUAL_ENABLE_PDF_OCR || "").toLowerCase() === "true";

        // If PDF has no selectable text, optionally fallback to OCR.
        if ((!text || text.trim().length < 100) && enablePdfOcrFallback) {
          console.log("PDF text empty — running OCR fallback (enabled)");
          const ocrText = await runImageOcr(file.buffer);
          console.log("OCR extracted length =", ocrText.length);
          return ocrText;
        }

        return text;
      } catch (pdfError) {
        console.error("extractText: PDF parse failed", pdfError);
        return "";
      }
    }

    if (isImage) {
      return runImageOcr(file.buffer);
    }

    const fallbackText = String(file.buffer.toString("utf8") || "");
    console.log("extractText: fallback text length =", fallbackText.length);
    return fallbackText;
  } catch (error) {
    console.error("extractText error:", error);
    return "";
  }
}

function extractExperimentTitles(text) {
  try {
    const source = String(text || "");
    if (!source.trim()) return ["Experiment 1"];

    // Priority 1: Index Sheet or List of Experiments table extraction
    const indexSheetTitles = extractTitlesFromIndexSheet(source);
    if (indexSheetTitles.length >= 2) {
      const uniqueFromIndex = dedupeTitles(indexSheetTitles);
      if (uniqueFromIndex.length > 0) {
        return uniqueFromIndex;
      }
    }

    // Priority 2: List Section
    const listSectionTitles = extractTitlesFromListSection(source);
    if (listSectionTitles.length >= 2) {
      const uniqueFromList = dedupeTitles(listSectionTitles);
      if (uniqueFromList.length > 0) {
        return uniqueFromList;
      }
    }

    // Priority 3: Heading-based (EXPT NO: 1 ...)
    const headingTitles = extractTitlesFromExperimentHeadings(source);
    if (headingTitles.length >= 2) {
      const uniqueFromHeadings = dedupeTitles(headingTitles);
      if (uniqueFromHeadings.length > 0) {
        return uniqueFromHeadings;
      }
    }

    // Priority 4: Block-based fallback
    const blocks = parseExperimentBlocks(source);
    if (!blocks.length) {
      return ["Experiment 1"];
    }

    const titles = blocks.map((block, index) => {
      const inferred = inferExperimentTitleFromBlock(block.body, block.number, index);
      return inferred || `Experiment ${block.number || index + 1}`;
    });

    const unique = dedupeTitles(titles);
    return unique.length ? unique : ["Experiment 1"];
  } catch (error) {
    console.error("extractExperimentTitles error:", error);
    return ["Experiment 1"];
  }
}

function extractExperimentTitlesFromText(text) {
  return extractExperimentTitles(text);
}

function extractTitlesFromIndexSheet(sourceText) {
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const start = lines.findIndex((line) =>
    /^(index\s*sheet|list\s*of\s*experiments?|table\s*of\s*contents?)$/i.test(line.trim()) ||
    /index\s*sheet/i.test(line) ||
    /list\s*of\s*experiments?/i.test(line)
  );
  if (start < 0) return [];

  const titles = [];
  let inTable = false;

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (
      /^(internal\s*marks|signature\s*of|head\b|course\s*outcome|viva\s*questions|expt?\s*no[:\s]*1\b)/i.test(line) ||
      /^content\s*beyond\s*the\s*syllabus/i.test(line)
    ) {
      break;
    }

    const rowMatch = line.match(/^(\d{1,2})[\s.):\-]\s*(.+)?$/i);
    if (rowMatch) {
      inTable = true;
      let title = String(rowMatch[2] || "").trim();
      let cursor = i + 1;

      while (cursor < lines.length) {
        const next = lines[cursor];
        if (
          /^(\d{1,2})[\s.):\-]/i.test(next) ||
          /^(internal\s*marks|signature\s*of|head\b|course\s*outcome|viva|expt?\s*no[:\s]*\d+)/i.test(next) ||
          /^content\s*beyond/i.test(next) ||
          /^date\b/i.test(next) ||
          /^marks\b/i.test(next) ||
          /^sign\b/i.test(next)
        ) {
          break;
        }
        if (!isNoiseLine(next) && next.length > 2) {
          title = `${title} ${next}`.trim();
        }
        cursor += 1;
      }

      const cleaned = sanitizeCandidateTitle(title);
      if (cleaned && cleaned.length >= 3) {
        titles.push(cleaned);
      }
    } else if (inTable && titles.length >= 10) {
      break;
    }
  }

  return titles;
}

function extractTitlesFromExperimentHeadings(sourceText) {
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const titles = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^expt?\.?\s*no\.?\s*([0-9]+\s*[a-z]?)\s*(.*)$/i);
    if (!match) continue;

    let title = String(match[2] || "").trim();
    let cursor = i + 1;

    while (cursor < lines.length && (!title || title.length < 18)) {
      const next = lines[cursor];
      if (
        /^(aim|procedure|result|viva questions?|sample output|expected output)\b/i.test(next) ||
        /^--\s*\d+\s+of\s+\d+\s*--$/i.test(next) ||
        /^expt?\.?\s*no\.?/i.test(next)
      ) {
        break;
      }
      if (!isNoiseLine(next)) {
        title = `${title} ${next}`.trim();
      }
      cursor += 1;
    }

    const cleaned = sanitizeCandidateTitle(
      title
        .replace(/\bdate\s*[:\-].*$/i, "")
        .replace(/\s+/g, " ")
        .trim()
    );

    if (cleaned) {
      titles.push(cleaned);
    }
  }

  return titles;
}

function extractTitlesFromListSection(sourceText) {
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const startIndex = lines.findIndex((line) => /list of experiments?/i.test(line));
  if (startIndex < 0) return [];

  const titles = [];
  let numberedHits = 0;
  let staleRows = 0;

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (
      /^(course outcomes?|program outcomes?|co\d+|po\d+|mapping|evaluation scheme|record\s*page)/i.test(
        lower
      )
    ) {
      break;
    }

    const numbered = line.match(/^(\d{1,2})\s*[\).:-]\s*(.+)$/);
    if (numbered) {
      const candidate = sanitizeCandidateTitle(numbered[2]);
      if (candidate) {
        titles.push(candidate);
        numberedHits += 1;
      }
      staleRows = 0;
      continue;
    }

    // Handle wrapped lines that continue the previous numbered item.
    if (titles.length > 0 && !/^\d{1,2}\s*$/.test(line) && !isNoiseLine(line)) {
      const last = titles[titles.length - 1];
      if (last.length < 90 && line.length < 90) {
        const merged = sanitizeCandidateTitle(`${last} ${line}`);
        if (merged) {
          titles[titles.length - 1] = merged;
        }
      }
      staleRows += 1;
    } else {
      staleRows += 1;
    }

    // Stop if we already found list items and moved far away from that section.
    if (numberedHits > 0 && staleRows > 12) {
      break;
    }
  }

  return titles;
}

function parseExperimentBlocks(sourceText) {
  const source = String(sourceText || "");
  const markerRegex = /EX\.?\s*NO\s*[:.\-]?\s*(\d+)?/gi;
  const matches = [...source.matchAll(markerRegex)];
  if (!matches.length) return [];

  const blocks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? source.length : source.length;
    const number = String(matches[i][1] || "").trim();
    const body = source.slice(start, end);
    blocks.push({ number, body });
  }
  return blocks;
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isQuestionLikeLine(line) {
  const value = normalizeLine(line);
  if (!value) return false;
  const lower = value.toLowerCase();
  if (value.includes("?")) return true;
  if (/^(what|who|why|how|which|when|where|define|explain|list|write|state|differentiate|compare)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function isNoiseLine(line) {
  const value = normalizeLine(line).toLowerCase();
  if (!value) return true;

  const noisePatterns = [
    /^date[:\s-]*$/,
    /^date[:\s-]+\d/,
    /^st\.?\s*peter/i,
    /^marks awarded/i,
    /^signature/i,
    /^register/i,
    /^page\s*\d+/i,
    /^department/i,
    /^result[:\s-]*$/,
    /^aim[:\s-]*$/,
    /^requirements?[:\s-]*$/,
    /^source code[:\s-]*$/,
    /^viva questions?[:\s-]*$/,
    /^thus\b/i,
    /^\d+$/,
  ];

  return noisePatterns.some((pattern) => pattern.test(value));
}

function sanitizeCandidateTitle(input) {
  let value = normalizeLine(input);
  if (!value) return "";

  value = value
    .replace(/^ex\.?\s*no\.?\s*[:.\-]?\s*\d+\s*[:\-.)]?\s*/i, "")
    .replace(/^experiment\s*\d+\s*[:\-.)]?\s*/i, "")
    .replace(/^aim\s*[:\-]\s*/i, "")
    .replace(/^date\s*[:\-]\s*/i, "")
    .replace(/^title\s*[:\-]\s*/i, "")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
    .replace(/total periods?.*$/i, "")
    .trim();

  // Prefer concise display titles for long list-style experiment lines.
  if (value.includes(". ")) {
    const firstSentence = value.split(". ")[0]?.trim();
    if (firstSentence && firstSentence.length >= 10) {
      value = firstSentence;
    }
  }

  // Remove common continuation clauses from list extraction artifacts.
  value = value
    .replace(/\s+allocate\b.*$/i, "")
    .replace(/\s+memory and storage space.*$/i, "")
    .replace(/\s+(?:\d+|[a-z])(?:\s+(?:\d+|[a-z])){2,}$/i, "")
    .replace(/\s+\d+$/i, "")
    .trim();

  if (!value || isNoiseLine(value)) return "";
  if (isQuestionLikeLine(value)) return "";

  // Prefer reasonable title length and avoid OCR garbage fragments.
  if (value.length < 4) return "";
  if (value.length > 140) value = value.slice(0, 140).trim();

  // OCR/line-merge artifact fix: first letter sometimes gets dropped.
  const lower = value.toLowerCase();
  const leadRepairs = [
    ["evelop", "Develop"],
    ["tudy", "Study"],
    ["mplement", "Implement"],
    ["reate", "Create"],
    ["esign", "Design"],
    ["nalyze", "Analyze"],
    ["uild", "Build"],
  ];
  for (const [broken, fixed] of leadRepairs) {
    if (lower.startsWith(`${broken} `) || lower === broken) {
      value = `${fixed}${value.slice(broken.length)}`;
      break;
    }
  }

  // Ensure consistent sentence-style first letter.
  if (/^[a-z]/.test(value)) {
    value = value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

function expandShortTitle(title) {
  const value = sanitizeCandidateTitle(title);
  if (!value) return "";
  if (/^(foreign trading system|conference management system|bpo management system|library management system)$/i.test(value)) {
    return value;
  }
  return value;
}

function inferExperimentTitleFromBlock(blockBody, number, index) {
  const lines = String(blockBody || "")
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);
  const sectionStartIdx = lines.findIndex((line) =>
    /^(aim|requirements?|source code|result|viva questions?)\b/i.test(line)
  );
  const headingWindow =
    sectionStartIdx >= 0 ? lines.slice(0, sectionStartIdx) : lines.slice(0, Math.min(lines.length, 6));

  // Candidate 1: explicit text on EX NO line.
  if (headingWindow.length) {
    const exLine = headingWindow[0];
    const fromExLine = sanitizeCandidateTitle(exLine);
    if (fromExLine && !/^experiment\s*\d+$/i.test(fromExLine)) {
      return fromExLine;
    }
  }

  // Candidate 2: AIM line often contains "To <title>" in lab manuals.
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!lower.startsWith("aim")) continue;
    const candidate = sanitizeCandidateTitle(line);
    if (!candidate) continue;
    if (/^to\s+/i.test(candidate)) {
      return candidate.replace(/^to\s+/i, "").trim();
    }
    return candidate;
  }

  // Candidate 3: first meaningful non-noise heading line only.
  for (const line of headingWindow) {
    const candidate = sanitizeCandidateTitle(line);
    if (candidate) return candidate;
  }

  return `Experiment ${number || index + 1}`;
}

function dedupeTitles(titles) {
  const unique = [];
  const seen = new Set();
  for (const raw of titles || []) {
    const title = sanitizeCandidateTitle(raw);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(title);
  }
  return unique;
}

function isLikelyNoisyTitle(title) {
  const normalized = normalizeLine(title);
  const value = normalized.toLowerCase();
  if (!value) return true;
  const sanitized = sanitizeCandidateTitle(normalized);

  return (
    isNoiseLine(value) ||
    isQuestionLikeLine(value) ||
    /^date[:\s-]*/i.test(value) ||
    /^st\.?\s*peter/i.test(value) ||
    /^ex\.?\s*no/i.test(value) ||
    !sanitized
  );
}

function detectSubjectNameFromFileName(fileName) {
  const source = String(fileName || "").toUpperCase();
  if (source.includes("OOSE")) {
    return "OBJECT ORIENTED SOFTWARE ENGINEERING LABORATORY";
  }
  if (source.includes("NN")) {
    return "NEURAL NETWORK AND DEEP LEARNING LABORATORY";
  }
  if (source.includes("MAD")) {
    return "MOBILE APPLICATIONS DEVELOPMENT LABORATORY";
  }
  return null;
}

async function processAllManualsFromStorage(options = {}) {
  const force = options?.force === true;
  const supabase = getSupabaseClient();
  const bucketName = process.env.SUPABASE_MANUALS_BUCKET || "manuals";
  const limit = 100;

  let offset = 0;
  const allFiles = [];

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list("", { limit, offset, sortBy: { column: "name", order: "asc" } });

    if (error) {
      throw new Error(`Failed to list manuals bucket: ${error.message}`);
    }

    const page = Array.isArray(data) ? data : [];
    allFiles.push(...page);

    if (page.length < limit) break;
    offset += limit;
  }

  const pdfFiles = allFiles.filter((file) =>
    String(file?.name || "")
      .toLowerCase()
      .endsWith(".pdf")
  );

  const fileUrlByName = new Map();
  for (const file of pdfFiles) {
    const fileName = String(file?.name || "");
    const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    fileUrlByName.set(fileName, String(publicData?.publicUrl || ""));
  }

  const fileUrls = [...fileUrlByName.values()].filter(Boolean);
  const manualByFileUrl = new Map();
  if (fileUrls.length > 0) {
    const { data: manualRows, error: manualError } = await supabase
      .from("manuals")
      .select("id, file_url, is_processed")
      .in("file_url", fileUrls);

    if (manualError) {
      throw new Error(`Failed to read manuals table: ${manualError.message}`);
    }

    for (const row of manualRows || []) {
      manualByFileUrl.set(String(row.file_url || ""), row);
    }
  }

  const requiredSubjectNames = [
    "OBJECT ORIENTED SOFTWARE ENGINEERING LABORATORY",
    "NEURAL NETWORK AND DEEP LEARNING LABORATORY",
    "MOBILE APPLICATIONS DEVELOPMENT LABORATORY",
  ];

  const { data: subjectRows, error: subjectError } = await supabase
    .from("subjects")
    .select("id, name")
    .in("name", requiredSubjectNames);

  if (subjectError) {
    throw new Error(`Failed to fetch subjects: ${subjectError.message}`);
  }

  const subjectIdByName = new Map();
  for (const row of subjectRows || []) {
    subjectIdByName.set(String(row.name || ""), row.id);
  }

  let processedFiles = 0;
  let skippedAlreadyProcessed = 0;
  let skippedNoSubject = 0;
  let failedFiles = 0;
  let experimentsExtracted = 0;
  let experimentsInserted = 0;

  for (const file of pdfFiles) {
    const fileName = String(file?.name || "");
    const fileUrl = String(fileUrlByName.get(fileName) || "");

    console.log("Processing:", fileName);

    if (!fileUrl) {
      failedFiles += 1;
      console.error(`Failed to build public URL for ${fileName}`);
      continue;
    }

    const manualRow = manualByFileUrl.get(fileUrl);
    if (!force && manualRow?.is_processed === true) {
      skippedAlreadyProcessed += 1;
      continue;
    }

    const subjectName = detectSubjectNameFromFileName(fileName);
    if (!subjectName) {
      skippedNoSubject += 1;
      console.warn(`Skipping file with unknown subject mapping: ${fileName}`);
      continue;
    }

    const subjectId = subjectIdByName.get(subjectName);
    if (!subjectId) {
      skippedNoSubject += 1;
      console.warn(`Subject missing in subjects table: ${subjectName}`);
      continue;
    }

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);
      const extractedText = await extractText({
        buffer: fileBuffer,
        mimetype: "application/pdf",
        originalname: fileName,
      });

      const titles = extractExperimentTitlesFromText(extractedText);
      experimentsExtracted += titles.length;

      if (titles.length > 0) {
        const payload = titles.map((title) => ({
          title,
          subject_id: subjectId,
        }));

        const { data: insertedRows, error: insertError } = await supabase
          .from("experiments")
          .upsert(payload, {
            onConflict: "title,subject_id",
            ignoreDuplicates: true,
          })
          .select("id");

        if (insertError) {
          const message = String(insertError.message || "");
          const missingUniqueConstraint =
            /no unique|constraint|on conflict/i.test(message);

          if (!missingUniqueConstraint) {
            throw new Error(`Failed to insert experiments: ${insertError.message}`);
          }

          // Fallback when DB is missing UNIQUE(title, subject_id).
          const { data: existingRows, error: existingError } = await supabase
            .from("experiments")
            .select("title")
            .eq("subject_id", subjectId)
            .in("title", titles);

          if (existingError) {
            throw new Error(
              `Failed duplicate-check fallback for experiments: ${existingError.message}`
            );
          }

          const existingTitleSet = new Set(
            (existingRows || []).map((row) => String(row.title || "").toLowerCase())
          );
          const missingPayload = payload.filter(
            (row) => !existingTitleSet.has(String(row.title || "").toLowerCase())
          );

          if (missingPayload.length > 0) {
            const { data: fallbackInserted, error: fallbackError } = await supabase
              .from("experiments")
              .insert(missingPayload)
              .select("id");

            if (fallbackError) {
              throw new Error(`Failed to insert experiments: ${fallbackError.message}`);
            }

            experimentsInserted += Array.isArray(fallbackInserted)
              ? fallbackInserted.length
              : 0;
          }
        } else {
          experimentsInserted += Array.isArray(insertedRows) ? insertedRows.length : 0;
        }
      }

      const { error: markError } = await supabase
        .from("manuals")
        .update({ is_processed: true, extracted_text: extractedText })
        .eq("file_url", fileUrl);

      if (markError) {
        console.error(`Failed to mark manual as processed (${fileName}):`, markError);
      }

      processedFiles += 1;
    } catch (error) {
      failedFiles += 1;
      console.error(`Failed processing manual (${fileName}):`, error);
    }
  }

  return {
    processed_files: processedFiles,
    experiments_extracted: experimentsExtracted,
    experiments_inserted: experimentsInserted,
    force_reprocess: force,
    skipped_already_processed: skippedAlreadyProcessed,
    skipped_no_subject: skippedNoSubject,
    failed_files: failedFiles,
  };
}

function extractSection(block, label) {
  try {
    const normalizedBlock = String(block || "");
    const allLabels = [
      "AIM",
      "REQUIREMENTS",
      "SOURCE CODE",
      "RESULT",
      "VIVA QUESTIONS",
    ];
    const regex = new RegExp(
      label + "\\s*:(.*?)((AIM|REQUIREMENTS|SOURCE CODE|RESULT|VIVA QUESTIONS)\\s*:|$)",
      "is"
    );
    const match = normalizedBlock.match(regex);
    if (!match) return "";
    return String(match[1] || "")
      .replace(/\s+\n/g, "\n")
      .trim();
  } catch (error) {
    console.error(`extractSection error for ${label}:`, error);
    return "";
  }
}

function buildStructuredExperiments(sourceText, fallback = {}) {
  try {
    const text = String(sourceText || "");
    if (!text.trim()) {
      return [];
    }

    const experimentBlocks = text.split(/EX\.?\s*NO[:\.\-]?\s*\d+/gi);
    if (
      experimentBlocks.length &&
      !String(experimentBlocks[0] || "").trim()
    ) {
      experimentBlocks.shift();
    }

    const blocks = experimentBlocks.filter((block) => String(block || "").trim());
    const experiments = blocks.map((block, index) => {
      const title = inferExperimentTitleFromBlock(block, String(index + 1), index);

      const aim = extractSection(block, "AIM");
      const requirements = extractSection(block, "REQUIREMENTS");
      const sourceCode = extractSection(block, "SOURCE CODE");
      const result = extractSection(block, "RESULT");
      const viva = extractSection(block, "VIVA QUESTIONS");

      const structuredContent = {
        aim,
        requirements,
        source_code: sourceCode,
        result,
        viva,
        raw_text: String(block || "").trim(),
      };

      return {
        experiment_title: title,
        content: JSON.stringify(structuredContent),
        content_type: detectContentType(
          [aim, requirements, sourceCode, result, viva, structuredContent.raw_text]
            .filter(Boolean)
            .join("\n")
        ),
        image_url: fallback.image_url || null,
      };
    });

    console.log("manual extraction: experiments detected =", experiments.length);
    if (experiments.length && experiments.length < 15) {
      console.warn(
        "manual extraction: detected fewer than expected experiments for OOSE-style manuals:",
        experiments.length
      );
    }

    return experiments;
  } catch (error) {
    console.error("buildStructuredExperiments error:", error);
    return [];
  }
}

function detectContentType(text, imageCount = 0) {
  try {
    const body = String(text || "");
    const lower = body.toLowerCase();
    const hasCode =
      lower.includes("#include") ||
      lower.includes("public class") ||
      lower.includes("<html") ||
      lower.includes("int main") ||
      lower.includes("{") ||
      lower.includes(";");

    const hasImage = Number(imageCount || 0) > 0;
    const shortText = body.trim().length < 120;

    if (hasCode && hasImage) return "mixed";
    if (hasCode) return "code";
    if (hasImage && shortText) return "image";
    if (hasImage) return "mixed";
    return "text";
  } catch (error) {
    console.error("detectContentType error:", error);
    return "text";
  }
}

async function saveExperiments(manualId, data) {
  try {
    if (!manualId) {
      return safeError("Invalid manual id", "manualId is required");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeError(
        "Unable to initialize manual service",
        "Supabase configuration missing"
      );
    }

    const rows = Array.isArray(data) ? data : [];
    const firstTextRow = rows.find(
      (item) => typeof item?.content === "string" && item.content.trim().length > 0
    );

    const structuredExperiments = buildStructuredExperiments(
      firstTextRow?.content || "",
      {
        image_url: rows[0]?.image_url || null,
      }
    );

    const normalizedRows =
      structuredExperiments.length > 0
        ? structuredExperiments
        : rows.map((item, index) => {
            const body =
              typeof item?.content === "string" ? item.content : String(item?.content || "");
            return {
              experiment_title: item?.experiment_title || `Experiment ${index + 1}`,
              content: JSON.stringify({
                aim: "",
                requirements: "",
                source_code: "",
                result: "",
                viva: "",
                raw_text: body,
              }),
              content_type: item?.content_type || detectContentType(body),
              image_url: item?.image_url || null,
            };
          });

    const payload = normalizedRows.map((item, index) => ({
      manual_id: manualId,
      experiment_title: item?.experiment_title || `Experiment ${index + 1}`,
      content: item?.content || "",
      content_type: item?.content_type || "text",
      image_url: item?.image_url || null,
    }));

    if (!payload.length) {
      payload.push({
        manual_id: manualId,
        experiment_title: "Experiment 1",
        content: "",
        content_type: "text",
        image_url: null,
      });
    }

    const { data: inserted, error } = await supabase
      .from("manual_experiments")
      .insert(payload)
      .select("*");

    if (error) {
      return safeError("Failed to save experiments", error.message);
    }

    return safeSuccess("Experiments saved", inserted || []);
  } catch (error) {
    return safeError("Failed to save experiments", error?.message || "Unexpected error");
  }
}

async function syncExperimentsToSubject(subjectId, titles = [], options = {}) {
  try {
    const replaceExisting = options?.replaceExisting === true;
    const safeSubjectId = String(subjectId || "").trim();
    if (!safeSubjectId) {
      return safeError("Invalid subject id", "subjectId is required");
    }

    const normalizedTitles = (Array.isArray(titles) ? titles : [])
      .map((title) => String(title || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (!normalizedTitles.length) {
      return safeSuccess("No experiment titles to sync", []);
    }

    const supabase = getSupabaseClient();

    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from("experiments")
        .delete()
        .eq("subject_id", safeSubjectId);
      if (deleteError) {
        console.warn("syncExperimentsToSubject: delete existing failed:", deleteError.message);
      }
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("experiments")
      .select("id, title, subject_id")
      .in("title", normalizedTitles);

    if (existingError) {
      return safeError("Failed to sync experiments", existingError.message);
    }

    const existingByTitle = new Map();
    for (const row of existingRows || []) {
      const key = String(row.title || "").toLowerCase();
      if (!key || existingByTitle.has(key)) continue;
      existingByTitle.set(key, row);
    }

    const alreadyLinked = [];
    const payload = [];
    let skippedGlobalConflicts = 0;

    for (const title of normalizedTitles) {
      const key = title.toLowerCase();
      const existing = existingByTitle.get(key);
      if (!existing) {
        payload.push({ title, subject_id: safeSubjectId });
        continue;
      }

      if (String(existing.subject_id || "") === safeSubjectId) {
        alreadyLinked.push(existing);
      } else {
        // DB has a global unique title constraint, so this title cannot be reused
        // for another subject without schema changes.
        skippedGlobalConflicts += 1;
      }
    }

    let insertedRows = [];
    if (payload.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("experiments")
        .upsert(payload, {
          onConflict: "title",
          ignoreDuplicates: true,
        })
        .select("id, title, subject_id");

      if (insertError) {
        return safeError("Failed to sync experiments", insertError.message);
      }
      insertedRows = inserted || [];
    }

    // Cleanup obviously noisy legacy extracted titles for this subject so students
    // don't keep seeing header artifacts like "DATE:" or institution name lines.
    const { data: subjectRows, error: subjectRowsError } = await supabase
      .from("experiments")
      .select("id, title")
      .eq("subject_id", safeSubjectId);

    if (subjectRowsError) {
      return safeError("Failed to sync experiments", subjectRowsError.message);
    }

    const incomingSet = new Set(normalizedTitles.map((title) => title.toLowerCase()));
    const deleteIds = (subjectRows || [])
      .filter((row) => {
        const original = normalizeLine(row.title || "");
        const canonical = sanitizeCandidateTitle(original);
        const originalKey = original.toLowerCase();
        const canonicalKey = canonical.toLowerCase();

        if (replaceExisting && !incomingSet.has(originalKey)) {
          return true;
        }

        if (/^experiment\s*1$/i.test(original) && normalizedTitles.length > 3) {
          return true;
        }

        if (isLikelyNoisyTitle(original) && !incomingSet.has(originalKey)) {
          return true;
        }

        // When a fresh extraction provides a healthy title set, remove stale long
        // legacy rows that are not part of this incoming extraction.
        if (
          normalizedTitles.length >= 5 &&
          !incomingSet.has(originalKey) &&
          (original.length > 95 ||
            /\ballocate\b/i.test(original) ||
            /\bguest os\b/i.test(original) ||
            /\bopen source tool\b/i.test(original))
        ) {
          return true;
        }

        // Remove prefixed/dirty variants like "DATE: STUDY OF UML" when canonical
        // cleaned title exists in incoming list.
        if (canonical && canonicalKey !== originalKey && incomingSet.has(canonicalKey)) {
          return true;
        }

        return false;
      })
      .map((row) => row.id);

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("experiments")
        .delete()
        .in("id", deleteIds);
      if (deleteError) {
        return safeError("Failed to sync experiments", deleteError.message);
      }
    }

    return safeSuccess("Experiments synced", {
      inserted_count: insertedRows.length,
      already_linked_count: alreadyLinked.length,
      skipped_global_conflicts: skippedGlobalConflicts,
      deleted_noisy_count: deleteIds.length,
      inserted_rows: insertedRows,
    });
  } catch (error) {
    return safeError("Failed to sync experiments", error?.message || "Unexpected error");
  }
}

module.exports = {
  getSupabaseClient,
  uploadManual,
  extractText,
  extractExperimentTitles,
  extractExperimentTitlesFromText,
  processAllManualsFromStorage,
  detectContentType,
  saveExperiments,
  syncExperimentsToSubject,
};
