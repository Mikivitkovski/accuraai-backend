import { Request, Response } from "express";
import { AppDataSource } from "../db/dataSource";
import { DocumentField } from "../entities/DocumentField";
import { DocumentExtraction } from "../entities/DocumentExtraction";
import { errorMsg } from "../utils/httpError";
import { syncDocumentApprovalStatus } from "../services/documentApproval";
import { writeAuditLog } from "../services/audit";
import { FileEntity } from "../entities/File";

const fieldRepo = AppDataSource.getRepository(DocumentField);
const extractionRepo = AppDataSource.getRepository(DocumentExtraction);

export const updateDocumentField = async (req: Request, res: Response) => {
  try {
    const field = await fieldRepo.findOneBy({ id: req.params.id });

    if (!field) {
      return res.status(404).json({ error: "Document field not found" });
    }

    const { finalValue, status } = req.body as {
      finalValue?: string | null;
      status?: "pending" | "approved" | "denied" | "edited";
    };

    if (
      status &&
      !["pending", "approved", "denied", "edited"].includes(status)
    ) {
      return res.status(400).json({ error: "Invalid status" });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "finalValue")) {
      field.finalValue = finalValue ?? null;
    }

    if (status) {
      field.status = status;

      if (status === "edited") {
        field.valueOrigin = "manual";
      }
    }

    await fieldRepo.save(field);

    const extraction = await extractionRepo.findOneBy({ id: field.extractionId });
    if (extraction) {
      await syncDocumentApprovalStatus(extraction.documentId);
    }

    return res.json(field);
  } catch (e) {
    console.error("PATCH /document-fields/:id failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const approveAllDocumentFields = async (req: Request, res: Response) => {
  try {
    const documentId = req.params.id;

    const extraction = await extractionRepo.findOne({
      where: { documentId },
      order: { createdAt: "DESC" },
    });

    if (!extraction) {
      return res.status(404).json({ error: "No extraction found for document" });
    }

    const fields = await fieldRepo.find({
      where: { extractionId: extraction.id },
    });

    for (const field of fields) {
      const hasValue =
        typeof field.finalValue === "string"
          ? field.finalValue.trim().length > 0
          : typeof field.extractedValue === "string"
          ? field.extractedValue.trim().length > 0
          : false;

      if (!hasValue) continue;
      if (field.status === "denied") continue;

      field.status = field.status === "edited" ? "edited" : "approved";

      if (
        (field.finalValue === null || field.finalValue === undefined) &&
        field.extractedValue
      ) {
        field.finalValue = field.extractedValue;
      }
    }

    await fieldRepo.save(fields);

    const updatedFile = await syncDocumentApprovalStatus(documentId);

    return res.json({
      ok: true,
      documentId,
      documentStatus: updatedFile?.status ?? "needs_review",
      fields,
    });
  } catch (e) {
    console.error("POST /documents/:id/approve-all failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};