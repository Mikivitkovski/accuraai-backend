import { AppDataSource } from "../db/dataSource";
import { DocumentExtraction } from "../entities/DocumentExtraction";
import { DocumentField } from "../entities/DocumentField";
import { FileEntity } from "../entities/File";

const extractionRepo = AppDataSource.getRepository(DocumentExtraction);
const fieldRepo = AppDataSource.getRepository(DocumentField);
const fileRepo = AppDataSource.getRepository(FileEntity);

const REQUIRED_FIELDS = [
  "invoice_date",
  "invoice_number",
  "total_amount",
] as const;

export async function syncDocumentApprovalStatus(documentId: string) {
  const file = await fileRepo.findOneBy({ id: documentId });
  if (!file) return null;

  const extraction = await extractionRepo.findOne({
    where: { documentId },
    order: { createdAt: "DESC" },
  });

  if (!extraction) {
    file.status = "needs_review";
    await fileRepo.save(file);
    return file;
  }

  const fields = await fieldRepo.find({
    where: { extractionId: extraction.id },
  });

  const fieldMap = new Map(fields.map((f) => [f.fieldName, f]));

  const allRequiredApprovedOrEdited = REQUIRED_FIELDS.every((fieldName) => {
    const field = fieldMap.get(fieldName);
    if (!field) return false;

    const okStatus = field.status === "approved" || field.status === "edited";
    const hasValue =
      typeof field.finalValue === "string"
        ? field.finalValue.trim().length > 0
        : typeof field.extractedValue === "string"
          ? field.extractedValue.trim().length > 0
          : false;

    return okStatus && hasValue;
  });

  file.status = allRequiredApprovedOrEdited ? "approved" : "needs_review";
  await fileRepo.save(file);

  return file;
}