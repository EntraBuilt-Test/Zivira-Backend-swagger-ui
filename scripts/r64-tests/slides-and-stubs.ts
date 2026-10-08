// Round 64 in-memory verification (no MongoDB): Slide Upload - E-Detailing (tags, filters, order, priority), slide migration idempotency, manager stub merge.
// Run: npx tsx scripts/r64-tests/slides-and-stubs.ts
import mongoose from "mongoose";
import sift from "sift";

const store: Record<string, any[]> = {};
const asId = (n: number) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"));
let seq = 9000;
const wrap = (d: any) => {
  if (!d || d.__wrapped) return d;
  Object.defineProperty(d, "__wrapped", { value: true, enumerable: false });
  Object.defineProperty(d, "save", { value: function () { return Promise.resolve(this); }, enumerable: false });
  Object.defineProperty(d, "toObject", { value: function () { return JSON.parse(JSON.stringify(this), (k, v) => (k === "createdAt" || k === "updatedAt" || /At$|Date$|from$|to$/.test(k)) && typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v); }, enumerable: false });
  return d;
};
const norm = (f: any): any => JSON.parse(JSON.stringify(f ?? {}), (_k, v) => v);
const matcher = (f: any) => {
  const g = { ...(f || {}) };
  if (g._id !== undefined && typeof g._id !== "object") g._id = String(g._id);
  return (d: any) => sift({ ...g, ...(g._id !== undefined ? { _id: undefined } : {}) })({ ...d, _id: undefined }) && (g._id === undefined || String(d._id) === String(g._id));
};
const matchOne = (f: any) => {
  const clean: any = {}; let id: any;
  for (const [k, v] of Object.entries(f || {})) { if (k === "_id") id = v; else clean[k] = v; }
  const s = sift(clean);
  return (d: any) => s(d) && (id === undefined || (typeof id === "object" && id && "$ne" in (id as any) ? String(d._id) !== String((id as any).$ne) : String(d._id) === String(id)));
};
const coll = (m: any) => store[m.collection.name] || (store[m.collection.name] = []);
class Q {
  constructor(public docs: any[]) {}
  select() { return this; } lean() { return this; } populate() { return this; }
  sort(spec: any) { const [k, dir] = Object.entries(spec)[0] as [string, number]; this.docs = [...this.docs].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir < 0 ? -1 : 1)); return this; }
  limit(n: number) { this.docs = this.docs.slice(0, n); return this; }
  then(res: any, rej: any) { return Promise.resolve(this.docs.map(wrap)).then(res, rej); }
}
class Q1 extends Q { then(res: any, rej: any) { return Promise.resolve(wrap(this.docs[0] ?? null)).then(res, rej); } }
const M: any = mongoose.Model;
M.find = function (f: any = {}) { return new Q(coll(this).filter(matchOne(f))); };
M.findOne = function (f: any = {}) { return new Q1(coll(this).filter(matchOne(f))); };
M.findById = function (id: any) { return new Q1(coll(this).filter((d) => String(d._id) === String(id))); };
M.countDocuments = function (f: any = {}) { return Promise.resolve(coll(this).filter(matchOne(f)).length); };
M.distinct = function (k: string, f: any = {}) { return Promise.resolve([...new Set(coll(this).filter(matchOne(f)).map((d) => d[k]))]); };
M.create = function (arg: any) { const arr = Array.isArray(arg) ? arg : [arg]; const made = arr.map((d: any) => { const doc = wrap({ _id: asId(seq++), createdAt: new Date(), updatedAt: new Date(), ...d }); coll(this).push(doc); return doc; }); return Promise.resolve(Array.isArray(arg) ? made : made[0]); };
const applyUpdate = (d: any, u: any) => { Object.assign(d, u.$set || {}); for (const [k, v] of Object.entries(u.$push || {})) (d[k] ||= []).push(v); for (const [k, v] of Object.entries(u.$addToSet || {})) { (d[k] ||= []); if (!d[k].includes(v)) d[k].push(v); } d.updatedAt = new Date(); };
M.updateOne = function (f: any, u: any) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); return Promise.resolve({ matchedCount: d ? 1 : 0 }); };
M.updateMany = function (f: any, u: any) { const ds = coll(this).filter(matchOne(f)); ds.forEach((d) => applyUpdate(d, u)); return Promise.resolve({ modifiedCount: ds.length }); };
M.findOneAndUpdate = function (f: any, u: any) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); return Promise.resolve(wrap(d ?? null)); };
M.deleteMany = function (f: any = {}) { const c = coll(this); const hit = new Set(c.filter(matchOne(f))); const keep = c.filter((d) => !hit.has(d)); c.length = 0; c.push(...keep); return Promise.resolve({ deletedCount: hit.size }); };
M.deleteOne = function (f: any = {}) { const c = coll(this); const d = c.find(matchOne(f)); if (d) c.splice(c.indexOf(d), 1); return Promise.resolve({ deletedCount: d ? 1 : 0 }); };

(Q.prototype as any).skip = function (n: number) { this.docs = this.docs.slice(n); return this; };
M.aggregate = function () { return Promise.resolve([]); };
M.updateOne = function (f: any, u: any, o: any = {}) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); else if (o.upsert) coll(this).push(wrap({ _id: asId(seq++), createdAt: new Date(), ...f, ...(u.$set || {}) })); return Promise.resolve({ matchedCount: d ? 1 : 0 }); };

import assert from "node:assert";
import http from "node:http";
import express from "express";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const T = "demo";
store["users"] = [
  wrap({ _id: asId(1), username: "admin", displayName: "Corporate HQ", role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T }),
  wrap({ _id: asId(2), username: "m1", displayName: "Meera Shah", role: "ABM", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(3), username: "mr1", displayName: "Rahul Mehta", role: "MR", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(4), username: "mr2", displayName: "Sneha Iyer", role: "MR", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(5), username: "admin2", displayName: "Second Admin", role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T })
];
store["employees"] = [];
const emp = (code: string, name: string, role: string, mgr?: string, extra: any = {}) => store["employees"].push(wrap({ _id: asId(100 + store["employees"].length), tenantSlug: T, employeeCode: code, name, role, designation: role, division: "Zivira", territory: "Vadodara", state: "Gujarat", reportingManager: mgr, status: "ACTIVE", ...extra }));
emp("M1", "Meera Shah", "ABM"); emp("MR1", "Rahul Mehta", "MR", "M1"); emp("MR2", "Sneha Iyer", "MR", "M1"); emp("X9", "Outside Rep", "MR", "M9");

const { uploadToolsRouter } = await import("../../src/routes/upload-tools.routes.js");
const { companyRouter } = await import("../../src/routes/company.routes.js");
const { managerRouter } = await import("../../src/routes/manager.routes.js");
const { fieldRouter } = await import("../../src/routes/field.routes.js");
const { HttpError } = await import("../../src/http/errors.js");
const { signToken } = await import("../../src/http/auth.js");
const { GENERATE_COLUMNS } = await import("../../src/utils/upload-tools.js");
const { LISTEDDR_HEADERS } = await import("../../src/utils/r46-reports.js");

const app = express();
app.use(express.json());
app.use("/api/company", companyRouter);          // includes /company/upload-tools behind requireAuth + requireCompanyAdmin
app.use("/api/manager", managerRouter);
app.use("/api/field", fieldRouter);
app.use((err: any, _req: any, res: any, _next: any) => { res.status(err instanceof HttpError ? err.statusCode : err?.name === "ZodError" ? 400 : 500).json({ error: err.message }); });
const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
const tok = (id: number, role: string, portal: string) => signToken({ sub: String(asId(id)), role, portal, tenantSlug: T } as any);
const tokens: Record<string, string> = { admin: tok(1, "COMPANY_ADMIN", "COMPANY_ADMIN"), admin2: tok(5, "COMPANY_ADMIN", "COMPANY_ADMIN"), m1: tok(2, "ABM", "FIELD_FORCE"), mr1: tok(3, "MR", "FIELD_FORCE"), mr2: tok(4, "MR", "FIELD_FORCE") };
const j = async (as: string, method: string, url: string, body?: any) => { const r = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${tokens[as]}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
const bin = async (as: string, url: string, init: any = {}) => { const r = await fetch(`${base}${url}`, { ...init, headers: { authorization: `Bearer ${tokens[as]}`, ...(init.headers || {}) } }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "" }; };
const UP = "/company/upload-tools/listed-doctor";
const xl = (headers: string[], rows: unknown[][], sheet = "Listed Doctor Upload") => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), sheet); return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer; };
import fs from "node:fs";
const F = (n: string) => fs.readFileSync(new URL(`../r63-tests/fixtures/${n}`, import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = async (key: string, buf: Buffer, name: string, fields: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); fd.append("file", new Blob([buf]), name); const r = await fetch(`${base}/company/upload-tools/${key}/import`, { method: "POST", headers: { authorization: `Bearer ${tokens.admin}` }, body: fd }); assert.equal(r.status, 200, `${key}: HTTP ${r.status}`); return ((await r.json()) as any).data; };
const logs = async (key: string) => { const r = await j("admin", "GET", `/company/upload-tools/${key}/uploads`); assert.equal(r.status, 200); return r.body.data as any[]; };
const rowsOf = (buf: Buffer, sheet?: string) => { const wb = XLSX.read(buf, { type: "buffer" }); return XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet || wb.SheetNames[0]]); };
const col = (n: string) => (store[n] ||= []);
// field users named after employee codes (field routes resolve the profile from the username)
for (const [id, code] of [[61, "E0038"], [62, "E0048"], [63, "E0095"]] as const) { store["users"].push(wrap({ _id: asId(id), username: code.toLowerCase(), displayName: code, role: "MR", portal: "FIELD_FORCE", tenantSlug: T })); tokens[code] = tok(id, "MR", "FIELD_FORCE"); }
const { getMasterModel } = await import("../../src/models/master-record.model.js");
const { StateModel } = await import("../../src/models/state.model.js");
const { LeaveTypeModel } = await import("../../src/models/leave-type.model.js");
const reset = () => { for (const k of ["employees", "products", "dealers", "doctors", "stockists", "productrates", "productRates", "dispatches", "despatchLogs", "holidays", "leave_applications", "despatch_logs", "uploadLogs", "uploadHistories", "states", "leaveTypes", "targetMaster", "inputMaster", "productMaster"]) store[k] = []; for (const k of Object.keys(store)) if (/master|Master/.test(k)) store[k] = []; };
const names = () => Object.keys(store);

const { setSlideStore, resetSlideMigrationState } = await import("../../src/utils/slide-store.js");
const slideFiles = new Map<string, Buffer>(); let slideSeq = 1;
setSlideStore({ put: async (buf) => { const id = `f${slideSeq++}`; slideFiles.set(id, Buffer.from(buf)); return id; }, read: async (id) => { const b = slideFiles.get(id); if (!b) throw new Error("missing"); return b; }, remove: async (id) => { slideFiles.delete(id); } });
const slidePost = async (files: [string, Buffer][], fields: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); for (const [n, b] of files) fd.append("files", new Blob([b], { type: "application/pdf" }), n); const r = await fetch(`${base}/company/upload-tools/slides/upload`, { method: "POST", headers: { authorization: `Bearer ${tokens.admin}` }, body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const mk = (coll: string, rows: any[]) => { store[coll] = rows.map((r, i) => wrap({ _id: asId(5000 + store[coll]?.length + i || 5000 + i), tenantSlug: T, status: "ACTIVE", ...r })); };
const SL = "/company/upload-tools/slides";
{ const { CompanyConfigModel } = await import("../../src/models/company-config.model.js");   // the harness's findOneAndUpdate has no upsert; this model needs it
  (CompanyConfigModel as any).findOneAndUpdate = function (f: any, u: any) { const c = coll(this); const d = c.find(matchOne(f)); if (d) applyUpdate(d, u); else c.push(wrap({ _id: asId(seq++), ...f, ...(u.$set || {}) })); return Promise.resolve(true); }; }

// ═══ 12) Slide Upload - E-Detailing
{ store["tenants"] = [wrap({ _id: asId(900), slug: T, name: "Zivira Labs Pvt Ltd" })];
  store["subdivisions"] = [{ subdivisionName: "Aura Eye" }, { subdivisionName: "Astra Care" }].map((r, i) => wrap({ _id: asId(901 + i), tenantSlug: T, status: "ACTIVE", ...r }));
  // EMPTY masters first: dropdowns come back empty, never invented
  let m = (await j("admin", "GET", `${SL}/meta`)).body.data;
  assert.deepEqual([m.specialities, m.therapies, m.productRows], [[], [], []]); assert.deepEqual(m.subDivisions, ["Astra", "Aura"]);
  assert.deepEqual((await j("admin", "GET", `/company/masters/slideUploadEDetailing/action/priority-list?type=Speciality&subDivision=Aura`)).body.data, []);
  assert.deepEqual((await j("admin", "GET", `/company/masters/slideUploadEDetailing/action/priority-list?type=Therapy&subDivision=Aura`)).body.data, []);
  // real masters
  store["productBrands"] = [["NEPAWEL", "Aura"], ["ZIVIMOX", "Aura"], ["ASTRAGEL", "Astra"]].map(([brandName, division], i) => wrap({ _id: asId(910 + i), tenantSlug: T, status: "ACTIVE", brandName, division }));
  store["products"] = [["NEPAWEL EYE DROPS", "NEPAWEL", "Aura Eye"], ["ZIVIMOX-D", "ZIVIMOX", "Aura Eye"], ["ASTRAGEL 10G", "ASTRAGEL", "Astra Care"]].map(([productName, brandName, subDivision], i) => wrap({ _id: asId(920 + i), tenantSlug: T, status: "ACTIVE", productName, brandName, subDivision }));
  store["doctorSpecialities"] = ["GLAUCO", "RETINA"].map((specialityName, i) => wrap({ _id: asId(930 + i), tenantSlug: T, status: "ACTIVE", specialityName }));
  store["productGroups"] = [["BRINZOLAMIDE", "AG"], ["MOXIFLOXACIN", "AI"]].map(([moleculeName, therapyName], i) => wrap({ _id: asId(940 + i), tenantSlug: T, status: "ACTIVE", moleculeName, therapyName }));
  m = (await j("admin", "GET", `${SL}/meta`)).body.data;
  assert.deepEqual(m.specialities, ["GLAUCO", "RETINA"]); assert.deepEqual(m.therapies, ["AG", "AI"]);
  assert.deepEqual(m.productRows.map((p: any) => [p.name, p.subDivision]).sort(), [["ASTRAGEL 10G", "Astra"], ["NEPAWEL EYE DROPS", "Aura"], ["ZIVIMOX-D", "Aura"]]);
  assert.deepEqual((await j("admin", "GET", `/company/masters/slideUploadEDetailing/action/priority-list?type=Speciality&subDivision=Aura`)).body.data.map((x: any) => x.item), ["GLAUCO", "RETINA"]);
  assert.deepEqual((await j("admin", "GET", `/company/masters/slideUploadEDetailing/action/priority-list?type=Brand&subDivision=Aura`)).body.data.map((x: any) => x.item), ["NEPAWEL", "ZIVIMOX"], "brand priority list is scoped to the Sub Division");

  // upload: two files, two brands, tagged
  const pdf = Buffer.from("%PDF-1.4\n/Type /Page\n/Type /Page\n%%EOF");
  let up = await slidePost([["detail-a.pdf", pdf], ["detail-b.pdf", Buffer.from("%PDF-1.4\n/Type /Page\n%%EOF")]], { subDivision: "Aura", brands: "NEPAWEL|ZIVIMOX", products: "NEPAWEL EYE DROPS", specialities: "GLAUCO", therapies: "AG" });
  assert.equal(up.status, 201); assert.equal(up.body.data.saved.length, 4);
  up = await slidePost([["retina.pdf", pdf]], { subDivision: "Aura", brands: "ZIVIMOX", specialities: "RETINA" }); assert.equal(up.status, 201);
  assert.equal((await slidePost([["x.pdf", pdf]], { subDivision: "Aura" })).status, 400, "brand is required");
  assert.equal((await slidePost([], { subDivision: "Aura", brands: "NEPAWEL" })).status, 400);
  const list = async (q: string) => (await j("admin", "GET", `${SL}/list?${q}`)).body.data as any[];
  assert.equal((await list("subDivision=Aura")).length, 5);
  assert.equal((await list("subDivision=Aura&brands=NEPAWEL")).length, 2);
  assert.equal((await list("subDivision=Aura&specialities=RETINA")).length, 1);
  assert.equal((await list("subDivision=Aura&therapies=AG")).length, 4);
  assert.equal((await list("subDivision=Aura&products=NEPAWEL%20EYE%20DROPS&specialities=GLAUCO")).length, 4);
  assert.equal((await list("subDivision=Aura&brands=NEPAWEL&specialities=RETINA")).length, 0, "No Records Found!");
  assert.equal((await list("subDivision=Astra")).length, 0);
  assert.deepEqual((await list("subDivision=Aura&specialities=GLAUCO"))[0].therapies, ["AG"]);
  assert.equal((await list("subDivision=Aura")).find((r) => r.fileName === "detail-a.pdf").pages, 2);
  // re-upload the same file name for the same brand replaces instead of duplicating
  await slidePost([["detail-a.pdf", pdf]], { subDivision: "Aura", brands: "NEPAWEL", specialities: "GLAUCO" });
  assert.equal((await list("subDivision=Aura&brands=NEPAWEL")).length, 2);
  m = (await j("admin", "GET", `${SL}/meta`)).body.data; assert.ok(m.consumedBytes > 0 && m.remainingBytes < m.allocatedBytes * 1.02);

  // Priority: slide order per tagged item, saved and visible to the field app in that order
  const g = await list("subDivision=Aura&specialities=GLAUCO"); assert.equal(g.length, 4);
  const nepa = g.filter((r) => r.brand === "NEPAWEL"); const ids = [nepa.find((r) => r.fileName === "detail-b.pdf").id, nepa.find((r) => r.fileName === "detail-a.pdf").id];
  assert.equal((await j("admin", "POST", `${SL}/order`, { ids })).body.data.ordered, 2);
  const fs1 = (await j("mr1", "GET", `/field/slides?brand=NEPAWEL`)).body.data; assert.deepEqual(fs1.map((r: any) => r.fileName), ["detail-b.pdf", "detail-a.pdf"], "field app sees the admin order");
  assert.equal((await j("mr1", "GET", `/field/slides?speciality=RETINA`)).body.data.length, 1);
  assert.equal((await j("mr1", "GET", `/field/slides?therapy=AG`)).body.data.length, 3, "the re-uploaded copy carries its new tags (no therapy)");
  assert.equal((await j("admin", "POST", `${SL}/order`, { ids: [] })).status, 400);
  // brand priority via the bulk endpoint
  assert.equal((await j("admin", "POST", `/company/masters/slideUploadEDetailing/action/priority-order`, { type: "Brand", subDivision: "Aura", items: ["ZIVIMOX", "NEPAWEL"] })).body.data.count, 2);
  const bl = (await j("admin", "GET", `/company/masters/slideUploadEDetailing/action/priority-list?type=Brand&subDivision=Aura`)).body.data;
  assert.deepEqual(bl.sort((a: any, b: any) => a.priority - b.priority).map((x: any) => x.item), ["ZIVIMOX", "NEPAWEL"]);
  // download + delete
  const one = g[0]; const dl = await bin("admin", `/company/upload-tools/slides/${one.id}/download`); assert.equal(dl.status, 200); assert.ok(dl.buf.length > 5);
  assert.equal((await j("admin", "DELETE", `${SL}/${one.id}`)).status, 200); assert.equal((await list("subDivision=Aura")).length, 4);
  console.log("12 slides ok: empty masters give empty dropdowns, tags + filters, replace on same name, field order, brand priority bulk, download and delete"); }

// ═══ Round 60 leftovers: migration is idempotent
{ const Slides = col("slideUploadEDetailing"); const body = Buffer.from("%PDF legacy").toString("base64");
  for (let i = 0; i < 3; i++) Slides.push(wrap({ _id: asId(7000 + i), tenantSlug: T, brand: ["NEPAWEL", "ZIVIMOX", "NEPAWEL"][i], subDivision: "Aura", fileName: i === 2 ? "other.pdf" : "legacy.pdf", mimeType: "application/pdf", fileData: body, uploadedOn: new Date() }));
  resetSlideMigrationState();
  let meta = (await j("admin", "GET", `${SL}/meta`)).body.data;                       // first access migrates on its own
  assert.equal(meta.legacySlides, 0, "auto-migrated on first access");
  const r1 = (await j("admin", "POST", `${SL}/migrate`)).body.data; assert.equal(r1.legacyBefore, 0, "second run finds nothing");
  const files = slideFiles.size; const r2 = (await j("admin", "POST", `${SL}/migrate`)).body.data; assert.equal(r2.rowsMigrated, 0); assert.equal(slideFiles.size, files, "no duplicate files stored");
  const mig = Slides.filter((s: any) => s.fileName === "legacy.pdf"); assert.equal(mig.length, 2); assert.equal(mig[0].fileRef, mig[1].fileRef, "the same file is stored once for both brands");
  const dl = await bin("admin", `/company/upload-tools/slides/${String(mig[0]._id)}/download`); assert.equal(dl.buf.toString(), "%PDF legacy");
  // a fresh legacy row after the first run + explicit migrate (the button)
  Slides.push(wrap({ _id: asId(7100), tenantSlug: T, brand: "ZIVIMOX", subDivision: "Aura", fileName: "late.pdf", mimeType: "application/pdf", fileData: body, uploadedOn: new Date() }));
  meta = (await j("admin", "GET", `${SL}/meta`)).body.data; assert.equal(meta.legacySlides, 1, "button count shows what is left");
  const r3 = (await j("admin", "POST", `${SL}/migrate`)).body.data; assert.deepEqual([r3.rowsMigrated, r3.rowsFailed, r3.legacyAfter], [1, 0, 0]);
  assert.equal((await j("admin", "POST", `${SL}/migrate`)).body.data.rowsMigrated, 0);
  console.log("round60 slide migration idempotent: auto on first access, button run, re-runs move nothing, one stored copy per file"); }

// ═══ Round 60 leftovers: manager stub created by Salesforce is merged by a later upload with the real code, or completed from the master
{ reset();
  let r = await post("field-force", F("Salesforce_READY_TO_UPLOAD.xlsx"), "sf.xlsx");
  const stubs = store["employees"].filter((e: any) => e.codePending); assert.ok(stubs.length >= 2, "stubs created");
  const before = store["employees"].length;
  const [a0, b0] = stubs; const a = { employeeCode: a0.employeeCode, name: a0.name }, b = { employeeCode: b0.employeeCode };   // plain copies: the store documents are renamed in place
  // (1) later upload carries the REAL code for stub a: merged, no duplicate, reports re-linked
  const reports = store["employees"].filter((e: any) => e.reportingManager === a.employeeCode).length; assert.ok(reports > 0);
  const hdr = Object.keys(rowsOf(F("Salesforce_READY_TO_UPLOAD.xlsx"), "UPL_SalesForce")[0]);
  const find = (re: RegExp) => hdr.find((h) => re.test(h))!;
  const row: any = Object.fromEntries(hdr.map((h) => [h, ""]));
  row[find(/employee.*code/i)] = "E9001"; row[find(/^(employee )?name|field force name/i)] = a.name; row[find(/designation/i)] = "ABM"; row[find(/^hq/i)] = "Chennai";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([row], { header: hdr }), "UPL_SalesForce");
  r = await post("field-force", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, "real-code.xlsx");
  assert.equal(r.failed, 0, JSON.stringify(r.errors)); assert.deepEqual(r.mergedManagers.map((x: any) => x.code), ["E9001"], "merged into the stub");
  assert.equal(store["employees"].length, before, "no duplicate employee"); assert.ok(!store["employees"].some((e: any) => e.employeeCode === a.employeeCode), "stub code gone");
  assert.equal(store["employees"].filter((e: any) => e.reportingManager === "E9001").length, reports, "every report re-linked to the real code");
  assert.ok(!store["employees"].find((e: any) => e.employeeCode === "E9001").codePending);
  // (2) the admin completes stub b from the Field Force master (PATCH)
  const reportsB = store["employees"].filter((e: any) => e.reportingManager === b.employeeCode).length;
  const p = await j("admin", "PATCH", `/company/employees/${encodeURIComponent(b.employeeCode)}`, { employeeCode: "E9002" }); assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(store["employees"].filter((e: any) => e.reportingManager === "E9002").length, reportsB); assert.ok(!store["employees"].some((e: any) => e.employeeCode === b.employeeCode));
  console.log(`round60 stub merge ok: ${stubs.length} stub(s); one merged by an upload with the real code, one completed from the master, reports re-linked, no duplicates`); }

console.log("ALL r64 CHECKS PASSED"); server.close(); process.exit(0);
