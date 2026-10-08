// Round 48 Part B -- /api/company/upload-tools/*  (admin only; mounted by company.routes.ts)
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { TOOLS, getTool, parseBuffer, templateWorkbook, generateWorkbook, GENERATE_COLUMNS, SheetNameError, validateRows, importRows, knownHeaders, norm, type UploadOpts } from "../utils/upload-tools.js";
import { ProductModel } from "../models/product.model.js";
import { StateModel } from "../models/state.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
import { UploadHistoryModel } from "../models/upload-history.model.js";
import { DoctorUploadLogModel } from "../models/doctor-upload-log.model.js";   // legacy Listed Doctor log rows (kept readable)
import { UploadLogModel } from "../models/upload-log.model.js";
import { UploadGenerateStateModel } from "../models/upload-generate-state.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { UserModel } from "../models/user.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { getSlideStore, readSlideBuffer, releaseSlideFile, hasSlideFile, ensureSlidesMigrated, migrateLegacySlides, countLegacySlides } from "../utils/slide-store.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const uploadToolsRouter = Router();

const toolOr404 = (key: string) => { const t = getTool(key); if (!t) throw new HttpError(404, `Unknown upload tool: ${key}`); return t; };

async function whoIs(req: any): Promise<string> {
  try {
    const u = (await UserModel.findById(req.auth?.sub).select("displayName username name email").lean()) as any;
    return (u && (u.displayName || u.username || u.name || u.email)) || String(req.auth?.sub || "admin");
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
function inputOf(req: any, sheetName?: string, known?: Set<string>): Input {
  if (req.file) {
    try { return { fileName: req.file.originalname, ...parseBuffer(req.file.buffer, sheetName, known) }; }
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
  // remember the generated state for this company user (server side): the columns the file really has (always-included ones too), so ticking nothing is remembered as well
  const want = new Set(columns.map((x: string) => norm(x)));
  const effective = GENERATE_COLUMNS[tool.key].filter((c) => c.mandatory || want.has(norm(c.label))).map((c) => c.label);
  if (req.body?.remember !== false) await UploadGenerateStateModel.updateOne({ tenantSlug: req.auth!.tenantSlug!, userId: String(req.auth!.sub), toolKey: tool.key }, { $set: { columns: effective, generatedAt: new Date() } }, { upsert: true });
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${fileSafe(tool.title)}.xlsx"`);
  res.send(buf);
}));

// "Generate Excel" state kept on the server per company user (survives a different browser / device).
uploadToolsRouter.get("/:key/generated", asyncHandler(async (req, res) => {
  if (!GENERATE_COLUMNS[req.params.key]) throw new HttpError(404, "This tool has no Generate Excel");
  const row = (await UploadGenerateStateModel.findOne({ tenantSlug: req.auth!.tenantSlug!, userId: String(req.auth!.sub), toolKey: req.params.key }).lean()) as any;
  res.json({ data: row ? { columns: row.columns || [], generatedAt: row.generatedAt || row.updatedAt || null } : null });
}));
uploadToolsRouter.delete("/:key/generated", asyncHandler(async (req, res) => {
  if (!GENERATE_COLUMNS[req.params.key]) throw new HttpError(404, "This tool has no Generate Excel");
  await UploadGenerateStateModel.deleteOne({ tenantSlug: req.auth!.tenantSlug!, userId: String(req.auth!.sub), toolKey: req.params.key });
  res.json({ data: { cleared: true } });
}));

// "Speciality / Category" (Listed Doctor) and "Category / Class" (Chemists) reference popups: the real distinct values in the master with counts.
const tally = (xs: unknown[]) => { const m = new Map<string, number>(); for (const x of xs) { const k = String(x ?? "").trim(); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)); };
uploadToolsRouter.get("/listed-doctor/reference", asyncHandler(async (req, res) => {
  const docs = (await DoctorModel.find({ tenantSlug: req.auth!.tenantSlug!, status: "ACTIVE" }).lean()) as any[];
  const tier: Record<string, string> = { NIL: "Nil", CORE: "Core", "N CORE": "N Core", "S CORE": "S Core" };
  res.json({ data: { total: docs.length, specialities: tally(docs.map((d) => d.specialty)), categories: tally(docs.map((d) => tier[d.doctorCategory] || "")), classes: tally(docs.map((d) => d.category)) } });
}));
uploadToolsRouter.get("/chemist/reference", asyncHandler(async (req, res) => {
  const rows = (await DealerModel.find({ tenantSlug: req.auth!.tenantSlug!, status: "ACTIVE" }).lean()) as any[];
  res.json({ data: { total: rows.length, categories: tally(rows.map((r) => r.category)), classes: tally(rows.map((r) => r.chemistClass)) } });
}));

// Product Upload: the Category / Group / Brand reference tables, from the real product master (legacy lists only when there are no products at all).
const LEGACY_CATEGORIES = ["ANTI-ALLERGY", "ANTI-GLAUCOMA", "ANTI-INFECTIVE", "ANTI-INFECTIVE+STEROID COMB", "ANTI-OXIDANT", "CORTICOSTEROID", "NSAID", "SPREADING AGENT", "STERILE WIPES", "TEAR SUBSTITUTE"];
const LEGACY_GROUPS = ["AA", "AG", "AI", "AIC", "AO", "INFLM", "TS", "WIPES"];
const LEGACY_BRANDS = ["BEPIREX", "BRINZIA", "BRITIVIN", "CIZIA", "DORVISA", "DORVISA T", "DUCI DROP", "DUCIRA GEL", "ENVISA", "FOMIRA", "LATOBEST", "LOTIVIZ", "MACUMER", "NEPAWEL", "Nil", "PATVIRA", "PREDIRA", "STRIOS", "TIMOBEST", "TIZTA", "TIZTA LIQUIGEL", "TOBRAWIN", "TOBRAWIN LP"];
uploadToolsRouter.get("/product/reference", asyncHandler(async (req, res) => {
  const prods = (await ProductModel.find({ tenantSlug: req.auth!.tenantSlug!, status: "ACTIVE" }).lean()) as any[];
  const uniq = (xs: unknown[]) => [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // each list falls back to the legacy list on its own when the product master has no values for it (Category and Group are optional on products)
  const cats = uniq(prods.map((p) => p.category)), groups = uniq(prods.map((p) => p.group)), brands = uniq(prods.map((p) => p.brandName));
  const from = { categories: cats.length ? "product-master" : "legacy-fallback", groups: groups.length ? "product-master" : "legacy-fallback", brands: brands.length ? "product-master" : "legacy-fallback" };
  res.json({ data: { source: Object.values(from).every((x) => x === "product-master") ? "product-master" : Object.values(from).every((x) => x === "legacy-fallback") ? "legacy-fallback" : "mixed", sources: from, categories: cats.length ? cats : LEGACY_CATEGORIES, groups: groups.length ? groups : LEGACY_GROUPS, brands: brands.length ? brands : LEGACY_BRANDS } });
}));

// Product Rate: the State Name dropdown (state master).
uploadToolsRouter.get("/product-rate/states", asyncHandler(async (req, res) => {
  const rows = (await StateModel.find({ tenantSlug: req.auth!.tenantSlug!, status: "ACTIVE" }).lean()) as any[];
  const names = [...new Set(rows.map((r) => String(r.stateName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ data: { states: names, default: names.find((n) => n.toLowerCase() === "gujarat") || names[0] || "" } });
}));

// ---- persisted upload log (Round 61 review 2, generalised in Round 62): Listed Doctor, Chemists and every tool added to LOGGED_TOOLS ----
const LOGGED_TOOLS = new Set(["listed-doctor", "chemist"]);
const NOT_UPLOADED_MAX_BYTES = 2 * 1024 * 1024;
/** The single most common reason across the rejected rows (a row counts once per reason), worded without the cell values. */
export function topReasonOf(errors: { row: number; field: string; reason: string }[]): { text: string; rows: number } {
  const perKey = new Map<string, Set<number>>();
  for (const e of errors) {
    const text = /not found in Field Force/i.test(e.reason) ? "User Name not found in Field Force" : `${e.field}: ${e.reason.replace(/"[^"]*"\s*/g, "").replace(/\s+/g, " ").trim()}`;
    (perKey.get(text) || perKey.set(text, new Set()).get(text)!).add(e.row);
  }
  let best = { text: "", rows: 0 };
  for (const [text, rows] of perKey) if (rows.size > best.rows) best = { text, rows: rows.size };
  return best;
}
async function logUpload(toolKey: string, tenant: string, who: string, fileName: string, r: { total: number; inserted: number; updated: number; failed: number; errors?: { row: number; field: string; reason: string }[] }, notUploadedB64: string | null, note: string): Promise<string | undefined> {
  try {
    const buf = notUploadedB64 ? Buffer.from(notUploadedB64, "base64") : null;
    const keep = buf && buf.length <= NOT_UPLOADED_MAX_BYTES ? buf : undefined;
    const top = topReasonOf(r.errors || []);
    const row = await UploadLogModel.create({ toolKey, tenantSlug: tenant, fileName, uploadedAt: new Date(), uploadedBy: who, read: r.total, inserted: r.inserted, updated: r.updated, rejected: r.failed, note, topReason: top.text || note, topReasonRows: top.rows, notUploadedFile: keep, notUploadedTruncated: !!buf && !keep });
    return String((row as any)._id);
  } catch (e) { console.error("upload log failed", e); return undefined; }
}
const loggedOr404 = (key: string) => { toolOr404(key); if (!LOGGED_TOOLS.has(key)) throw new HttpError(404, `No upload history for ${key}`); };
uploadToolsRouter.get("/:key/uploads", asyncHandler(async (req, res) => {
  loggedOr404(req.params.key);
  const tenant = req.auth!.tenantSlug!;
  let rows = (await UploadLogModel.find({ tenantSlug: tenant, toolKey: req.params.key }).select("-notUploadedFile").sort({ uploadedAt: -1 }).limit(50).lean()) as any[];
  if (req.params.key === "listed-doctor") {   // rows logged before the shared model existed
    const old = (await DoctorUploadLogModel.find({ tenantSlug: tenant }).select("-notUploadedFile").sort({ uploadedAt: -1 }).limit(50).lean()) as any[];
    rows = [...rows, ...old].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()).slice(0, 50);
  }
  res.json({ data: rows.map((r) => ({ id: String(r._id), fileName: r.fileName, uploadedAt: r.uploadedAt, uploadedBy: r.uploadedBy, read: r.read, inserted: r.inserted, updated: r.updated, success: (r.inserted || 0) + (r.updated || 0), rejected: r.rejected, note: r.note || "", topReason: r.topReason || "", topReasonRows: r.topReasonRows || 0, hasNotUploaded: (r.rejected || 0) > 0 })) });
}));
uploadToolsRouter.get("/:key/uploads/:id/not-uploaded", asyncHandler(async (req, res) => {
  loggedOr404(req.params.key);
  const tenant = req.auth!.tenantSlug!;
  let row = (await UploadLogModel.findOne({ _id: req.params.id, tenantSlug: tenant, toolKey: req.params.key })) as any;
  if (!row && req.params.key === "listed-doctor") row = (await DoctorUploadLogModel.findOne({ _id: req.params.id, tenantSlug: tenant })) as any;
  if (!row) throw new HttpError(404, "Upload not found");
  const raw = row.notUploadedFile;
  const buf: Buffer | null = raw ? (Buffer.isBuffer(raw) ? raw : Buffer.from((raw.buffer ?? raw) as any)) : null;
  if (!buf || !buf.length) throw new HttpError(404, row.notUploadedTruncated ? "The Not Uploaded List for this upload was too large to keep" : "This upload had no rejected records");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Not_Uploaded_List_${String(row.fileName || req.params.key).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_")}.xlsx"`);
  res.send(buf);
}));

uploadToolsRouter.post("/:key/validate", upload.single("file"), asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const inp = inputOf(req, tool.sheetName, LOGGED_TOOLS.has(tool.key) ? knownHeaders(tool) : undefined);
  if (inp.fileError) return res.json({ data: { fileName: inp.fileName, headers: tool.headers, fileErrors: [inp.fileError], total: 0, valid: 0, invalid: 0, errors: [], errorsTotal: 0, warnings: [], preview: [] } });
  const { out } = await validateRows(tool, req.auth!.tenantSlug!, inp.headers, inp.rows, 50, optsOf(req));
  if (inp.sheetNote) out.warnings.unshift({ row: 0, reason: inp.sheetNote });
  res.json({ data: { fileName: inp.fileName, headers: tool.headers, ...out, errors: out.errors.slice(0, 1000), errorsTotal: out.errors.length } });
}));

uploadToolsRouter.post("/:key/import", upload.single("file"), asyncHandler(async (req, res) => {
  const tool = toolOr404(req.params.key);
  const inp = inputOf(req, tool.sheetName, LOGGED_TOOLS.has(tool.key) ? knownHeaders(tool) : undefined);
  const who = await whoIs(req);
  if (inp.fileError) {
    const logId = LOGGED_TOOLS.has(tool.key) ? await logUpload(tool.key, req.auth!.tenantSlug!, who, inp.fileName, { total: 0, inserted: 0, updated: 0, failed: 0 }, null, inp.fileError) : undefined;
    return res.json({ data: { fileName: inp.fileName, total: 0, ok: 0, failed: 0, inserted: 0, updated: 0, skipped: 0, deactivated: 0, uploaded: false, outcome: inp.fileError, fileErrors: [inp.fileError], errors: [], warnings: [], notUploaded: null, logId } });
  }
  const result = await importRows(tool, req.auth!.tenantSlug!, who, inp.fileName, inp.headers, inp.rows, optsOf(req), inp.sheetNote);
  const logId = LOGGED_TOOLS.has(tool.key) ? await logUpload(tool.key, req.auth!.tenantSlug!, who, inp.fileName, result, result.notUploaded?.base64 || null, result.fileErrors[0] || "") : undefined;
  res.json({ data: { ...result, logId } });
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
    const fileRef = await getSlideStore().put(f.buffer, { fileName: f.originalname, mimeType: f.mimetype || "application/octet-stream", tenantSlug: tenant });   // one stored copy, referenced by every matching row
    const set: Record<string, unknown> = { fileRef, fileSize: f.size, mimeType: f.mimetype || "application/octet-stream", uploadedOn: new Date() };
    if ((f.mimetype || "").toLowerCase() === "application/pdf") {
      const m = f.buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g);
      if (m && m.length) set.pages = m.length;
    }
    for (const r of rows) { await Slides.updateOne({ _id: r._id }, { $set: set, $unset: { fileData: "" } }); if (r.fileRef && String(r.fileRef) !== fileRef) await releaseSlideFile(tenant, r.fileRef); }
    matched.push(f.originalname);
  }
  res.json({ data: { matched, unmatched } });
}));

// ═══ Slide Upload - E-Detailing (DD_Slide_Upload) ═══════════════════════════════════════════
// Storage mechanism (Round 59): the slide FILE is stored once in MongoDB GridFS (bucket "slideFiles", see utils/slide-store.ts); each brand it was uploaded for
// gets a metadata row in the existing "slideUploadEDetailing" master collection (the rows GET /field/slides and /field/slides/:id/download serve to the field app)
// holding `fileRef` -> the stored file. Rows from before this round keep their base64 `fileData` and are still served. Per-file cap stays 10 MB.
// The 5 GB allocation (+2% allowance) is counted from the real stored sizes, each stored file counted once however many brands reference it.
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
  const rows = (await Slides.find({ tenantSlug: tenant }).select("fileSize fileRef").lean()) as any[];
  const seen = new Set<string>();
  const consumed = rows.reduce((s, r) => {
    if (r.fileRef) { if (seen.has(String(r.fileRef))) return s; seen.add(String(r.fileRef)); }
    return s + (typeof r.fileSize === "number" ? r.fileSize : 0);
  }, 0);
  const limit = SLIDE_ALLOC_BYTES * SLIDE_ALLOWANCE;
  return { consumedBytes: consumed, allocatedBytes: SLIDE_ALLOC_BYTES, remainingBytes: Math.max(0, limit - consumed), limitBytes: limit };
}

uploadToolsRouter.get("/slides/meta", asyncHandler(async (req, res) => {
  const tenant = req.auth!.tenantSlug!;
  await ensureSlidesMigrated(tenant);
  const t = (await TenantModel.findOne({ slug: tenant }).lean()) as any;
  const subs = (await SubdivisionModel.find({ tenantSlug: tenant, status: "ACTIVE" }).lean()) as any[];
  const brands = (await ProductBrandModel.find({ tenantSlug: tenant, status: "ACTIVE" }).lean()) as any[];
  const u = await slideUsage(tenant);
  const uniq = (xs: unknown[]) => [...new Set(xs.map((x) => String(x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Sub Division in the slide screens is the root group (first word of the sub division names: Astra / Aura / Zivira), the value ProductBrand.division carries.
  const roots = uniq(subs.map((x) => String(x.subdivisionName || "").trim().split(/\s+/)[0]));
  const brandRows = brands.map((b) => ({ name: String(b.brandName || "").trim(), subDivision: String(b.division || "").trim() })).filter((b) => b.name);
  res.json({ data: { division: t?.name || "", subDivisions: roots, brands: uniq(brands.map((b) => b.brandName)), brandRows, ...u, maxFileBytes: SLIDE_MAX_FILE, legacySlides: await countLegacySlides(tenant) } });
}));

// Round 60 -- explicit migration of the old base64 slides into GridFS (also runs automatically on first access of meta/list/upload). Safe to re-run.
uploadToolsRouter.post("/slides/migrate", asyncHandler(async (req, res) => {
  res.json({ data: await migrateLegacySlides(req.auth!.tenantSlug!) });
}));

uploadToolsRouter.get("/slides/list", asyncHandler(async (req, res) => {
  await ensureSlidesMigrated(req.auth!.tenantSlug!);
  const Slides = getMasterModel("slideUploadEDetailing");
  const filter: Record<string, unknown> = { tenantSlug: req.auth!.tenantSlug!, ...hasSlideFile };
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
  await ensureSlidesMigrated(tenant);
  const brands = String(req.body?.brands || req.body?.brand || "").split("|").map((b) => b.trim()).filter(Boolean);
  if (!brands.length) throw new HttpError(400, "Select the Brand first");
  const subDivision = String(req.body?.subDivision || "").trim();
  const t = (await TenantModel.findOne({ slug: tenant }).lean()) as any;
  const Slides = getMasterModel("slideUploadEDetailing");
  const usage = await slideUsage(tenant);
  const need = files.reduce((s, f) => s + f.size, 0);                       // each file is stored ONCE, however many brands it is uploaded for
  if (need > usage.remainingBytes) throw new HttpError(413, `Not enough slide storage: ${(need / 1024 ** 2).toFixed(1)} MB needed, ${(usage.remainingBytes / 1024 ** 3).toFixed(2)} GB remaining`);
  const saved: { fileName: string; brand: string }[] = [];
  for (const f of files) {
    const mimeType = f.mimetype || "application/octet-stream";
    const fileRef = await getSlideStore().put(f.buffer, { fileName: f.originalname, mimeType, tenantSlug: tenant });
    let pages: number | undefined;
    if (mimeType.toLowerCase() === "application/pdf") { const m = f.buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g); if (m && m.length) pages = m.length; }
    for (const brand of brands) {
      const set: Record<string, unknown> = { tenantSlug: tenant, division: t?.name || "", subDivision, brand, fileName: f.originalname, uploadedOn: new Date(), fileRef, mimeType, fileSize: f.size, ...(pages ? { pages } : {}) };
      const existing = (await Slides.findOne({ tenantSlug: tenant, brand, subDivision, fileName: f.originalname }).select("_id fileRef").lean()) as any;
      if (existing) { await Slides.updateOne({ _id: existing._id }, { $set: set, $unset: { fileData: "" } }); if (existing.fileRef && String(existing.fileRef) !== fileRef) await releaseSlideFile(tenant, existing.fileRef); }
      else await Slides.create([set]);
      saved.push({ fileName: f.originalname, brand });
    }
  }
  res.status(201).json({ data: { saved, usage: await slideUsage(tenant) } });
}));

uploadToolsRouter.get("/slides/:id/download", asyncHandler(async (req, res) => {
  const row = (await getMasterModel("slideUploadEDetailing").findOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug! }).lean()) as any;
  const bytes = row ? await readSlideBuffer(row) : null;
  if (!row || !bytes) throw new HttpError(404, "Slide file not found");
  res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(String(row.fileName ?? "slide"))}"`);
  res.send(bytes);
}));

uploadToolsRouter.delete("/slides/:id", asyncHandler(async (req, res) => {
  const Slides = getMasterModel("slideUploadEDetailing");
  const row = (await Slides.findOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug! }).select("fileRef").lean()) as any;
  const r = await Slides.deleteOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug! });
  if (!(r as any).deletedCount) throw new HttpError(404, "Slide not found");
  if (row?.fileRef) await releaseSlideFile(req.auth!.tenantSlug!, row.fileRef);       // the stored file goes when its last brand row goes
  res.json({ data: { deleted: true, usage: await slideUsage(req.auth!.tenantSlug!) } });
}));
