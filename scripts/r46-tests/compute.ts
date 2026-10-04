// Round 45 in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r45-tests/compute.ts
import mongoose from "mongoose";
import sift from "sift";

// ── Tiny in-memory stand-in for Mongo: patches Model query statics so the
// REAL compute code (mis-reports-compute.ts + helpers) runs unmodified over
// seeded documents. sift evaluates the real Mongo filter operators.
const store: Record<string, any[]> = {};
const asId = (n: number) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"));
class Q {
  constructor(private docs: any[], private model: any) {}
  select() { return this; }
  sort(spec: any) { const [k, dir] = Object.entries(spec)[0] as [string, number]; this.docs = [...this.docs].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (dir < 0 ? -1 : 1)); return this; }
  populate(path: string) {
    const doctors = store["doctors"] || [];
    this.docs = this.docs.map((d) => ({ ...d, [path]: doctors.find((x) => String(x._id) === String(d[path])) || d[path] }));
    return this;
  }
  lean() { return this; }
  then(res: any, rej: any) { return Promise.resolve(JSON.parse(JSON.stringify(this.docs), (k, v) => v)).then((x) => x.map((d: any, i: number) => ({ ...this.docs[i], ...d, _id: this.docs[i]._id }))).then(res, rej); }
}
const coll = (m: any) => store[m.collection.name] || (store[m.collection.name] = []);
(mongoose.Model as any).find = function (f: any = {}) { return new Q(coll(this).filter(sift(f)), this); };
(mongoose.Model as any).findOne = function (f: any = {}) { const q = new Q(coll(this).filter(sift(f)), this); const t = q.then.bind(q); (q as any).then = (res: any, rej: any) => t((arr: any[]) => arr[0] || null).then(res, rej); const s = q.sort.bind(q); (q as any).sort = (x: any) => { s(x); return q; }; return q; };
(mongoose.Model as any).countDocuments = function (f: any = {}) { return Promise.resolve(coll(this).filter(sift(f)).length); };
(mongoose.Model as any).aggregate = function (pipe: any[]) {
  const match = pipe[0].$match; const docs = coll(this).filter(sift(match)); const g = pipe[1].$group; const out = new Map<string, any>();
  for (const d of docs) { const id = d.employeeCode; const cur = out.get(id); const v = d.visitDateOnly; if (!cur || v > cur.last) out.set(id, { _id: id, last: v }); }
  return Promise.resolve(Array.from(out.values()));
};
(mongoose.Model as any).distinct = function (k: string, f: any = {}) { return Promise.resolve([...new Set(coll(this).filter(sift(f)).map((d) => d[k]))]); };

import assert from "node:assert";

import assert from "node:assert";
import fs from "node:fs";
import ExcelJS from "exceljs";
import {
  buildRcpaRows, rcpaHtmlXls, rcpaCsv, RCPA_HEADERS, buildSkuRows, skuTsv, SKU_HEADERS, buildVisitDrsRows, VISIT_DRS_HEADERS, buildSsRows, SS_HEADERS,
  buildListeddrRows, listeddrCsv, LISTEDDR_HEADERS, buildChemistRows, CHEMIST_HEADERS, CHEMIST_WIDTHS, buildTransitRows, TRANSIT_HEADERS, TRANSIT_WIDTHS,
  buildStockistRows, STOCKIST_HEADERS, STOCKIST_WIDTHS, computeResignedUsers, computeJoinLeft, computeTpDeviation, legacyXlsx
} from "../../src/utils/r46-reports.js";

const T = "demo";
const FX = "scripts/r46-tests/fixtures";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, o: any = {}) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "Astra", status: "ACTIVE", joinDate: new Date("2024-04-10"), createdAt: new Date("2024-04-11"), ...o });
store["employees"] = [
  emp(1, "VIVEKANAND N A", "E0950", "ZBM", "ZBM", undefined, "ERNAKULAM"),
  emp(2, "VINAYAK BHAT", "E0900", "RBM", "RBM", "E0950", "ERNAKULAM"),
  emp(3, " JITHESH K ", "E0100", "ABM", "ABM", "E0900", "CALICUT"),
  emp(4, "ABHISHEK P ", "E0248", "BE", "MR", "E0100", "PERINTHALMANNA", { sfCode: "1886532" }),
  emp(5, "AMITH K", "E0272", "BE", "MR", "E0100", "KANNUR", { sfCode: "1915103", joinDate: new Date("2024-06-03") }),
  emp(6, "LALIT RANJAN BHATTACHARYA", "E0334", "BE", "MR", "E0100", "BHUBANESWAR", { status: "INACTIVE", joinDate: new Date("2025-06-02"), leftDate: new Date("2026-09-03"), deactivatedAt: new Date("2026-09-03T08:00:00Z") }),
  emp(7, "SUMAN DEKA", "E0430", "BE", "MR", "E0100", "GUWAHATI", { joinDate: new Date("2026-09-07"), createdAt: new Date("2026-09-09T05:00:00Z") })
];
store["tenants"] = [{ slug: T, name: "Zivira Labs Pvt Ltd" }];
store["divisionMaster"] = [{ tenantSlug: T, divisionName: "Zivira Labs Pvt Ltd", divisionCode: "ZV", shortCode: "ZV", status: "Active" }];
store["territoryHqMaster"] = [{ tenantSlug: T, hqCode: "HQ77", headquartersName: "PERINTHALMANNA" }];
store["doctorClassification"] = [{ tenantSlug: T, doctorCode: "ASTKL8035", doctorCategory: "B" }];
const doc = (n: number, name: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name, status: "ACTIVE", mappedEmployeeCode: "E0248", state: "Kerala", city: "PALGHAT", territory: "PALGHAT", territoryType: "EX", specialty: "OPT", ...o });
store["doctors"] = [
  doc(1, "A  ROHAN", { doctorCode: "ASTKL8035", doctorCategory: "CORE", specialty: "ECC", qualification: "MBBS,DNB,DOMS", address1: "EYE SPECIALIST OPHTHALMOLOGIST DISTRICT HOSPITAL PALGHAT", createdAt: new Date("2024-04-17T05:00:00Z"), geoTags: [{ lat: 10.78, lng: 76.65, address: "Palghat" }, { lat: 10.79, lng: 76.66, address: "Palghat 2" }], priorityProducts: ["ZIVIFRESH", "NEPAWEL"], mappedProducts: ["ZIVIFRESH"], supportiveChemists: [{ dealerId: "x", dealerName: "Agarwal eye hospital" }], drPotential: "High", email: "rakesh@gmail.com", doctorTypes: ["Core drs", "Academica"], campaign: "Glaucoma", clinicName: "District Hospital", country: "India" }),
  doc(2, "abdul shameer", { doctorCode: "D2", doctorCategory: "NIL", createdAt: new Date("2025-10-03") }),
  doc(3, "AISWARYA", { doctorCode: "D3", doctorCategory: "N CORE", createdAt: new Date("2025-12-05"), category: "A" }),
  doc(4, "KAVYA R", { mappedEmployeeCode: "E0272", doctorCode: "D4", territory: "KANNUR", createdAt: new Date("2025-01-01") })
];
store["dealers"] = [
  { _id: asId(200), tenantSlug: T, dealerName: "Ahalya pharmacy ", employeeCode: "E0248", patchName: "KAYANKULAM", address: "Ahalya eye hospital Kayamkulam", chemistClass: "27", contactPersonName: "Sajitha ", dealerPhone: "9999999999", commonRefNo: "CR1", category: "A", clusterName: "CL-1", status: "ACTIVE", sourceSNo: 77, state: "Kerala", country: "India" },
  { _id: asId(201), tenantSlug: T, dealerName: "Agarwal eye hospital ", employeeCode: "E0248", patchName: "ERNAKULAM", address: "Agarwal eye hospital, Ernakulam ", status: "ACTIVE", sourceSNo: 78 },
  { _id: asId(202), tenantSlug: T, dealerName: "Other", employeeCode: "E0272", patchName: "KANNUR", status: "ACTIVE", sourceSNo: 79 }
];
store["productMaster"] = [{ tenantSlug: T, productName: "ZIVIFRESH", productCode: "P001", ptr: 55.5 }, { tenantSlug: T, productName: "NEPAWEL", productCode: "P002" }];
store["competitorMaps"] = [{ tenantSlug: T, competitorBrandName: "OPTIVE", competitorCompanyName: "Allergan", status: "ACTIVE" }];
store["rcpa_entries"] = [
  { tenantSlug: T, employeeCode: "E0248", doctorId: String(asId(101)), doctorName: "A  ROHAN", chemistId: String(asId(200)), chemistName: "Ahalya pharmacy ", date: "2026-10-02", month: "2026-10", ourProduct: "ZIVIFRESH", ourQty: 10, competitorProduct: "OPTIVE", competitorQty: 4, competitorPtr: 40 },
  { tenantSlug: T, employeeCode: "E0248", doctorId: String(asId(101)), doctorName: "A  ROHAN", date: "2026-10-01", month: "2026-10", ourProduct: "NEPAWEL", ourQty: 5, ourPtr: 22, competitorProduct: "", competitorQty: 0 },
  { tenantSlug: T, employeeCode: "E0272", doctorId: String(asId(104)), doctorName: "KAVYA R", date: "2026-10-03", month: "2026-10", ourProduct: "ZIVIFRESH", ourQty: 1, competitorProduct: "X,Y", competitorQty: 2, competitorName: "Comp, Co" },
  { tenantSlug: T, employeeCode: "E0248", doctorId: String(asId(101)), doctorName: "A  ROHAN", date: "2026-09-02", month: "2026-09", ourProduct: "ZIVIFRESH", ourQty: 9 }
];
const sv = (o: any) => ({ tenantSlug: T, employeeCode: "E0248", doctorId: String(asId(101)), month: "2026-10", visitDateOnly: "2026-10-02", startedAt: new Date("2026-10-02T04:30:00Z"), durationSec: 90, brandName: "ZIVIFRESH", productName: "ZIVIFRESH", slideName: "Intro", transactionId: "SVE0248X", targetType: "Doctor", ...o });
store["slide_views"] = [sv({}), sv({ doctorId: "", chemistId: String(asId(200)), targetType: "Chemist", transactionId: "SVE0248Y", startedAt: new Date("2026-10-02T05:00:00Z"), endedAt: new Date("2026-10-02T05:02:00Z"), durationSec: 120, slideName: "Pack" }), sv({ month: "2026-09", visitDateOnly: "2026-09-02" })];
const dcr = (n: number, e: string, doctor: number, date: string, o: any = {}) => ({ _id: asId(300 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDateOnly: date, month: date.slice(0, 7), visitDate: new Date(date), ...o });
store["dcrs"] = [
  dcr(1, "E0248", 1, "2026-10-02"), dcr(2, "E0248", 1, "2026-10-05", { jointWork: { accompanyingManager: "E0100" } }), dcr(3, "E0248", 1, "2026-10-09", { jointWork: { accompanyingManager: "VINAYAK BHAT" } }),
  dcr(4, "E0100", 1, "2026-10-12"), dcr(5, "E0248", 2, "2026-10-03"), dcr(6, "E0334", 4, "2025-06-02"), dcr(7, "E0334", 4, "2026-09-02"), dcr(8, "E0430", 4, "2026-09-07"),
  dcr(9, "E0248", 1, "2026-10-20")
];
store["tourplans"] = [{ tenantSlug: T, employeeCode: "E0248", month: "2026-10", status: "APPROVED", createdAt: new Date("2026-09-25"), locations: [{ date: "2026-10-02", area: "PALGHAT", town: "Palghat" }, { date: "2026-10-03", area: "KANNUR", town: "Kannur" }, { date: "2026-10-04", area: "PALGHAT", town: "Palghat" }] }];
store["secondarySales"] = [
  { tenantSlug: T, month: "2026-10", fieldForceName: "ABHISHEK P ", hq: "PERINTHALMANNA", stockist: "KOTHARI MEDICALS", product: "ZIVIFRESH", salesUnit: 10, salesValue: 550, billDate: new Date("2026-10-04"), status: "Active" },
  { tenantSlug: T, month: "2026-10", hq: "KANNUR", stockist: "ASHA", product: "NEPAWEL", salesUnit: 3, salesValue: 66, billDate: new Date("2026-10-06") },
  { tenantSlug: T, month: "2026-09", fieldForceName: "ABHISHEK P ", stockist: "OLD", product: "ZIVIFRESH", salesUnit: 1, salesValue: 1 }
];
store["stockistMaster"] = [{ tenantSlug: T, stockistName: "KOTHARI MEDICALS", stockistCode: "8010106" }];
store["transitBills"] = [
  { tenantSlug: T, billNo: "B2", billDate: new Date("2026-10-05"), stockistName: "KOTHARI MEDICALS", stockistErpCode: "8010106", productErpCode: "P001", productName: "ZIVIFRESH", saleQty: 20, saleValue: 1100 },
  { tenantSlug: T, billNo: "B1", billDate: new Date("2026-10-01"), stockistName: "ASHA", productName: "NEPAWEL", saleQty: 2, saleValue: 44 },
  { tenantSlug: T, billNo: "B0", billDate: new Date("2026-09-30"), stockistName: "ASHA", productName: "NEPAWEL", saleQty: 2, saleValue: 44 }
];
store["stockists"] = [
  { tenantSlug: T, name: "A.G.S. MEDICAL AGENCIES  ", erpCode: "8010003", state: "TAMIL NADU", hqName: "", fieldForceName: "AMITH K", status: "ACTIVE" },
  { tenantSlug: T, name: "AAGAM PHARMAKON", state: "GUJARAT", hqName: "PERINTHALMANNA", fieldForceName: "ABHISHEK P ", status: "ACTIVE" }
];

async function readXlsx(buf: Buffer) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any); return wb; }
const rowVals = (ws: ExcelJS.Worksheet, r: number) => { const v = ws.getRow(r).values as any[]; return v.slice(1); };

(async () => {
  // ── 1. RCPA ───────────────────────────────────────────────────────────
  const rcpaRef = fs.readFileSync(`${FX}/legacy_rcpa.xls`, "utf8");
  assert.equal(rcpaHtmlXls([]), rcpaRef, "header-only RCPA .xls must equal the legacy file byte for byte");
  assert.equal(RCPA_HEADERS.length, 25);
  const rcpa = await buildRcpaRows(T, "E0100", "2026-10");
  assert.equal(rcpa.length, 3, "three Oct entries under the ABM (Sep one excluded)");
  assert.deepEqual(rcpa[0].slice(0, 11), ["1", "ASTKL8035", "E0248", "ABHISHEK P ", "PERINTHALMANNA", "BE", "Astra", "10/04/2024", " JITHESH K ", "VINAYAK BHAT", "01/10/2026"]);
  assert.equal(rcpa[0][18], "NEPAWEL"); assert.equal(rcpa[0][20], "22", "explicit PTR wins");
  assert.equal(rcpa[1][11], "Ahalya pharmacy "); assert.equal(rcpa[1][12], "CL-1"); assert.equal(rcpa[1][16], "A"); assert.equal(rcpa[1][20], "55.5", "PTR falls back to product master");
  assert.equal(rcpa[1][21], "Allergan", "competitor company from the competitor master"); assert.equal(rcpa[1][24], "40");
  assert.equal(rcpa[1][15], "CORE"); assert.equal(rcpa[1][17], "PALGHAT");
  assert.equal(rcpa[2][21], "Comp, Co");
  const html = rcpaHtmlXls(rcpa);
  assert.ok(html.endsWith("</table>") && !/[\r\n]/.test(html)); assert.ok(html.includes("<td>Comp, Co</td>"));
  const csv = rcpaCsv(rcpa);
  assert.ok(csv.split("\r\n")[0] === RCPA_HEADERS.join(",") + ",", "CSV header = same 25 columns + trailing comma");
  assert.ok(csv.includes("Comp; Co") && csv.endsWith(",\r\n"));
  assert.equal((await buildRcpaRows(T, "E0272", "2026-10")).length, 1);
  assert.equal((await buildRcpaRows(T, "E0100", "2026-08")).length, 0);

  // ── 2. SKU dump ───────────────────────────────────────────────────────
  const skuRef = fs.readFileSync(`${FX}/legacy_sku_dump.xls`, "utf8");
  assert.equal(skuTsv([]), skuRef, "header-only SKU text equals the legacy file");
  assert.equal(SKU_HEADERS.length, 25);
  const sku = await buildSkuRows(T, "admin", "2026-10");
  assert.equal(sku.length, 2);
  assert.deepEqual(sku[0].slice(0, 9), ["ABHISHEK P ", "PERINTHALMANNA", "BE", "E0248", "HQ77", "Kerala", "Astra", "Doctor", "02/10/2026"]);
  assert.equal(sku[0][9], "SVE0248X"); assert.equal(sku[0][13], "90"); assert.equal(sku[0][14], "ASTKL8035"); assert.equal(sku[0][23], "02/10/2026 10:00:00"); assert.equal(sku[0][24], "02/10/2026 10:01:30");
  assert.equal(sku[1][7], "Chemist"); assert.equal(sku[1][14], "77"); assert.equal(sku[1][15], "Ahalya pharmacy "); assert.equal(sku[1][24], "02/10/2026 10:32:00");
  assert.equal(skuTsv(sku).split("\n")[0], SKU_HEADERS.join("\t")); assert.ok(skuTsv(sku).endsWith("\n") && !skuTsv(sku).includes("\r"));
  assert.equal((await buildSkuRows(T, "E0272", "2026-10")).length, 0);

  // ── 3. Visit - Drs ────────────────────────────────────────────────────
  assert.equal(VISIT_DRS_HEADERS.length, 26);
  assert.deepEqual(VISIT_DRS_HEADERS.slice(0, 8), ["sno", "sf_name", "ListedDr_Name", "Cat", "Spec", "Class", "MR Visit Count", "MR Visit Date"]);
  const vd = await buildVisitDrsRows(T, "E0100", "2026-10");
  const rohan = vd.find((r) => r[2] === "A  ROHAN")!;
  assert.equal(rohan[1], "ABHISHEK P "); assert.equal(rohan[3], "CORE"); assert.equal(rohan[5], "B");
  assert.equal(rohan[6], 4); assert.equal(rohan[7], "02/10/2026,05/10/2026,09/10/2026,20/10/2026", "MR own calls");
  assert.equal(VISIT_DRS_HEADERS[10], "RBM Visit Count"); assert.equal(VISIT_DRS_HEADERS[12], "ABM Visit Count");
  assert.equal(rohan[10], 1, "RBM column: joint work naming the manager by name"); assert.equal(rohan[11], "09/10/2026");
  assert.equal(rohan[12], 2, "ABM column: joint work by code + the ABM's own call"); assert.equal(rohan[13], "05/10/2026,12/10/2026");
  assert.equal(rohan[8], null); assert.equal(rohan[9], null, "BH column empty");
  assert.equal(vd[0][0], 1); assert.equal(vd.length, 4);
  assert.equal(vd.find((r) => r[2] === "AISWARYA")![6], null);

  // ── 4. SS ─────────────────────────────────────────────────────────────
  const ss = await buildSsRows(T, "E0100", "2026-10");
  assert.equal(ss.length, 2);
  assert.deepEqual(ss[0], ["ABHISHEK P ", "PERINTHALMANNA", "BE", "E0248", "KOTHARI MEDICALS", "8010106", "ZIVIFRESH", "P001", 10, 550, "04/10/2026", "Oct 2026"]);
  assert.equal(ss[1][1], "KANNUR"); assert.equal(ss[1][3], "E0272", "HQ-only row resolves to the single employee of that HQ");
  assert.equal(SS_HEADERS.length, 12);

  // ── 5. Listeddr CSV ───────────────────────────────────────────────────
  assert.equal(LISTEDDR_HEADERS.length, 66);
  const ldRows = await buildListeddrRows(T, "E0100");
  const ldCsv = listeddrCsv(ldRows);
  const ref = fs.readFileSync(`${FX}/legacy_listeddr_head2.csv`, "utf8").split("\r\n");
  const mine = ldCsv.split("\r\n");
  assert.equal(mine[0], ref[0], "66-column fully quoted header is byte-identical");
  const parse = (l: string) => l.slice(1, -1).split('","');
  const a = parse(mine[1]), b = parse(ref[1]);
  assert.equal(a.length, 66);
  const seeded = new Set([23, 26, 27, 31, 36, 41, 53, 54, 55, 60, 61]); // columns the test seeds with extra data vs the legacy row
  for (let i = 0; i < 62; i++) if (!seeded.has(i)) assert.equal(a[i], b[i], `column ${i} (${LISTEDDR_HEADERS[i]})`);
  assert.equal(a[23], "CORE"); assert.equal(a[26], "B", "class from classification master (legacy sample row had none)");
  assert.equal(mine[1].slice(0, 330), ref[1].slice(0, 330), "leading columns byte-identical incl. quoting and padded names");
  assert.equal(a[62], "2", "real geo tag count"); assert.equal(a[63], "10.79"); assert.equal(a[65], "Palghat 2");
  assert.equal(a[54], "ZIVIFRESH"); assert.equal(a[55], "NEPAWEL"); assert.equal(a[60], "ZIVIFRESH"); assert.equal(a[61], "Agarwal eye hospital"); assert.equal(a[41], "High");
  assert.equal(a[36], "RAKESH@GMAIL.COM"); assert.equal(a[27], "Core drs,Academica"); assert.equal(a[53], "Glaucoma");
  assert.ok(ldCsv.endsWith('"\r\n') && mine.length === ldRows.length + 2);
  assert.ok(mine.slice(0, -1).every((l) => /^"/.test(l) && /"$/.test(l)), "every line fully quoted");
  assert.deepEqual(ldRows.map((r) => r[18]), ["A  ROHAN", "abdul shameer", "AISWARYA", "KAVYA R"], "employees alphabetical (ABHISHEK before AMITH), doctors case-insensitive alphabetical");
  assert.equal(ldRows.map((r) => r[0]).join(","), "1,2,3,4", "sno runs across employees");

  // ── 6. Chemist dump (xlsx) ────────────────────────────────────────────
  const ch = await buildChemistRows(T, "E0100");
  assert.equal(ch.title, "Chemist Dump (   JITHESH K  - ABM - CALICUT )", "title is Chemist Dump (  <name> - <desig> - <HQ> ) with the stored name");
  const chx = await readXlsx(await legacyXlsx({ sheet: "Chemist", title: ch.title, mergeTo: 11, headers: CHEMIST_HEADERS, rows: ch.rows, widths: CHEMIST_WIDTHS }));
  const cws = chx.getWorksheet("Chemist")!;
  assert.ok(cws, "sheet name Chemist"); assert.deepEqual(Object.keys((cws as any)._merges), ["A1"]); assert.equal(cws.getCell("A1").master.address, "A1");
  assert.equal((cws as any)._merges.A1.model.bottom, 1); assert.equal((cws as any)._merges.A1.model.right, 11);
  assert.equal(cws.getCell("A1").font?.bold, true); assert.equal(cws.getCell("A1").font?.size, 15); assert.equal(cws.getCell("A1").alignment?.horizontal, "center");
  assert.deepEqual(rowVals(cws, 2), CHEMIST_HEADERS); assert.equal(cws.getColumn(8).width, 46.98);
  const r3 = rowVals(cws, 3);
  assert.equal(r3[0], 1); assert.equal(typeof r3[0], "number"); assert.equal(r3[5], "Agarwal eye hospital "); assert.equal(r3[6] ?? null, null, "blank class stays empty");
  const r4 = rowVals(cws, 4);
  assert.equal(r4[5], "Ahalya pharmacy "); assert.equal(r4[6], "27"); assert.equal(typeof r4[6], "string"); assert.equal(r4[9], "Sajitha "); assert.equal(r4[10], "9999999999"); assert.equal(r4[11], "CR1");
  assert.equal(cws.getCell("A1").font?.name, "Calibri");
  assert.equal(CHEMIST_HEADERS.length, 12);
  assert.equal(ch.rows.length, 3, "all three chemists of the team"); assert.equal((await buildChemistRows(T, "admin")).title, "Chemist Dump (  admin - Admin - )");

  // ── 7. Transit bills ──────────────────────────────────────────────────
  const tr = await buildTransitRows(T, "2026-10");
  assert.equal(tr.title, "Transit Bills (  Oct - 2026 )"); assert.equal(tr.rows.length, 2);
  assert.deepEqual(tr.rows[0], ["B1", "01/10/2026", "ASHA", null, null, "NEPAWEL", 2, 44]);
  const trx = await readXlsx(await legacyXlsx({ sheet: "Transit", title: tr.title, mergeTo: 8, headers: TRANSIT_HEADERS, rows: tr.rows, widths: TRANSIT_WIDTHS }));
  assert.equal((trx.getWorksheet("Transit") as any)._merges.A1.model.right, 8); assert.deepEqual(rowVals(trx.getWorksheet("Transit")!, 2), TRANSIT_HEADERS);
  const empty = await buildTransitRows(T, "2026-08"); assert.equal(empty.rows.length, 0);
  const emx = await readXlsx(await legacyXlsx({ sheet: "Transit", title: empty.title, mergeTo: 8, headers: TRANSIT_HEADERS, rows: [], widths: TRANSIT_WIDTHS }));
  assert.equal(emx.getWorksheet("Transit")!.rowCount, 2, "title + header only when no bills");

  // ── 8. Listed stockist ────────────────────────────────────────────────
  const sk = await buildStockistRows(T, "Zivira Labs Pvt Ltd");
  assert.equal(sk.title, "Stockist Dump (  Zivira Labs Pvt Ltd )");
  assert.deepEqual(sk.rows[0], [1, "8010003", "A.G.S. MEDICAL AGENCIES  ", null, "TAMIL NADU", "E0272", "AMITH K", null]);
  assert.deepEqual(sk.rows[1], [2, null, "AAGAM PHARMAKON", "PERINTHALMANNA", "GUJARAT", "E0248", "ABHISHEK P ", "HQ77"]);
  assert.equal((await buildStockistRows(T, "ALL")).title, "Stockist Dump (  ALL )"); assert.equal((await buildStockistRows(T, "Other Division")).rows.length, 0);

  // ── 9/10. Resigned + Join/Left ────────────────────────────────────────
  const rs = await computeResignedUsers(T, "2026-09", "2026-10");
  assert.equal(rs.rows.length, 1);
  assert.deepEqual(rs.rows[0], { sno: 1, employeeCode: "E0334", name: "LALIT RANJAN BHATTACHARYA", designation: "BE", hq: "BHUBANESWAR", dcrStart: "02/06/2025", dcrEnd: "02/09/2026" });
  assert.equal((await computeResignedUsers(T, "2026-10", "2026-10")).rows.length, 0);
  const jl = await computeJoinLeft(T, "2026-09", "2026-10");
  assert.deepEqual(jl.joined, [{ sno: 1, employeeCode: "E0430", name: "SUMAN DEKA", hq: "GUWAHATI", designation: "BE", doj: "07/09/2026", dcrStart: "07/09/2026", createdId: "09/09/2026", division: "ZV" }]);
  assert.deepEqual(jl.left, [{ sno: 1, employeeCode: "E0334", name: "LALIT RANJAN BHATTACHARYA", hq: "BHUBANESWAR", designation: "BE", dateOfLeft: "03/09/2026", dcrLast: "02/09/2026", deactiveDate: "03/09/2026", division: "ZV" }]);

  // ── 11. TP deviation ──────────────────────────────────────────────────
  const tp = (await computeTpDeviation(T, "E0100", "2026-10"))!;
  const ab = tp.rows.find((r) => r.employeeCode === "E0248")!;
  const byDate = Object.fromEntries(ab.days.map((d) => [d.date, d]));
  assert.equal(byDate["02/10/2026"].deviation, "N"); assert.equal(byDate["03/10/2026"].deviation, "Y", "planned Kannur, worked Palghat territory doctor"); assert.equal(byDate["04/10/2026"].deviation, "Y", "planned, no DCR");
  assert.equal(byDate["05/10/2026"].deviation, "Y", "worked without a plan"); assert.equal(ab.planned, 3);
  assert.ok(!tp.rows.some((r) => r.employeeCode === "E0100"), "base level only");
  if (process.env.R46_OUT) { // optional: write the generated files so they can be diffed against the legacy samples
    const o = process.env.R46_OUT; fs.mkdirSync(o, { recursive: true });
    fs.writeFileSync(`${o}/rcpa_empty.xls`, rcpaHtmlXls([])); fs.writeFileSync(`${o}/sku_empty.xls`, skuTsv([])); fs.writeFileSync(`${o}/listeddr.csv`, ldCsv);
    fs.writeFileSync(`${o}/visit_drs.xlsx`, await legacyXlsx({ sheet: "tab1", headers: VISIT_DRS_HEADERS, rows: [] }));
    fs.writeFileSync(`${o}/chemist.xlsx`, await legacyXlsx({ sheet: "Chemist", title: ch.title, mergeTo: 11, headers: CHEMIST_HEADERS, rows: ch.rows, widths: CHEMIST_WIDTHS }));
    fs.writeFileSync(`${o}/transit_empty.xlsx`, await legacyXlsx({ sheet: "Transit", title: "Transit Bills (  Oct - 2026 )", mergeTo: 8, headers: TRANSIT_HEADERS, rows: [], widths: TRANSIT_WIDTHS }));
    fs.writeFileSync(`${o}/stockist.xlsx`, await legacyXlsx({ sheet: "Stockist", title: sk.title, mergeTo: 8, headers: STOCKIST_HEADERS, rows: sk.rows, widths: STOCKIST_WIDTHS }));
  }
  console.log("R46 COMPUTE OK");
})().catch((e) => { console.error(e); process.exit(1); });
