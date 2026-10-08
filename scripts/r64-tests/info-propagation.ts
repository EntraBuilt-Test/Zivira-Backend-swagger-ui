// Round 64 in-memory verification (no MongoDB): Flash / Notice / Quote reach REAL demo employees (Salesforce pack: BE / ABM, "Zivira Labs Pvt Ltd", BANGALORE) with tolerant audience matching.
// Run: npx tsx scripts/r64-tests/info-propagation.ts
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

const I = "/company/info/items";
reset();
const sf = await post("field-force", F("Salesforce_READY_TO_UPLOAD.xlsx"), "sf.xlsx"); assert.equal(sf.inserted, 71);
const emps = store["employees"].filter((e: any) => !e.codePending);
const be = emps.find((e: any) => e.designation === "BE" && /bangalore/i.test(e.territory)); const abm = emps.find((e: any) => e.designation === "ABM");
assert.ok(be && abm, "demo BE in BANGALORE and a demo ABM exist");
const beKerala = emps.find((e: any) => e.designation === "BE" && /ernakulam/i.test(e.territory));
const mkUser = (id: number, e: any, role: string) => { store["users"].push(wrap({ _id: asId(id), username: String(e.employeeCode).toLowerCase(), displayName: e.name, role, portal: "FIELD_FORCE", tenantSlug: T })); return tok(id, role, "FIELD_FORCE"); };
tokens.be = mkUser(81, be, "MR"); tokens.abm = mkUser(82, abm, "ABM"); tokens.kerala = mkUser(83, beKerala, "MR");
const feed = async (as: string, portal: "field" | "manager") => { const r = await j(as, "GET", `/${portal}/info-center/feed`); assert.equal(r.status, 200, `${as}/${portal}: ${r.status} ${JSON.stringify(r.body)}`); return r.body.data; };
const today = new Date().toISOString().slice(0, 10);
const day = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mk = async (kind: string, body: any) => { const r = await j("admin", "POST", I, { kind, ...body }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data; };
const bodies = (xs: any[]) => xs.map((x) => x.body).sort();

// real demo employees really carry short designations / the company name as division / upper-case HQ
assert.equal(be.designation, "BE"); assert.match(be.division, /Zivira Labs|Astra/i); assert.equal(abm.designation, "ABM");

// 1) every kind, empty audience = everyone; field BE and manager ABM both get all three
await mk("FLASH", { body: "F-all" }); await mk("NOTICE", { title: "N", body: "N-all" }); await mk("QUOTE", { body: "Q-all", author: "A" });
for (const [as, portal] of [["be", "field"], ["abm", "manager"], ["kerala", "field"]] as const) { const f = await feed(as, portal); assert.deepEqual([bodies(f.flash), bodies(f.notices), f.quote.body], [["F-all"], ["N-all"], "Q-all"], `${as} ${portal}`); }

// 2) tolerant audience: the admin picks "Medical Representative" / "Zivira" / "Bangalore HQ"; the real BE has "BE" / "Zivira Labs Pvt Ltd" / "BANGALORE"
await mk("FLASH", { body: "F-mr", designations: ["Medical Representative"] });
await mk("FLASH", { body: "F-abm", designations: ["Area Business Manager"] });
await mk("FLASH", { body: "F-bgl", hqs: ["Bangalore HQ"] });
await mk("FLASH", { body: "F-chn", hqs: ["Chennai HQ"] });
await mk("NOTICE", { title: "Div", body: "N-zivira", divisions: ["zivira"] });            // lower-case, the old duplicate spelling still works
await mk("QUOTE", { body: "Q-abm-only", designations: ["ABM"], pinned: true });
let f = await feed("be", "field");
assert.deepEqual(bodies(f.flash), ["F-all", "F-bgl", "F-mr"].sort(), "BE sees MR + Bangalore, not ABM-only / Chennai");
assert.ok(f.notices.some((n: any) => n.body === "N-zivira") === /zivira/i.test(be.division));
assert.equal(f.quote.body, "Q-all", "the ABM-only quote is not for a BE");
f = await feed("abm", "manager");
assert.ok(f.flash.some((x: any) => x.body === "F-abm") && !f.flash.some((x: any) => x.body === "F-mr"), "ABM sees the ABM item, not the MR one");
assert.equal(f.quote.body, "Q-abm-only", "pinned ABM quote wins for the ABM");
f = await feed("kerala", "field"); assert.ok(!f.flash.some((x: any) => x.body === "F-bgl"), "Kerala BE does not get the Bangalore item");
// "Senior Medical Representative" is NOT a plain BE
await mk("FLASH", { body: "F-sr", designations: ["Senior Medical Representative"] }); assert.ok(!(await feed("be", "field")).flash.some((x: any) => x.body === "F-sr"));

// 3) windows: expired / future / open-ended
await mk("FLASH", { body: "F-expired", endDate: day(-1) }); await mk("FLASH", { body: "F-future", startDate: day(1) }); await mk("FLASH", { body: "F-open", startDate: day(-5) });
f = await feed("be", "field"); assert.ok(f.flash.some((x: any) => x.body === "F-open") && !f.flash.some((x: any) => /expired|future/.test(x.body)));

// 4) edit bumps the version and is visible at once; delete removes at once; for both portals and the home-panel endpoints
const n1 = (await feed("be", "field")).notices.find((n: any) => n.body === "N-all"); assert.equal(n1.version, 1);
assert.equal((await j("admin", "PATCH", `${I}/${n1.id}`, { body: "N-all edited" })).status, 200);
for (const [as, portal] of [["be", "field"], ["abm", "manager"]] as const) { const n = (await feed(as, portal)).notices.find((x: any) => x.id === n1.id); assert.deepEqual([n.body, n.version], ["N-all edited", 2]); }
assert.match((await j("be", "GET", "/field/announcements")).body.data.noticeBoard.content1, /N-all edited/);
assert.match((await j("abm", "GET", "/manager/announcements")).body.data.noticeBoard.content1, /edited/);
await j("admin", "DELETE", `${I}/${n1.id}`);
for (const [as, portal] of [["be", "field"], ["abm", "manager"]] as const) assert.ok(!(await feed(as, portal)).notices.some((x: any) => x.id === n1.id));

// 5) audience pick-list hygiene: dedupe case-insensitively, hide test entries and inactive HQ masters, keep distinct names
reset();
const E = (code: string, desig: string, div: string, hq: string, status = "ACTIVE") => store["employees"].push(wrap({ _id: asId(300 + store["employees"].length), tenantSlug: T, employeeCode: code, name: code, designation: desig, division: div, territory: hq, status, role: "MR" }));
E("A1", "Medical Representative", "Zivira", "Chennai HQ"); E("A2", "Medical Representative", "zivira", "Chennai"); E("A3", "testing", "Zivira", "Mumbai"); E("A4", "Area Business Manager", "Aura", "Mumbai HQ");
E("A5", "Test", "Astra", "Mumbai Central"); E("A6", "Retired Rep", "Retired", "Old Town", "INACTIVE"); E("A7", "Senior Medical Representative", "Cardio Diabetes", "Old HQ");
store["headQuarters"] = [wrap({ _id: asId(400), tenantSlug: T, headQuarterName: "Old HQ", status: "INACTIVE" })];
const ao = (await j("admin", "GET", "/company/info/audience-options")).body.data;
assert.deepEqual(ao.designations, ["Area Business Manager", "Medical Representative", "Senior Medical Representative"], "no testing / Test, no duplicates");
assert.deepEqual(ao.divisions, ["Astra", "Aura", "Cardio Diabetes", "Zivira"], "Zivira once, properly cased; the inactive employee's division is gone");
assert.deepEqual(ao.hqs, ["Chennai", "Chennai HQ", "Mumbai", "Mumbai Central", "Mumbai HQ"], "distinct HQ names are NOT merged; inactive HQ master hidden");
assert.ok(ao.hidden.designations.includes("testing") && ao.hidden.designations.includes("Test") && ao.hidden.divisions.includes("zivira") && ao.hidden.hqs.includes("Old HQ"));
console.log("info propagation ok: demo BE / ABM (BE/ABM, Zivira Labs Pvt Ltd, BANGALORE) receive Flash + Notice + Quote through field and manager feeds with tolerant audience; windows; version bump; delete; pick-list hygiene");
console.log("ALL info-propagation CHECKS PASSED"); server.close(); process.exit(0);
