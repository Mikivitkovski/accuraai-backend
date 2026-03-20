import pdf from "@cedrugs/pdf-parse";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export type TextExtractionResult = {
  rawText: string;
  extractionMethod: "direct_pdf_text" | "ocr_pdf" | "ocr_image";
  ocrProvider: string | null;
};

let scribeModulePromise: Promise<any> | null = null;

async function getScribe() {
  if (!scribeModulePromise) {
    scribeModulePromise = import("scribe.js-ocr");
  }

  const mod = await scribeModulePromise;
  return mod.default ?? mod;
}

function normalizeText(input: string): string {
  return input.replace(/\u0000/g, "").replace(/\s+\n/g, "\n").trim();
}

function hasEnoughText(text: string): boolean {
  return normalizeText(text).length >= 30;
}

function extFromMime(mimeType?: string | null): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return ".bin";
  }
}

async function writeTempFile(buffer: Buffer, mimeType?: string | null): Promise<string> {
  const ext = extFromMime(mimeType);
  const filePath = path.join(os.tmpdir(), `scan-${crypto.randomUUID()}${ext}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function runOcrOnTempFile(
  tempFilePath: string,
  mimeType?: string | null
): Promise<TextExtractionResult> {
  const scribe = await getScribe();
  const text = await scribe.extractText([tempFilePath], ["eng"], "txt");
  const rawText = normalizeText(typeof text === "string" ? text : String(text ?? ""));

  return {
    rawText,
    extractionMethod: mimeType === "application/pdf" ? "ocr_pdf" : "ocr_image",
    ocrProvider: "scribe.js-ocr",
  };
}

export async function extractRawTextFromDocument(
  buffer: Buffer,
  mimeType?: string | null
): Promise<TextExtractionResult> {
  if (mimeType === "application/pdf") {
    try {
      const parsed = await pdf(buffer);
      const directText = normalizeText(parsed.text || "");

      if (hasEnoughText(directText)) {
        return {
          rawText: directText,
          extractionMethod: "direct_pdf_text",
          ocrProvider: null,
        };
      }
    } catch {
    }

    const tempFilePath = await writeTempFile(buffer, mimeType);
    try {
      return await runOcrOnTempFile(tempFilePath, mimeType);
    } finally {
      await fs.unlink(tempFilePath).catch(() => { });
    }
  }

  if (mimeType?.startsWith("image/")) {
    const tempFilePath = await writeTempFile(buffer, mimeType);
    try {
      return await runOcrOnTempFile(tempFilePath, mimeType);
    } finally {
      await fs.unlink(tempFilePath).catch(() => { });
    }
  }

  throw new Error(`Unsupported mimeType for text extraction: ${mimeType ?? "unknown"}`);
}