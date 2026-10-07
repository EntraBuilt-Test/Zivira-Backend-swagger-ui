// Round 48 Part B -- /api/company/upload-tools/*  (admin only; mounted by company.routes.ts)
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { TOOLS, getTool, parseBuffer, sampleWorkbook, validateRows, importRows } from "../utils/upload-tools.js";
import { UploadHistoryModel } from "../models/upload-history.model.js";
import { UserModel } from "../models/user.model.js";
import { getMasterModel } from "../models/master-record.model.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const uploadToolsRouter = Router();

const toolOr404 = (key: string) => { const t = getTool(key); if (!t) throw new HttpError(404, `Unknown upload tool: ${key}`); return t; };

async function whoIs(req: any): Promise<string> {
  try {
    const u = (await UserModel.findById(req.auth?.sub).select("name email").lean()) as any;
    return (u && (u.name || u.email)) || String(req.auth?.sub || "admin");
  } catch { return String(req.auth?.sub || "admin"); }
}

// rows from a multipart file (server parse) or from JSON { headers, rows } (client parse)
function inputOf(req: any): { fileName: string; headers: string[]; rows: Record<string, unknown>[] } {
  if (req.file) {
    let parsed;
    try { parsed = parseBuffer(req.file.buffer); } catch (e) { throw new HttpError(400, `Could not read the file: ${e instanceof Error ? e.message : String(e)}`); }
    return { fileName: req.file.originalname, ...parsed };
  }
  const b = req.body || {};
  if (Array.isArray(b.rows) && Array.isArray(b.headers)) return { fileName: String(b.fileName || "upload"), headers: b.headers.map(String), rows: b.rows };
  throw new HttpError(400, 'Send the spreadsheet as multipart field "file" (or JSON { fileName, headers, rows })');
}

uploadToolsRouter.get("/", asyncHandler(async (_req, res) => {
  res.json({ data: TOOLS.map((t) => ({ key: t.key, title: t.title, group: t.group, headers: t.headers, required: t.required, dateHeaders: t.dateHeaders, note: t.note })) });
}));

uploadToolsRouter.get("/:key/sample", asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${tool.title.replace(/[^A-Za-z0-9]+/g, "_")}_Sample.xlsx"`);
  res.send(sampleWorkbook(tool));
}));

uploadToolsRouter.post("/:key/validate", upload.single("file"), asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const inp = inputOf(req);
  const { out } = await validateRows(tool, req.auth!.tenantSlug!, inp.headers, inp.rows);
  res.json({ data: { fileName: inp.fileName, headers: tool.headers, ...out, errors: out.errors.slice(0, 1000), errorsTotal: out.errors.length } });
}));

uploadToolsRouter.post("/:key/import", upload.single("file"), asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const inp = inputOf(req);
  const result = await importRows(tool, req.auth!.tenantSlug!, await whoIs(req), inp.fileName, inp.headers, inp.rows);
  res.json({ data: result });
}));

uploadToolsRouter.get("/:key/history", asyncHandler(async (req, res) => {
  toolOr404(req.params.key);
  const rows = (await UploadHistoryModel.find({ tenantSlug: req.auth!.tenantSlug!, toolKey: req.params.key }).sort({ createdAt: -1 }).limit(50).lean()) as any[];
  res.json({ data: rows.map((r) => ({ id: String(r._id), fileName: r.fileName, uploadedBy: r.uploadedBy, uploadedAt: r.createdAt, totalRows: r.totalRows, okRows: r.okRows, failedRows: r.failedRows, inserted: r.inserted, updated: r.updated, fileErrors: r.fileErrors || [], errors: r.rowErrors || [] })) });
}));

// Attach slide files to already-imported slide metadata rows, matched by File Name.
uploadToolsRouter.post("/slides-upload/files", upload.array("files", 50), asyncHandler(async (req, res) => {
  const tenant = req.auth!.tenantSlug!;
  const Slides = getMasterModel("slideUploadEDetailing");
  const matched: string[] = [], unmatched: string[] = [];
  for (const f of (req.files as Express.Multer.File[]) || []) {
    const rows = (await Slides.find({ tenantSlug: tenant, fileName: f.originalname }).lean()) as any[];
    if (!rows.length) { unmatched.push(f.originalname); continue; }
    const set: Record<string, unknown> = { fileData: f.buffer.toString("base64"), mimeType: f.mimetype || "application/octet-stream", uploadedOn: new Date() };
    if ((f.mimetype || "").toLowerCase() === "application/pdf") {
      const m = f.buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
      if (m && m.length) set.pages = m.length;
    }
    for (const r of rows) await Slides.updateOne({ _id: r._id }, { $set: set });
    matched.push(f.originalname);
  }
  res.json({ data: { matched, unmatched } });
}));
