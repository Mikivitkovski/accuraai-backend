function parseDecimal(value: string | null | undefined): number | null {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/[€$£ден]/gi, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toMoneyString(value: number): string {
  return value.toFixed(2);
}

export function resolveBaseAmount(input: {
  extractedBaseAmount: string | null;
  totalAmount: string | null;
  vatAmount: string | null;
}) {
  const extractedBase = input.extractedBaseAmount?.trim() || null;

  if (extractedBase) {
    return {
      value: extractedBase,
      origin: "extracted" as const,
    };
  }

  const total = parseDecimal(input.totalAmount);
  const vat = parseDecimal(input.vatAmount);

  if (total !== null && vat !== null) {
    return {
      value: toMoneyString(total - vat),
      origin: "calculated" as const,
    };
  }

  return {
    value: null,
    origin: null,
  };
}