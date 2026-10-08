// Round 48 Part B -- /api/company/upload-tools/*  (admin only; mounted by company.routes.ts)
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { TOOLS, getTool, parseBuffer, templateWorkbook, generateWorkbook, GENERATE_COLUMNS, SheetNameError, validateRows, importRows, type UploadOpts } from "../utils/upload-tools.js";
import { ProductModel } from "../models/product.model.js";
import { StateModel } from "../models/state.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
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

// Options chosen on the legacy pages (multipart text fields or query): deactivate, mode, month, year, fy, state.
function optsOf(req: any): UploadOpts {
  const b = req.body || {}, q = req.query || {};
  const v = (k: string): string | undefined => (typeof b[k] === "string" ? b[k] : typeof q[k] === "string" ? (q[k] as string) : undefined);
  const int = (k: string, lo: number, hi: number) => { const x = Number(v(k)); return Number.isInteger(x) && x >= lo && x <= hi ? x : undefined; };
  const month = int("month", 1, 12), year = int("year", 2000, 2100);
  const mode = v("mode") === "overwrite" ? "overwrite" : v("mode") === "insert" ? "insert" : undefined;
  return { deactivate: v("deactivate") === "true", mode, month: month && year ? month : undefined, year: month && year ? year : undefined, fy: int("fy", 2000, 2100), state: v("state")?.trim() || undefined };
}

type Input = { fileName: string; headers: string[]; rows: Record<string, unknown>[]; sheetNote?: string; fileError?: string };
// rows from a multipart file (server parse) or from JSON { headers, rows } (client parse)
function inputOf(req: any, sheetName?: string): Input {
  if (req.file) {
    try { return { fileName: req.file.originalname, ...parseBuffer(req.file.buffer, sheetName) }; }
    catch (e) {
      if (e instanceof SheetNameError) return { fileName: req.file.originalname, headers: [], rows: [], fileError: e.message };   // legacy: the message is shown on the page, not an HTTP error
      throw new HttpError(400, `Could not read the file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const b = req.body || {};
  if (Array.isArray(b.rows) && Array.isArray(b.headers)) return { fileName: String(b.fileName || "upload"), headers: b.headers.map(String), rows: b.rows };
  throw new HttpError(400, 'Send the spreadsheet as multipart field "file" (or JSON { fileName, headers, rows })');
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const fileSafe = (t: string) => t.replace(/[^A-Za-z0-9]+/g, "_");

uploadToolsRouter.get("/", asyncHandler(async (_req, res) => {
  res.json({ data: TOOLS.map((t) => ({ key: t.key, title: t.title, group: t.group, headers: t.headers, required: t.required, dateHeaders: t.dateHeaders, note: t.note, sheetName: t.sheetName || null, templateHeaders: t.templateHeaders || t.headers })) });
}));

// "Excel Format File - Download Here" (legacy sheet name, mandatory columns yellow). /sample kept as an alias.
const templateHandler = asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const opts = optsOf(req);
  if (tool.key === "product-rate" && !opts.state) throw new HttpError(400, "Select the State Name first");
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${fileSafe(tool.sheetName || tool.templateSheet || tool.title)}${opts.state ? `_${fileSafe(opts.state)}` : ""}.xlsx"`);
  res.send(await templateWorkbook(tool, req.auth!.tenantSlug!, opts));
});
uploadToolsRouter.get("/:key/template", templateHandler);
uploadToolsRouter.get("/:key/sample", templateHandler);

// Listed Doctor / Chemists "Generate Excel": the checkbox grid (in screen order) and the workbook for the ticked columns.
uploadToolsRouter.get("/:key/columns", asyncHandler(async (req, res) => {
  const cols = GENERATE_COLUMNS[req.params.key]; if (!cols) throw new HttpError(404, "This tool has no Generate Excel");
  res.json({ data: cols });
}));
uploadToolsRouter.post("/:key/generate", asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  if (!GENERATE_COLUMNS[tool.key]) throw new HttpError(404, "This tool has no Generate Excel");
  const columns = Array.isArray(req.body?.columns) ? req.body.columns.map(String) : [];
  let buf: Buffer;
  try { buf = await generateWorkbook(tool.key, columns); } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "Could not generate the Excel file"); }
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${fileSafe(tool.title)}.xlsx"`);
  res.send(buf);
}));

// Product Upload: the Category / Group / Brand reference tables, from the real product master (legacy lists only when there are no products at all).
const LEGACY_CATEGORIES = ["ANTI-ALLERGY", "ANTI-GLAUCOMA", "ANTI-INFECTIVE", "ANTI-INFECTIVE+STEROID COMB", "ANTI-OXIDANT", "CORTICOSTEROID", "NSAID", "SPREADING AGENT", "STERILE WIPES", "TEAR SUBSTITUTE"];
const LEGACY_GROUPS = ["AA", "AG", "AI", "AIC", "AO", "INFLM", "TS", "WIPES"];
const LEGACY_BRANDS = ["BEPIREX", "BRINZIA", "BRITIVIN", "CIZIA", "DORVISA", "DORVISA T", "DUCI DROP", "DUCIRA GEL", "ENVISA", "FOMIRA", "LATOBEST", "LOTIVIZ", "MACUMER", "NEPAWEL", "Nil", "PATVIRA", "PREDIRA", "STRIOS", "TIMOBEST", "TIZTA", "TIZTA LIQUIGEL", "TOBRAWIN", "TOBRAWIN LP"];
uploadToolsRouter.get("/product/reference", asyncHandler(async (req, res) => {
  const prods = (await ProductModel.find({ tenantSlug: req.auth!.tenantSlug!, status: "ACTIVE" }).lean()) as any[];
  const uniq = (xs: unknown[]) => [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!prods.length) return res.json({ data: { source: "legacy-fallback", categories: LEGACY_CATEGORIES, groups: LEGACY_GROUPS, brands: LEGACY_BRANDS } });
  res.json({ data: { source: "product-master", categories: uniq(prods.map((p) => p.category)), groups: uniq(prods.map((p) => p.group)), brands: uniq(prods.map((p) => p.brandName)) } });
}));

// Product Rate: the State Name dropdown (state master).
uploadToolsRouter.get("/product-rate/states", asyncHandler(async (req, res) => {
  const rows = (await StateModel.find({ tenantSlug: req.auth!.tenantSlug!, status: "ACTIVE" }).lean()) as any[];
  const names = [...new Set(rows.map((r) => String(r.stateName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ data: { states: names, default: names.find((n) => n.toLowerCase() === "gujarat") || names[0] || "" } });
}));

uploadToolsRouter.post("/:key/validate", upload.single("file"), asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const inp = inputOf(req, tool.sheetName);
  if (inp.fileError) return res.json({ data: { fileName: inp.fileName, headers: tool.headers, fileErrors: [inp.fileError], total: 0, valid: 0, invalid: 0, errors: [], errorsTotal: 0, warnings: [], preview: [] } });
  const { out } = await validateRows(tool, req.auth!.tenantSlug!, inp.headers, inp.rows, 50, optsOf(req));
  if (inp.sheetNote) out.warnings.unshift({ row: 0, reason: inp.sheetNote });
  res.json({ data: { fileName: inp.fileName, headers: tool.headers, ...out, errors: out.errors.slice(0, 1000), errorsTotal: out.errors.length } });
}));

uploadToolsRouter.post("/:key/import", upload.single("file"), asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const inp = inputOf(req, tool.sheetName);
  if (inp.fileError) return res.json({ data: { fileName: inp.fileName, total: 0, ok: 0, failed: 0, inserted: 0, updated: 0, skipped: 0, deactivated: 0, uploaded: false, outcome: inp.fileError, fileErrors: [inp.fileError], errors: [], warnings: [], notUploaded: null } });
  const result = await importRows(tool, req.auth!.tenantSlug!, await whoIs(req), inp.fileName, inp.headers, inp.rows, optsOf(req), inp.sheetNote);
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

// ═══ Slide Upload - E-Detailing (DD_Slide_Upload) ═══════════════════════════════════════════
// Storage mechanism: the slide FILE is stored base64 inside its metadata document in the existing
// "slideUploadEDetailing" master collection (the same documents GET /field/slides and
// /field/slides/:id/download serve to the field app). Per-file cap 10 MB (a Mongo document is 16 MB and base64 adds a third).
// The 5 GB allocation (+2% allowance) is counted from the real stored sizes of those documents.
const SLIDE_ALLOC_BYTES = 5 * 1024 ** 3;
const SLIDE_ALLOWANCE = 1.02;
const SLIDE_MAX_FILE = 10 * 1024 * 1024;
const slideUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SLIDE_MAX_FILE, files: 50 } });
const b64Bytes = (s: unknown) => Math.floor((String(s || "").length * 3) / 4);

async function slideUsage(tenant: string) {
  const Slides = getMasterModel("slideUploadEDetailing");
  // legacy rows (uploaded before sizes were recorded) get their size measured once from the stored file
  const legacy = (await Slides.find({ tenantSlug: tenant, fileSize: { $exists: false }, fileData: { $exists: true } }).select("fileData").lean()) as any[];
  for (const r of legacy) await Slides.updateOne({ _id: r._id }, { $set: { fileSize: b64Bytes(r.fileData) } });
  const rows = (await Slides.find({ tenantSlug: tenant }).select("fileSize").lean()) as any[];
  const consumed = rows.reduce((s, r) => s + (typeof r.fileSize === "number" ? r.fileSize : 0), 0);
  const limit = SLIDE_ALLOC_BYTES * SLIDE_ALLOWANCE;
  return { consumedBytes: consumed, allocatedBytes: SLIDE_ALLOC_BYTES, remainingBytes: Math.max(0, limit - consumed), limitBytes: limit };
}

uploadToolsRouter.get("/slides/meta", asyncHandler(async (req, res) => {
  const tenant = req.auth!.tenantSlug!;
  const t = (await TenantModel.findOne({ slug: tenant }).lean()) as any;
  const subs = (await SubdivisionModel.find({ tenantSlug: tenant, status: "ACTIVE" }).lean()) as any[];
  const brands = (await ProductBrandModel.find({ tenantSlug: tenant, status: "ACTIVE" }).lean()) as any[];
  const u = await slideUsage(tenant);
  const uniq = (xs: unknown[]) => [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ data: { division: t?.name || "", subDivisions: uniq(subs.map((x) => x.subdivisionName)), brands: uniq(brands.map((b) => b.brandName)), ...u, maxFileBytes: SLIDE_MAX_FILE } });
}));

uploadToolsRouter.get("/slides/list", asyncHandler(async (req, res) => {
  const Slides = getMasterModel("slideUploadEDetailing");
  const filter: Record<string, unknown> = { tenantSlug: req.auth!.tenantSlug!, fileData: { $exists: true } };
  if (typeof req.query.subDivision === "string" && req.query.subDivision) filter.subDivision = req.query.subDivision;
  const brands = typeof req.query.brands === "string" ? req.query.brands.split("|").filter(Boolean) : [];
  if (brands.length) filter.brand = { $in: brands };
  const rows = (await Slides.find(filter).select("-fileData").sort({ uploadedOn: -1 }).lean()) as any[];
  res.json({ data: rows.map((r) => ({ id: String(r._id), fileName: r.fileName, brand: r.brand || "", subDivision: r.subDivision || "", division: r.division || "", uploadedOn: r.uploadedOn, pages: r.pages ?? null, size: typeof r.fileSize === "number" ? r.fileSize : null, mimeType: r.mimeType || "", order: r.order ?? null })) });
}));

uploadToolsRouter.post("/slides/upload", slideUpload.array("files", 50), asyncHandler(async (req, res) => {
  const tenant = req.auth!.tenantSlug!;
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) throw new HttpError(400, "Choose at least one slide file");
  const brands = String(req.body?.brands || req.body?.brand || "").split("|").map((b) => b.trim()).filter(Boolean);
  if (!brands.length) throw new HttpError(400, "Select the Brand first");
  const subDivision = String(req.body?.subDivision || "").trim();
  const t = (await TenantModel.findOne({ slug: tenant }).lean()) as any;
  const Slides = getMasterModel("slideUploadEDetailing");
  const usage = await slideUsage(tenant);
  const need = files.reduce((s, f) => s + f.size, 0) * brands.length;      // one stored copy per selected brand
  if (need > usage.remainingBytes) throw new HttpError(413, `Not enough slide storage: ${(need / 1024 ** 2).toFixed(1)} MB needed, ${(usage.remainingBytes / 1024 ** 3).toFixed(2)} GB remaining`);
  const saved: { fileName: string; brand: string }[] = [];
  for (const f of files) for (const brand of brands) {
    const set: Record<string, unknown> = { tenantSlug: tenant, division: t?.name || "", subDivision, brand, fileName: f.originalname, uploadedOn: new Date(), fileData: f.buffer.toString("base64"), mimeType: f.mimetype || "application/octet-stream", fileSize: f.size };
    if ((f.mimetype || "").toLowerCase() === "application/pdf") { const m = f.buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g); if (m && m.length) set.pages = m.length; }
    const existing = (await Slides.findOne({ tenantSlug: tenant, brand, subDivision, fileName: f.originalname }).select("_id").lean()) as any;
    if (existing) await Slides.updateOne({ _id: existing._id }, { $set: set }); else await Slides.create([set]);
    saved.push({ fileName: f.originalname, brand });
  }
  res.status(201).json({ data: { saved, usage: await slideUsage(tenant) } });
}));

uploadToolsRouter.get("/slides/:id/download", asyncHandler(async (req, res) => {
  const row = (await getMasterModel("slideUploadEDetailing").findOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug! }).lean()) as any;
  if (!row || !row.fileData) throw new HttpError(404, "Slide file not found");
  res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(String(row.fileName ?? "slide"))}"`);
  res.send(Buffer.from(row.fileData, "base64"));
}));

uploadToolsRouter.delete("/slides/:id", asyncHandler(async (req, res) => {
  const r = await getMasterModel("slideUploadEDetailing").deleteOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug! });
  if (!(r as any).deletedCount) throw new HttpError(404, "Slide not found");
  res.json({ data: { deleted: true, usage: await slideUsage(req.auth!.tenantSlug!) } });
}));
