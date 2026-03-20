import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type InvoiceField = {
  value: string | null;
  confidence: number | null;
  source_text: string | null;
  page: number | null;
};

export type InvoiceExtraction = {
  invoice_date: InvoiceField;
  invoice_number: InvoiceField;
  vat_amount: InvoiceField;
  total_amount: InvoiceField;
  base_amount: InvoiceField;
};

function normalizeField(field: any): InvoiceField {
  return {
    value: typeof field?.value === "string" ? field.value : null,
    confidence: typeof field?.confidence === "number" ? field.confidence : null,
    source_text: typeof field?.source_text === "string" ? field.source_text : null,
    page: typeof field?.page === "number" ? field.page : null,
  };
}

function extractJsonObject(text: string): string {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    throw new Error(`No JSON object found in model response: ${cleaned}`);
  }

  return cleaned.slice(first, last + 1);
}

export async function extractInvoiceFromRawText(
  rawText: string
): Promise<InvoiceExtraction> {
  const prompt = `
Extract invoice information from the text below.

The invoice may be written in Macedonian, English, or mixed language.
Recognize labels such as:
- date / datum / датум
- invoice number / број на фактура / фактура бр
- vat amount / ddv / ддв
- total amount / vk iznos / вкупен износ
- base amount / osnova / основа

Return ONLY valid JSON with this exact structure:

{
  "invoice_date": {
    "value": "YYYY-MM-DD or null",
    "confidence": 0.0,
    "source_text": "text snippet or null",
    "page": 1
  },
  "invoice_number": {
    "value": "string or null",
    "confidence": 0.0,
    "source_text": "text snippet or null",
    "page": 1
  },
  "vat_amount": {
    "value": "number as string or null",
    "confidence": 0.0,
    "source_text": "text snippet or null",
    "page": 1
  },
  "total_amount": {
    "value": "number as string or null",
    "confidence": 0.0,
    "source_text": "text snippet or null",
    "page": 1
  },
  "base_amount": {
    "value": "number as string or null",
    "confidence": 0.0,
    "source_text": "text snippet or null",
    "page": 1
  }
}

Rules:
- Return JSON only.
- No markdown.
- No explanation.
- If a field is missing, use null.
- Confidence must be a number between 0 and 1.
- Convert European dates like 17.02.2026 to 2026-02-17.

TEXT:
${rawText}
`;

  const response = await openai.responses.create({
    model: "gpt-4.1",
    input: prompt,
  });

  const text =
    (response as any).output_text ||
    response.output
      ?.flatMap((item: any) => item.content || [])
      ?.map((c: any) => c.text || "")
      ?.join("") ||
    "";

  if (!text) {
    throw new Error("No response from OpenAI");
  }

  let parsed: any;

  try {
    const jsonText = extractJsonObject(text);
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error("OPENAI RAW RESPONSE:", text);
    throw new Error("OpenAI returned invalid JSON");
  }

  return {
    invoice_date: normalizeField(parsed.invoice_date),
    invoice_number: normalizeField(parsed.invoice_number),
    vat_amount: normalizeField(parsed.vat_amount),
    total_amount: normalizeField(parsed.total_amount),
    base_amount: normalizeField(parsed.base_amount),
  };
}