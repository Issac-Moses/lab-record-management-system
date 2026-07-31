const pdfParseModule = require("pdf-parse");

function normalizePdfText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfTextWithPages(buffer) {
  const pages = [];
  const parser = pdfParseModule?.default || pdfParseModule;
  if (typeof parser !== "function") {
    throw new Error("pdf-parse parser is unavailable");
  }

  const parsed = await parser(buffer, {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const pageText = normalizePdfText(
        (textContent.items || []).map((item) => String(item?.str || "")).join(" ")
      );
      pages.push(pageText);
      return pageText;
    },
  });

  const wholeText = normalizePdfText(parsed?.text || "");
  const resolvedPages =
    pages.length > 0
      ? pages
      : wholeText
          .split(/\f+/)
          .map((page) => normalizePdfText(page))
          .filter(Boolean);

  return {
    text: wholeText,
    pages: resolvedPages,
  };
}

module.exports = {
  extractPdfTextWithPages,
  normalizePdfText,
};
