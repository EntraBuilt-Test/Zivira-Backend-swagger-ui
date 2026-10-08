// Round 64 in-memory verification (no MongoDB): Flash News / Notice / Quote propagation admin -> field and manager feeds (audience, window, timezone, no ghost items).
// Run: npx tsx scripts/r64-tests/flash-news.ts
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

// Field / manager users exactly as live: username = employee code, and the user record has NO employeeCode field (so the JWT has no employeeCode claim)
reset();
const E = (code: string, name: string, desig: string, div: string, hq: string, role = "MR") => store["employees"].push(wrap({ _id: asId(200 + store["employees"].length), tenantSlug: T, employeeCode: code, name, designation: desig, role, division: div, territory: hq, status: "ACTIVE" }));
E("E0038", "Kerala Rep", "Medical Representative", "Zivira", "Kochi HQ"); E("E0144", "Chennai Rep", "Medical Representative", "Zivira", "Chennai HQ"); E("E0500", "Area Manager", "Area Business Manager", "Zivira", "Bangalore HQ", "ABM");
store["users"].push(wrap({ _id: asId(71), username: "e0038", displayName: "Kerala Rep", role: "MR", portal: "FIELD_FORCE", tenantSlug: T }), wrap({ _id: asId(72), username: "e0144", displayName: "Chennai Rep", role: "MR", portal: "FIELD_FORCE", tenantSlug: T }), wrap({ _id: asId(73), username: "e0500", displayName: "Area Manager", role: "ABM", portal: "FIELD_FORCE", tenantSlug: T }));
tokens.kerala = tok(71, "MR", "FIELD_FORCE"); tokens.chennai = tok(72, "MR", "FIELD_FORCE"); tokens.abm = tok(73, "ABM", "FIELD_FORCE");
const I = "/company/info/items";
const feed = async (as: string, portal: "field" | "manager" = "field") => { const r = await j(as, "GET", `/${portal}/info-center/feed`); assert.equal(r.status, 200, `${as} ${portal} feed: HTTP ${r.status} ${JSON.stringify(r.body)}`); return r.body.data; };
const { todayIso, inWindow } = await import("../../src/utils/info-items.js");

// 1) the live root cause: a token without an employeeCode claim used to get 403 and the portals swallowed it
assert.equal((await j("kerala", "GET", "/field/info-center/feed")).status, 200, "feed works for a user whose token has no employeeCode claim");
assert.equal((await feed("abm", "manager")).flash.length, 0, "empty feed, not an error, when nothing is published");

// 2) admin creates -> field and manager see it (audience: everyone)
const today = todayIso(new Date());
let c = await j("admin", "POST", I, { kind: "FLASH", title: "Important", body: "Sales meet on Friday", startDate: today });
assert.equal(c.status, 201, JSON.stringify(c.body)); const id1 = c.body.data.id;
assert.deepEqual((await feed("kerala")).flash.map((x: any) => x.body), ["Sales meet on Friday"]);
assert.deepEqual((await feed("chennai")).flash.map((x: any) => x.body), ["Sales meet on Friday"]);
assert.deepEqual((await feed("abm", "manager")).flash.map((x: any) => x.body), ["Sales meet on Friday"], "manager portal sees it too");
// the legacy home-panel endpoints are derived from the same feed
assert.equal((await j("kerala", "GET", "/field/announcements")).body.data.flashNews.content, "Sales meet on Friday");
assert.equal((await j("abm", "GET", "/manager/announcements")).body.data.flashNews.content, "Sales meet on Friday");
assert.equal((await j("kerala", "GET", "/field/info-center/feed")).status, 200);

// 3) audience filters: designation / division / HQ, combined
c = await j("admin", "POST", I, { kind: "FLASH", body: "ABMs only", designations: ["Area Business Manager"] }); const id2 = c.body.data.id;
c = await j("admin", "POST", I, { kind: "FLASH", body: "Kochi only", hqs: ["Kochi HQ"] });
c = await j("admin", "POST", I, { kind: "FLASH", body: "Chennai MRs", designations: ["Medical Representative"], hqs: ["Chennai HQ"], divisions: ["zivira"] });   // case-insensitive
const bodies = async (as: string, p: "field" | "manager" = "field") => (await feed(as, p)).flash.map((x: any) => x.body).sort();
assert.deepEqual(await bodies("kerala"), ["Kochi only", "Sales meet on Friday"]);
assert.deepEqual(await bodies("chennai"), ["Chennai MRs", "Sales meet on Friday"]);
assert.deepEqual(await bodies("abm", "manager"), ["ABMs only", "Sales meet on Friday"]);
// a restricted item that matches nobody must not fall back to any old content
assert.ok(!(await bodies("kerala")).some((b: string) => /testing/i.test(b)));

// 4) windows: open-ended start/end, expired, future, and the company-timezone day
const day = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
await j("admin", "POST", I, { kind: "NOTICE", title: "Open ended", body: "No end date", startDate: day(-3) });
await j("admin", "POST", I, { kind: "NOTICE", title: "No start", body: "No start date", endDate: day(2) });
await j("admin", "POST", I, { kind: "NOTICE", title: "Expired", body: "gone", endDate: day(-1) });
await j("admin", "POST", I, { kind: "NOTICE", title: "Future", body: "later", startDate: day(1) });
await j("admin", "POST", I, { kind: "NOTICE", title: "Ends today", body: "last day", endDate: today });
assert.deepEqual((await feed("kerala")).notices.map((n: any) => n.title).sort(), ["Ends today", "No start", "Open ended"]);
// 00:30 IST on 9 Oct is still 8 Oct in UTC: the company day is the IST day
const ist = new Date("2026-10-08T19:00:00Z");                                   // = 2026-10-09 00:30 IST
assert.equal(todayIso(ist), "2026-10-09"); assert.equal(todayIso(ist, "UTC"), "2026-10-08");
assert.ok(inWindow({ startDate: "2026-10-09", endDate: null }, todayIso(ist)), "an item starting today shows right after local midnight");
assert.ok(!inWindow({ startDate: null, endDate: "2026-10-08" }, todayIso(ist)), "an item that ended yesterday is gone right after local midnight");
assert.equal(todayIso(new Date("2026-10-08T10:00:00Z"), "Not/AZone"), "2026-10-08", "bad timezone falls back to UTC date");
assert.equal((await j("admin", "POST", I, { kind: "FLASH", body: "bad", startDate: "08-10-2026" })).status, 400);
assert.equal((await j("admin", "POST", I, { kind: "FLASH", body: "bad", startDate: day(2), endDate: day(1) })).status, 400);

// 5) edit bumps the version (so "don't show again" re-arms) and shows at once; deactivate and delete remove at once
const v1 = (await feed("kerala")).flash.find((x: any) => x.id === id1).version;
assert.equal((await j("admin", "PATCH", `${I}/${id1}`, { body: "Sales meet moved to Saturday" })).status, 200);
const after = (await feed("kerala")).flash.find((x: any) => x.id === id1); assert.equal(after.body, "Sales meet moved to Saturday"); assert.equal(after.version, v1 + 1);
await j("admin", "PATCH", `${I}/${id1}`, { active: false }); assert.ok(!(await bodies("kerala")).includes("Sales meet moved to Saturday"));
await j("admin", "PATCH", `${I}/${id1}`, { active: true }); assert.ok((await bodies("kerala")).includes("Sales meet moved to Saturday"));
assert.equal((await j("admin", "DELETE", `${I}/${id1}`)).status, 200); assert.ok(!(await bodies("kerala")).includes("Sales meet moved to Saturday"));
await j("admin", "DELETE", `${I}/${id2}`); assert.ok(!(await bodies("abm", "manager")).includes("ABMs only"));

// 6) the old single-document settings are NOT delivered any more (the "Testing" ghost): neither feed nor home-panel endpoints
store["companyconfigs"] = [{ tenantSlug: T, key: "adminSettings:flashNews", value: { content: "Testing" } }, { tenantSlug: T, key: "adminSettings:quoteOfTheWeek", value: { quote: "Testing quote" } }, { tenantSlug: T, key: "adminSettings:talkToUs", value: { content: "Call HR" } }];
for (const kind of ["FLASH", "NOTICE", "QUOTE"]) for (const it of (await j("admin", "GET", `${I}?kind=${kind}`)).body.data) await j("admin", "DELETE", `${I}/${it.id}`);
const empty = await feed("kerala"); assert.deepEqual([empty.flash, empty.notices, empty.quote], [[], [], null]); assert.equal(empty.talkInfo, "Call HR");
const ann = (await j("kerala", "GET", "/field/announcements")).body.data; assert.deepEqual([ann.flashNews, ann.noticeBoard, ann.quoteOfTheWeek], [null, null, null]);
assert.equal((await j("abm", "GET", "/manager/announcements")).body.data.flashNews, null);

// 7) quote + notice reach both portals; no cache header allows a stale copy
await j("admin", "POST", I, { kind: "QUOTE", body: "Well begun is half done", author: "Aristotle" });
assert.equal((await feed("kerala")).quote.author, "Aristotle"); assert.equal((await feed("abm", "manager")).quote.body, "Well begun is half done");
assert.equal((await fetch(`${base}/field/info-center/feed`, { headers: { authorization: `Bearer ${tokens.kerala}` } })).headers.get("cache-control"), "no-store");
// a user with no employee record still gets the everyone-items instead of an error; Talk to Us still needs a real employee
store["users"].push(wrap({ _id: asId(79), username: "ghost", displayName: "Ghost", role: "MR", portal: "FIELD_FORCE", tenantSlug: T })); tokens.ghost = tok(79, "MR", "FIELD_FORCE");
assert.equal((await feed("ghost")).quote.author, "Aristotle");
assert.equal((await j("ghost", "POST", "/field/info-center/talk", { subject: "x", message: "y" })).status, 403);
console.log("flash news ok: no-claim tokens served (the live root cause), audience (designation/division/HQ, case-insensitive), windows (open-ended, expired, future, IST day), edit/deactivate/delete visible at once, legacy ghost removed, manager + field + home-panel endpoints agree");
console.log("ALL flash-news CHECKS PASSED"); server.close(); process.exit(0);
