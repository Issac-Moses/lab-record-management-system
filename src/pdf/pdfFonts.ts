import pdfMake from "pdfmake/build/pdfmake";
import pdfVfs from "pdfmake/build/vfs_fonts";
import timesNormalUrl from "@/pdf/fonts/TimesNewRoman.ttf?url";
import timesBoldUrl from "@/pdf/fonts/TimesNewRoman-Bold.ttf?url";

type PdfMakeLike = typeof pdfMake & {
  vfs: Record<string, string>;
  fonts: Record<string, Record<string, string>>;
};

let initialized = false;

function getInitialVfs(): Record<string, string> {
  const vfsFromModule =
    (pdfVfs as unknown as { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> })?.pdfMake
      ?.vfs ||
    (pdfVfs as unknown as { vfs?: Record<string, string> })?.vfs ||
    {};
  return { ...vfsFromModule };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function looksLikePlaceholder(bytes: Uint8Array): boolean {
  const sample = new TextDecoder().decode(bytes.slice(0, Math.min(200, bytes.length)));
  return sample.includes("PLACEHOLDER_FONT_FILE");
}

async function fetchFontAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font asset: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 1024 || looksLikePlaceholder(bytes)) {
    throw new Error("Times New Roman TTF placeholders detected. Replace with real font files.");
  }
  return toBase64(buffer);
}

export async function ensurePdfMakeFonts(): Promise<typeof pdfMake> {
  const writer = pdfMake as PdfMakeLike;
  if (initialized) {
    return writer;
  }

  writer.vfs = getInitialVfs();

  try {
    const [timesNormal, timesBold] = await Promise.all([
      fetchFontAsBase64(timesNormalUrl),
      fetchFontAsBase64(timesBoldUrl),
    ]);
    writer.vfs["TimesNewRoman.ttf"] = timesNormal;
    writer.vfs["TimesNewRoman-Bold.ttf"] = timesBold;
    // Keep full Times family keys so template code can always target explicit variants.
    writer.vfs["TimesNewRoman-Italic.ttf"] = timesNormal;
    writer.vfs["TimesNewRoman-BoldItalic.ttf"] = timesBold;
    writer.fonts = {
      Times: {
        normal: "TimesNewRoman.ttf",
        bold: "TimesNewRoman-Bold.ttf",
        italics: "TimesNewRoman-Italic.ttf",
        bolditalics: "TimesNewRoman-BoldItalic.ttf",
      },
    };
  } catch {
    writer.fonts = {
      Times: {
        // Browser pdfmake requires VFS-backed font files; Roboto is present in vfs_fonts.
        normal: "Roboto-Regular.ttf",
        bold: "Roboto-Medium.ttf",
        italics: "Roboto-Italic.ttf",
        bolditalics: "Roboto-MediumItalic.ttf",
      },
    };
  }

  initialized = true;
  return writer;
}
