import { Router } from "express";
import {
  createFile,
  scanFile,
  listFiles,
  getFile,
  updateFile,
  deleteFile,
  replaceFileContent,
  getLatestExtractionForDocument,
} from "../controllers/fileController";
import {
  updateDocumentField,
  approveAllDocumentFields
} from "../controllers/documentFieldController";

const router = Router();

router.post("/files", createFile);
router.get("/files", listFiles);
router.get("/files/:id", getFile);
router.patch("/files/:id", updateFile);
router.delete("/files/:id", deleteFile);
router.put("/files/:id/content", ...replaceFileContent);
router.patch("/document-fields/:id", updateDocumentField);
router.post("/documents/:id/approve-all", approveAllDocumentFields);
router.post("/documents/:id/scan", scanFile);
router.get("/documents/:id/latest-extraction", getLatestExtractionForDocument);


export default router;