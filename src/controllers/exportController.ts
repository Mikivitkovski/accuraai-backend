import { Request, Response } from "express";
import ExcelJS from "exceljs";
import { AppDataSource } from "../db/dataSource";
import { FileEntity } from "../entities/File";
import { DocumentExtraction } from "../entities/DocumentExtraction";
import { DocumentField } from "../entities/DocumentField";
import { errorMsg } from "../utils/httpError";
import { uploadBuffer, getSignedGetObjectUrl } from "../services/s3";

const fileRepo = AppDataSource.getRepository(FileEntity);
const extractionRepo = AppDataSource.getRepository(DocumentExtraction);
const fieldRepo = AppDataSource.getRepository(DocumentField);

type ExportBody = {
  documentIds?: string[];
  exportAllApproved?: boolean;
  companyId?: string;
};

const REQUIRED_FIELDS = [
  "invoice_date",
  "invoice_number",
  "vat_amount",
  "total_amount",
  "base_amount",
] as const;

function pickFieldValue(
  fields: DocumentField[],
  fieldName: "invoice_date" | "invoice_number" | "vat_amount" | "total_amount" | "base_amount"
): string {
  const field = fields.find((f) => f.fieldName === fieldName);
  return field?.finalValue ?? field?.extractedValue ?? "";
}

function buildExportKey(orgId: string, companyId?: string) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `org/${orgId}/exports/${companyId ?? "all"}/invoices-${stamp}.xlsx`;
}

export const exportInvoices = async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as ExportBody;
    const authOrgId = (req as any).orgId as string | undefined;

    if (!authOrgId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let documents: FileEntity[] = [];

    if (Array.isArray(body.documentIds) && body.documentIds.length > 0) {
      documents = await fileRepo.findByIds(body.documentIds);

      documents = documents.filter(
        (d) =>
          d.organizationId === authOrgId &&
          d.status === "approved" &&
          (!body.companyId || d.companyId === body.companyId)
      );
    } else if (body.exportAllApproved) {
      if (!body.companyId) {
        return res.status(400).json({
          error: "companyId is required when exportAllApproved=true",
        });
      }

      documents = await fileRepo.find({
        where: {
          organizationId: authOrgId,
          companyId: body.companyId,
          status: "approved",
        },
        order: { createdAt: "DESC" },
      });
    } else {
      return res.status(400).json({
        error: "Provide documentIds or exportAllApproved=true",
      });
    }

    if (!documents.length) {
      return res.status(400).json({ error: "No approved documents found for export" });
    }

    const rows: Array<{
      invoiceDate: string;
      invoiceNumber: string;
      vatAmount: string;
      totalAmount: string;
      baseAmount: string;
      fileName: string;
    }> = [];

    for (const doc of documents) {
      if (doc.status !== "approved") continue;

      const extraction = await extractionRepo.findOne({
        where: { documentId: doc.id },
        order: { createdAt: "DESC" },
      });

      if (!extraction) continue;
      if (extraction.scanStatus !== "completed") continue;

      const fields = await fieldRepo.find({
        where: { extractionId: extraction.id },
      });

      const valid = REQUIRED_FIELDS.every((name) => {
        const field = fields.find((f) => f.fieldName === name);

        if (!field) return false;

        return (
          (field.status === "approved" || field.status === "edited") &&
          Boolean(field.finalValue ?? field.extractedValue)
        );
      });

      if (!valid) continue;

      rows.push({
        invoiceDate: pickFieldValue(fields, "invoice_date"),
        invoiceNumber: pickFieldValue(fields, "invoice_number"),
        vatAmount: pickFieldValue(fields, "vat_amount"),
        totalAmount: pickFieldValue(fields, "total_amount"),
        baseAmount: pickFieldValue(fields, "base_amount"),
        fileName: doc.filename,
      });
    }

    if (!rows.length) {
      return res.status(400).json({
        error: "No exportable rows found. Documents must be approved and all required fields must be approved/edited.",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Invoices");

    worksheet.columns = [
      { header: "Datum", key: "invoiceDate", width: 18 },
      { header: "Br na faktura", key: "invoiceNumber", width: 22 },
      { header: "Ddv", key: "vatAmount", width: 14 },
      { header: "Vk iznos", key: "totalAmount", width: 14 },
      { header: "Osnova", key: "baseAmount", width: 14 },
      { header: "File name", key: "fileName", width: 32 },
    ];

    rows.forEach((row) => worksheet.addRow(row));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };

    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const exportKey = buildExportKey(authOrgId, body.companyId);

    await uploadBuffer(
      exportKey,
      Buffer.from(buffer),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const url = await getSignedGetObjectUrl(exportKey, {
      inline: false,
      filename: "invoices-export.xlsx",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    return res.status(201).json({
      ok: true,
      totalDocuments: documents.length,
      totalRows: rows.length,
      fileKey: exportKey,
      downloadUrl: url,
    });
  } catch (e) {
    console.error("POST /exports/invoices failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};