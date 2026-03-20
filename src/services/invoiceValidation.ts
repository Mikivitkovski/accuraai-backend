export type ExtractedInvoiceValue = {
  value: string | null;
  confidence: number | null;
  source_text: string | null;
  page: number | null;
};

export type InvoiceExtractionForValidation = {
  invoice_date: ExtractedInvoiceValue;
  invoice_number: ExtractedInvoiceValue;
  vat_amount: ExtractedInvoiceValue;
  total_amount: ExtractedInvoiceValue;
  base_amount: ExtractedInvoiceValue;
};

export type ValidationIssue = {
  field:
    | "invoice_date"
    | "invoice_number"
    | "vat_amount"
    | "total_amount"
    | "base_amount"
    | "document";
  code:
    | "missing_value"
    | "invalid_date"
    | "invalid_decimal"
    | "sum_mismatch"
    | "low_confidence";
  message: string;
  severity: "error" | "warning";
};

export type ValidationFieldState = {
  fieldName:
    | "invoice_date"
    | "invoice_number"
    | "vat_amount"
    | "total_amount"
    | "base_amount";
  isValid: boolean;
  suggestion: "green" | "yellow" | "red";
};

export type InvoiceValidationResult = {
  isValid: boolean;
  documentStatus: "needs_review";
  issues: ValidationIssue[];
  fieldStates: ValidationFieldState[];
  summary: {
    allRequiredPresent: boolean;
    amountsAreConsistent: boolean;
    highConfidence: boolean;
  };
};

function isValidDateString(value: string | null): boolean {
  if (!value) return false;

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(value)) {
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  }

  const european = /^\d{2}\.\d{2}\.\d{4}$/;
  if (european.test(value)) {
    const [dd, mm, yyyy] = value.split(".");
    const isoValue = `${yyyy}-${mm}-${dd}`;
    const d = new Date(isoValue);
    return !Number.isNaN(d.getTime());
  }

  return false;
}

function normalizeDecimalString(value: string | null): number | null {
  if (!value) return null;

  const cleaned = value
    .replace(/\s/g, "")
    .replace(/[€$£ден,]/gi, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNonEmpty(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isHighConfidence(confidence: number | null, threshold = 0.85): boolean {
  return typeof confidence === "number" && confidence >= threshold;
}

function approxEqual(a: number, b: number, tolerance = 0.05): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function validateInvoiceExtraction(
  data: InvoiceExtractionForValidation
): InvoiceValidationResult {
  const issues: ValidationIssue[] = [];

  const fields: ValidationFieldState[] = [
    { fieldName: "invoice_date", isValid: true, suggestion: "green" },
    { fieldName: "invoice_number", isValid: true, suggestion: "green" },
    { fieldName: "vat_amount", isValid: true, suggestion: "green" },
    { fieldName: "total_amount", isValid: true, suggestion: "green" },
    { fieldName: "base_amount", isValid: true, suggestion: "green" },
  ];

  const setFieldState = (
    fieldName: ValidationFieldState["fieldName"],
    isValid: boolean,
    suggestion: ValidationFieldState["suggestion"]
  ) => {
    const found = fields.find((f) => f.fieldName === fieldName);
    if (found) {
      found.isValid = isValid;
      found.suggestion = suggestion;
    }
  };

  if (!isNonEmpty(data.invoice_date.value)) {
    issues.push({
      field: "invoice_date",
      code: "missing_value",
      message: "Invoice date is missing.",
      severity: "error",
    });
    setFieldState("invoice_date", false, "red");
  } else if (!isValidDateString(data.invoice_date.value)) {
    issues.push({
      field: "invoice_date",
      code: "invalid_date",
      message: "Invoice date is not valid.",
      severity: "error",
    });
    setFieldState("invoice_date", false, "red");
  } else if (!isHighConfidence(data.invoice_date.confidence)) {
    issues.push({
      field: "invoice_date",
      code: "low_confidence",
      message: "Invoice date has lower confidence.",
      severity: "warning",
    });
    setFieldState("invoice_date", true, "yellow");
  }

  if (!isNonEmpty(data.invoice_number.value)) {
    issues.push({
      field: "invoice_number",
      code: "missing_value",
      message: "Invoice number is missing.",
      severity: "error",
    });
    setFieldState("invoice_number", false, "red");
  } else if (!isHighConfidence(data.invoice_number.confidence)) {
    issues.push({
      field: "invoice_number",
      code: "low_confidence",
      message: "Invoice number has lower confidence.",
      severity: "warning",
    });
    setFieldState("invoice_number", true, "yellow");
  }

  const vatAmount = normalizeDecimalString(data.vat_amount.value);
  const totalAmount = normalizeDecimalString(data.total_amount.value);
  const baseAmount = normalizeDecimalString(data.base_amount.value);

  if (vatAmount === null) {
    issues.push({
      field: "vat_amount",
      code: data.vat_amount.value ? "invalid_decimal" : "missing_value",
      message: data.vat_amount.value
        ? "VAT amount is not a valid decimal."
        : "VAT amount is missing.",
      severity: "error",
    });
    setFieldState("vat_amount", false, "red");
  } else if (!isHighConfidence(data.vat_amount.confidence)) {
    issues.push({
      field: "vat_amount",
      code: "low_confidence",
      message: "VAT amount has lower confidence.",
      severity: "warning",
    });
    setFieldState("vat_amount", true, "yellow");
  }

  if (totalAmount === null) {
    issues.push({
      field: "total_amount",
      code: data.total_amount.value ? "invalid_decimal" : "missing_value",
      message: data.total_amount.value
        ? "Total amount is not a valid decimal."
        : "Total amount is missing.",
      severity: "error",
    });
    setFieldState("total_amount", false, "red");
  } else if (!isHighConfidence(data.total_amount.confidence)) {
    issues.push({
      field: "total_amount",
      code: "low_confidence",
      message: "Total amount has lower confidence.",
      severity: "warning",
    });
    setFieldState("total_amount", true, "yellow");
  }

  if (baseAmount === null) {
    issues.push({
      field: "base_amount",
      code: data.base_amount.value ? "invalid_decimal" : "missing_value",
      message: data.base_amount.value
        ? "Base amount is not a valid decimal."
        : "Base amount is missing.",
      severity: "error",
    });
    setFieldState("base_amount", false, "red");
  } else if (!isHighConfidence(data.base_amount.confidence)) {
    issues.push({
      field: "base_amount",
      code: "low_confidence",
      message: "Base amount has lower confidence.",
      severity: "warning",
    });
    setFieldState("base_amount", true, "yellow");
  }

  let amountsAreConsistent = false;
  if (
    baseAmount !== null &&
    vatAmount !== null &&
    totalAmount !== null
  ) {
    amountsAreConsistent = approxEqual(baseAmount + vatAmount, totalAmount);

    if (!amountsAreConsistent) {
      issues.push({
        field: "document",
        code: "sum_mismatch",
        message: "Base amount + VAT amount does not match total amount.",
        severity: "error",
      });

      if (fields.find((f) => f.fieldName === "base_amount")?.suggestion !== "red") {
        setFieldState("base_amount", true, "yellow");
      }
      if (fields.find((f) => f.fieldName === "vat_amount")?.suggestion !== "red") {
        setFieldState("vat_amount", true, "yellow");
      }
      if (fields.find((f) => f.fieldName === "total_amount")?.suggestion !== "red") {
        setFieldState("total_amount", true, "yellow");
      }
    }
  }

  const allRequiredPresent =
    isValidDateString(data.invoice_date.value) &&
    isNonEmpty(data.invoice_number.value) &&
    vatAmount !== null &&
    totalAmount !== null &&
    baseAmount !== null;

  const highConfidence =
    isHighConfidence(data.invoice_date.confidence) &&
    isHighConfidence(data.invoice_number.confidence) &&
    isHighConfidence(data.vat_amount.confidence) &&
    isHighConfidence(data.total_amount.confidence) &&
    isHighConfidence(data.base_amount.confidence);

  const hasError = issues.some((i) => i.severity === "error");

  return {
    isValid: !hasError,
    documentStatus: "needs_review",
    issues,
    fieldStates: fields,
    summary: {
      allRequiredPresent,
      amountsAreConsistent,
      highConfidence,
    },
  };
}