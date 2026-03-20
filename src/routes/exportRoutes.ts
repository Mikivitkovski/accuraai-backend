import { Router } from "express";
import { exportInvoices } from "../controllers/exportController";
import { authFromCookie } from "../middleware/authFromCookie";

const router = Router();

router.post("/exports/invoices", authFromCookie, exportInvoices);

export default router;