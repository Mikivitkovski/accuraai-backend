import { Request, Response } from "express";
import { AppDataSource } from "../db/dataSource";
import { FileEntity } from "../entities/File";
import { Organization } from "../entities/Organization";
import { FindOptionsWhere } from "typeorm";
import multer from "multer";
import {
  overwriteAtKey,
  deleteKey,
  buildOrgUploadKey,
  getObjectBuffer,
} from "../services/s3";
import { errorMsg } from "../utils/httpError";
import { DocumentExtraction } from "../entities/DocumentExtraction";
import { DocumentField } from "../entities/DocumentField";
import { extractRawTextFromDocument } from "../services/textExtraction";
import { extractInvoiceFromRawText } from "../services/aiInvoiceExtraction";
import { validateInvoiceExtraction } from "../services/invoiceValidation";
import { writeAuditLog } from "../services/audit";
import { resolveBaseAmount } from "../services/baseAmount";

const fileRepo = AppDataSource.getRepository(FileEntity);
const orgRepo = AppDataSource.getRepository(Organization);
const extractionRepo = AppDataSource.getRepository(DocumentExtraction);
const fieldRepo = AppDataSource.getRepository(DocumentField);

const upload = multer();
type ReqWithFile = Request & { file?: Express.Multer.File };

type NormalizeBody = {
  mimeType?: string | null;
  contentType?: string | null;
  sizeBytes?: string | number | null;
};

function normalizeBody(body: NormalizeBody): void {
  if (!body.mimeType && typeof body.contentType === "string") {
    body.mimeType = body.contentType;
  }
  if (body.sizeBytes !== undefined && body.sizeBytes !== null) {
    if (typeof body.sizeBytes !== "string") {
      body.sizeBytes = String(body.sizeBytes);
    }
  }
}

export const createFile = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body as {
      organizationId?: string;
    };

    normalizeBody(req.body as NormalizeBody);

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    if (!req.body.filename || !req.body.path) {
      return res.status(400).json({ error: "filename and path are required" });
    }

    const ok = await orgRepo.exist({ where: { id: organizationId } });
    if (!ok) return res.status(400).json({ error: "Invalid organizationId" });

    const file = fileRepo.create({
      filename: req.body.filename,
      path: req.body.path,
      mimeType: req.body.mimeType ?? null,
      sizeBytes: req.body.sizeBytes ? String(req.body.sizeBytes) : "0",
      fileRole: req.body.fileRole ?? null,
      organizationId,
      companyId: req.body.companyId ?? null,
      uploadedBy: req.body.uploadedBy ?? null,
      status: req.body.status ?? "uploaded",
    });

    await fileRepo.save(file);
    return res.status(201).json(file);
  } catch (e) {
    console.error("POST /files failed:", e);
    return res.status(400).json({ error: errorMsg(e, "Bad Request") });
  }
};

export const getLatestExtractionForDocument = async (req: Request, res: Response) => {
  try {
    const file = await fileRepo.findOneBy({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: "Document not found" });
    }

    const extraction = await extractionRepo.findOne({
      where: { documentId: file.id },
      order: { createdAt: "DESC" },
    });

    if (!extraction) {
      return res.json({
        document: file,
        extraction: null,
        fields: [],
      });
    }

    const fields = await fieldRepo.find({
      where: { extractionId: extraction.id },
      order: { fieldName: "ASC" },
    });

    return res.json({
      document: file,
      extraction: {
        id: extraction.id,
        rawText: extraction.rawText ?? null,
        ocrProvider: extraction.ocrProvider ?? null,
        aiProvider: extraction.aiProvider ?? null,
        scanStatus: extraction.scanStatus ?? null,
        createdAt: extraction.createdAt ?? null,
      },
      fields,
    });
  } catch (e) {
    console.error("GET /documents/:id/latest-extraction failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const scanFile = async (req: Request, res: Response) => {
  let file: FileEntity | null = null;

  try {
    file = await fileRepo.findOneBy({ id: req.params.id });
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    file.status = "processing";
    await fileRepo.save(file);

    const buffer = await getObjectBuffer(file.path);

    const textExtraction = await extractRawTextFromDocument(
      buffer,
      file.mimeType
    );
    const rawText = textExtraction.rawText;

    if (!rawText) {
      throw new Error("No text could be extracted from document");
    }

    const ai = await extractInvoiceFromRawText(rawText);
    const validation = validateInvoiceExtraction(ai);

    const resolvedBaseAmount = resolveBaseAmount({
      extractedBaseAmount: ai.base_amount.value,
      totalAmount: ai.total_amount.value,
      vatAmount: ai.vat_amount.value,
    });

    const extraction = extractionRepo.create({
      documentId: file.id,
      rawText,
      ocrProvider: textExtraction.ocrProvider,
      aiProvider: "openai",
      scanStatus: "completed",
    });

    await extractionRepo.save(extraction);

    const fieldsToSave = [
      {
        fieldName: "invoice_date",
        data: ai.invoice_date,
        valueOrigin: "extracted" as const,
      },
      {
        fieldName: "invoice_number",
        data: ai.invoice_number,
        valueOrigin: "extracted" as const,
      },
      {
        fieldName: "vat_amount",
        data: ai.vat_amount,
        valueOrigin: "extracted" as const,
      },
      {
        fieldName: "total_amount",
        data: ai.total_amount,
        valueOrigin: "extracted" as const,
      },
      {
        fieldName: "base_amount",
        data: {
          ...ai.base_amount,
          value: resolvedBaseAmount.value,
        },
        valueOrigin: resolvedBaseAmount.origin,
      },
    ] as const;

    const fieldRows = fieldsToSave.map((field) =>
      fieldRepo.create({
        extractionId: extraction.id,
        fieldName: field.fieldName,
        extractedValue:
          field.fieldName === "base_amount"
            ? ai.base_amount.value
            : field.data.value,
        finalValue: field.data.value,
        confidence:
          typeof field.data.confidence === "number"
            ? field.data.confidence.toFixed(2)
            : null,
        sourceText: field.data.source_text,
        sourcePage: field.data.page,
        bboxJson: null,
        status: "pending",
        valueOrigin: field.valueOrigin,
      })
    );

    await fieldRepo.save(fieldRows);

    file.status = "needs_review";
    await fileRepo.save(file);

    const actorUserId = (req as any).auth?.userId ?? null;

    if (file.organizationId) {
      await writeAuditLog({
        orgId: file.organizationId,
        actorUserId,
        action: "document.scanned",
        category: "Document",
        severity: "info",
        description: "Document scan completed.",
        details: {
          fileId: file.id,
          filename: file.filename,
          extractionId: extraction.id,
          extractionMethod: textExtraction.extractionMethod,
          status: file.status,
        },
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
      });
    }

    return res.status(201).json({
      ok: true,
      documentId: file.id,
      extractionId: extraction.id,
      status: file.status,
      extractionMethod: textExtraction.extractionMethod,
      validation,
      resolvedBaseAmount,
      fields: fieldRows,
    });
  } catch (e) {
    console.error("POST /documents/:id/scan failed:", e);

    if (file) {
      try {
        file.status = "failed";
        const actorUserId = (req as any).auth?.userId ?? null;

        if (file.organizationId) {
          await writeAuditLog({
            orgId: file.organizationId,
            actorUserId,
            action: "document.scan_failed",
            category: "Document",
            severity: "error",
            description: "Document scan failed.",
            details: {
              fileId: file.id ?? null,
              filename: file.filename ?? null,
              error: errorMsg(e),
            },
            ip: req.ip,
            userAgent: req.get("user-agent") ?? null,
          });
        }

        await fileRepo.save(file);
      } catch (saveErr) {
        console.error("Failed to update file status to failed:", saveErr);
      }
    }

    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const listFiles = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query as {
      organizationId?: string;
    };

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const where: FindOptionsWhere<FileEntity> = {
      organizationId,
    };

    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    const files = await fileRepo.find({
      where,
      relations: { organization: true },
      take: isNaN(limit) ? 50 : limit,
      skip: isNaN(offset) ? 0 : offset,
      order: { createdAt: "DESC" },
    });

    return res.json(files);
  } catch (e) {
    console.error("GET /files failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const getFile = async (req: Request, res: Response) => {
  try {
    const file = await fileRepo.findOne({
      where: { id: req.params.id },
      relations: { organization: true },
    });
    if (!file) return res.status(404).json({ error: "Not found" });
    return res.json(file);
  } catch (e) {
    console.error("GET /files/:id failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const updateFile = async (req: Request, res: Response) => {
  try {
    const file = await fileRepo.findOneBy({ id: req.params.id });
    if (!file) return res.status(404).json({ error: "Not found" });

    normalizeBody(req.body as NormalizeBody);

    const { organizationId } = (req.body ?? {}) as {
      organizationId?: string;
    };

    if (organizationId) {
      const ok = await orgRepo.exist({ where: { id: organizationId } });
      if (!ok) return res.status(400).json({ error: "Invalid organizationId" });
    }

    const patch: Partial<FileEntity> = {
      filename: req.body.filename ?? file.filename,
      path: req.body.path ?? file.path,
      mimeType: req.body.mimeType ?? file.mimeType,
      sizeBytes: req.body.sizeBytes ? String(req.body.sizeBytes) : file.sizeBytes,
      fileRole: req.body.fileRole ?? file.fileRole,
      organizationId: req.body.organizationId ?? file.organizationId,
      companyId: req.body.companyId ?? file.companyId,
      uploadedBy: req.body.uploadedBy ?? file.uploadedBy,
      status: req.body.status ?? file.status,
    };

    fileRepo.merge(file, patch);
    await fileRepo.save(file);

    return res.json(file);
  } catch (e) {
    console.error("PATCH /files/:id failed:", e);
    return res.status(400).json({ error: errorMsg(e, "Bad Request") });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const file = await fileRepo.findOneBy({ id: req.params.id });
    if (!file) return res.status(404).json({ error: "Not found" });

    if (file.path) {
      try {
        await deleteKey(file.path);
      } catch (err) {
        console.error("S3 delete failed; aborting DB delete:", err);
        return res.status(502).json({
          error: "Failed to delete file from storage; database record preserved.",
        });
      }
    }

    await fileRepo.remove(file);
    return res.status(204).send();
  } catch (e) {
    console.error("DELETE /files/:id failed:", e);
    return res.status(500).json({ error: errorMsg(e) });
  }
};

export const replaceFileContent = [
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const oldFile = await fileRepo.findOneBy({ id: req.params.id });
      if (!oldFile) return res.status(404).json({ error: "Not Found" });

      const uploadedFile = (req as ReqWithFile).file;
      if (!uploadedFile) {
        return res.status(400).json({
          error: "file is required; send multipart/form-data with field 'file'",
        });
      }

      if (!oldFile.path) {
        return res.status(400).json({
          error: "This file has no stored S3 path to replace",
        });
      }

      if (!oldFile.organizationId) {
        return res.status(400).json({
          error: "This file is missing organizationId",
        });
      }

      const newKey = buildOrgUploadKey(
        oldFile.organizationId,
        uploadedFile.originalname
      );

      const uploadResult = await overwriteAtKey(
        newKey,
        uploadedFile.buffer,
        uploadedFile.mimetype
      );

      const createdFile = fileRepo.create({
        filename: uploadedFile.originalname,
        path: newKey,
        mimeType: uploadedFile.mimetype || undefined,
        sizeBytes: String(uploadedFile.size),
        organizationId: oldFile.organizationId,
        companyId: oldFile.companyId ?? null,
        uploadedBy: oldFile.uploadedBy ?? null,
        status: "uploaded",
        fileRole: oldFile.fileRole ?? undefined,
      });

      await fileRepo.save(createdFile);

      try {
        await deleteKey(oldFile.path);
      } catch (err) {
        console.error("S3 delete (old key) failed; preserving old DB row:", err);
        return res.status(502).json({
          error:
            "Replaced file created, but failed to delete old file from storage.",
          file: createdFile,
          previous: { id: oldFile.id, path: oldFile.path },
          storage: {
            bucket: uploadResult.bucket,
            key: uploadResult.key,
            etag: uploadResult.etag,
          },
        });
      }

      await fileRepo.remove(oldFile);

      return res.json({
        file: createdFile,
        previous: { id: oldFile.id, path: oldFile.path },
        storage: {
          bucket: uploadResult.bucket,
          key: uploadResult.key,
          etag: uploadResult.etag,
        },
        mode: "replaced-with-new-key-and-row",
      });
    } catch (e) {
      console.error("PUT /files/:id/content failed:", e);
      return res.status(500).json({ error: errorMsg(e) });
    }
  },
];