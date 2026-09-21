// One-time import of the Zivira Labs Excel Data Template into MongoDB Atlas.
// Run with: tsx scripts/import-master-data.ts /path/to/Data_Template.xlsx
//
// Field mappings here match the LIVE admin-portal headers as they exist today
// (see the audit conversation) — no frontend headers were added, removed, or
// renamed for this import. Where an Excel column has no matching existing
// header, the data is still stored (not thrown away), just not surfaced by
// any current screen.

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { connectMongo } from "../src/db.js";

import { CountryModel } from "../src/models/country.model.js";
import { StateModel } from "../src/models/state.model.js";
import { CityModel } from "../src/models/city.model.js";
import { LocationModel } from "../src/models/location.model.js";
import { HeadQuarterModel } from "../src/models/headquarter.model.js";
import { RoleReferenceModel } from "../src/models/role-reference.model.js";
import { LeaveTypeModel } from "../src/models/leave-type.model.js";
import { CompetitorMapModel } from "../src/models/competitor-map.model.js";
import { SubdivisionModel } from "../src/models/subdivision.model.js";
import { ProductCategoryModel } from "../src/models/product-category.model.js";
import { ProductGroupModel } from "../src/models/product-group.model.js";
import { ProductBrandModel } from "../src/models/product-brand.model.js";
import { ProductCatalogModel } from "../src/models/product-catalog.model.js";
import { EmployeeModel } from "../src/models/employee.model.js";
import { UserModel } from "../src/models/user.model.js";
import { DoctorModel } from "../src/models/doctor.model.js";
import { DoctorCategoryModel } from "../src/models/doctor-category.model.js";
import { DoctorSpecialityModel } from "../src/models/doctor-speciality.model.js";
import { DoctorQualificationModel } from "../src/models/doctor-qualification.model.js";
import { DealerModel } from "../src/models/dealer.model.js";
import { HolidayModel } from "../src/models/holiday.model.js";
import { SfcModel } from "../src/models/sfc.model.js";
import { ExpenseModel } from "../src/models/expense.model.js";

const TENANT = "zivira-labs";
const EXCEL_PATH = process.argv[2];
const BATCH_SIZE = 500;

if (!EXCEL_PATH) {
  console.error("Usage: tsx scripts/import-master-data.ts /path/to/Data_Template.xlsx");
  process.exit(1);
}

// ─── Reporting ──────────────────────────────────────────────────────────────

type SheetReport = {
  sheet: string;
  collection: string;
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  skipReasons: Record<string, number>;
  fieldCompleteness: Record<string, { populated: number }>;
};

const reports: SheetReport[] = [];

function newReport(sheet: string, collection: string): SheetReport {
  const r: SheetReport = { sheet, collection, read: 0, inserted: 0, updated: 0, skipped: 0, skipReasons: {}, fieldCompleteness: {} };
  reports.push(r);
  return r;
}

function skip(r: SheetReport, reason: string) {
  r.skipped++;
  r.skipReasons[reason] = (r.skipReasons[reason] ?? 0) + 1;
}

function trackField(r: SheetReport, field: string, value: unknown) {
  if (!r.fieldCompleteness[field]) r.fieldCompleteness[field] = { populated: 0 };
  if (value !== null && value !== undefined && value !== "") r.fieldCompleteness[field].populated++;
}

// ─── Excel helpers ──────────────────────────────────────────────────────────

const workbook = XLSX.readFile(EXCEL_PATH, { cellDates: true });

function sheetRows(name: string): unknown[][] {
  const ws = workbook.Sheets[name];
  if (!ws) throw new Error(`Missing sheet in workbook: ${name}`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function upperStr(v: unknown): string | null {
  const s = str(v);
  return s ? s.toUpperCase() : null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive exact-match filter value. Upsert filters must match a field
// regardless of how it's already cased in an existing document (Excel casing can
// differ between sheets/runs) — matching on value.toUpperCase() while the stored
// $set keeps the original casing means re-running never finds the existing document,
// so MongoDB attempts an insert and collides with the unique index instead. This
// finds the existing document by any casing; $set then normalizes it going forward.
function ci(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, "i");
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

// Employee sheet stores dates as free text like "15 FEB 1977" rather than real Excel dates.
function parseTextDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toUpperCase()];
  const year = Number(m[3]);
  if (month === undefined) return null;
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function excelDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  return null;
}

// ─── Batched upsert helper ──────────────────────────────────────────────────

async function bulkUpsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Model: mongoose.Model<any>,
  ops: { filter: Record<string, unknown>; doc: Record<string, unknown> }[],
  report: SheetReport
) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = ops.slice(i, i + BATCH_SIZE);
    const result = await Model.bulkWrite(
      batch.map((op) => ({
        updateOne: {
          filter: { tenantSlug: TENANT, ...op.filter },
          // Raw bulkWrite upserts skip Mongoose schema defaults entirely, so `status`
          // (and every model's default("ACTIVE")) would otherwise be left unset on
          // every newly-inserted document. $setOnInsert applies it only when the
          // document is first created, so re-running this script never clobbers a
          // status someone changed via the deactivate/reactivate UI afterward.
          update: { $set: { tenantSlug: TENANT, ...op.doc }, $setOnInsert: { status: "ACTIVE" } },
          upsert: true
        }
      })),
      { ordered: false }
    );
    report.inserted += result.upsertedCount ?? 0;
    report.updated += result.modifiedCount ?? 0;
  }
}

// ─── Lookup sheets (Country/State/City/Location/HeadQuarter/Role/Leave/CompetitorMap) ──

async function importCountry() {
  const r = newReport("Country", "countries");
  const rows = sheetRows("Country").slice(1);
  const ops = [];
  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const countryName = str(row[1]);
    if (!countryName) { skip(r, "missing CountryName"); continue; }
    ops.push({ filter: { countryName: ci(countryName) }, doc: { countryName } });
  }
  await bulkUpsert(CountryModel, ops, r);
}

async function importState() {
  const r = newReport("State", "states");
  const rows = sheetRows("State").slice(1);
  const ops = [];
  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const stateName = str(row[1]);
    if (!stateName) { skip(r, "missing StateName"); continue; }
    ops.push({ filter: { stateName: ci(stateName) }, doc: { stateName, countryName: str(row[2]) } });
  }
  await bulkUpsert(StateModel, ops, r);
}

async function importCity() {
  const r = newReport("City", "cities");
  const rows = sheetRows("City").slice(1); // header row 1 col A is a stray label ("pond"), city name is col B
  const ops = [];
  for (const row of rows) {
    const cityName = str(row[1]);
    if (!cityName) continue;
    r.read++;
    ops.push({ filter: { cityName: ci(cityName) }, doc: { cityName, stateName: str(row[2]) } });
  }
  await bulkUpsert(CityModel, ops, r);
}

async function importLocation() {
  const r = newReport("Location", "locations");
  const rows = sheetRows("Location").slice(1);
  const ops = [];
  for (const row of rows) {
    const locationName = str(row[1]);
    if (!locationName) continue;
    r.read++;
    const cityName = str(row[2]);
    ops.push({
      filter: { locationName: ci(locationName), cityName: cityName ? ci(cityName) : null },
      doc: { locationName, cityName, pincode: row[3] !== null ? String(row[3]) : null }
    });
  }
  await bulkUpsert(LocationModel, ops, r);
}

async function importHeadQuarter() {
  const r = newReport("HeadQuarter", "headQuarters");
  const rows = sheetRows("HeadQuarter").slice(1);
  const ops = [];
  for (const row of rows) {
    const headQuarterName = str(row[1]);
    if (!headQuarterName) continue;
    r.read++;
    ops.push({ filter: { headQuarterName: ci(headQuarterName) }, doc: { headQuarterName, stateName: str(row[2]), metroType: str(row[3]) } });
  }
  await bulkUpsert(HeadQuarterModel, ops, r);
}

async function importRole() {
  const r = newReport("Role", "roleReferences");
  const rows = sheetRows("Role").slice(1);
  const ops = [];
  for (const row of rows) {
    const roleName = str(row[1]);
    if (!roleName) continue;
    r.read++;
    ops.push({ filter: { roleName: ci(roleName) }, doc: { roleName, fullForm: str(row[2]) } });
  }
  await bulkUpsert(RoleReferenceModel, ops, r);
}

async function importLeave() {
  const r = newReport("Leave", "leaveTypes");
  const rows = sheetRows("Leave").slice(1);
  const ops = [];
  for (const row of rows) {
    const desc = str(row[1]);
    if (!desc) continue;
    r.read++;
    ops.push({ filter: { leaveTypeDesc: ci(desc) }, doc: { leaveTypeDesc: desc } });
  }
  await bulkUpsert(LeaveTypeModel, ops, r);
}

async function importCompetitorMap() {
  const r = newReport("Competitor Map", "competitorMaps");
  const rows = sheetRows("Competitor Map").slice(1);
  const ops = [];
  for (const row of rows) {
    const competitorBrandName = str(row[1]);
    if (!competitorBrandName) continue;
    r.read++;
    const ourBrandName = str(row[3]);
    ops.push({
      filter: { competitorBrandName: ci(competitorBrandName), ourBrandName: ourBrandName ? ci(ourBrandName) : null },
      doc: { competitorBrandName, competitorCompanyName: str(row[2]), ourBrandName }
    });
  }
  await bulkUpsert(CompetitorMapModel, ops, r);
}

// ─── Sub-Division (Divsion sheet) ───────────────────────────────────────────

// Divisions confirmed by the client that exist outside the Excel Data Template — not
// sourced from any sheet, so they're kept separate from the Divsion-sheet rows below
// rather than invented as fake Excel data. Stored identically to the real Excel-sourced
// divisions (same shape, same upsert path) so they behave the same everywhere.
const MANUAL_DIVISIONS = ["ZIVIRA EAST"];

async function importSubdivision() {
  const r = newReport("Divsion", "subdivisions");
  const rows = sheetRows("Divsion").slice(1);
  const ops = [];
  for (const row of rows) {
    const divName = str(row[2]);
    if (!divName) { r.read++; skip(r, "missing Div Name"); continue; }
    r.read++;
    // No distinct "sub-division name" concept exists in the source data — per explicit
    // instruction, subdivisionName mirrors division exactly rather than staying empty.
    trackField(r, "subdivisionName", divName);
    ops.push({ filter: { division: ci(divName) }, doc: { division: divName, subdivisionName: divName } });
  }
  for (const divName of MANUAL_DIVISIONS) {
    r.read++;
    ops.push({ filter: { division: ci(divName) }, doc: { division: divName, subdivisionName: divName } });
  }
  await bulkUpsert(SubdivisionModel, ops, r);
}

// ─── Product family ─────────────────────────────────────────────────────────

async function importProductCategory() {
  const r = newReport("Therapy", "productCategories");
  const rows = sheetRows("Therapy").slice(1);
  const ops = [];
  for (const row of rows) {
    const therapyName = str(row[1]);
    if (!therapyName) continue;
    r.read++;
    ops.push({ filter: { categoryName: ci(therapyName) }, doc: { categoryName: therapyName } });
  }
  await bulkUpsert(ProductCategoryModel, ops, r);
}

async function importProductGroup() {
  const r = newReport("Molecule", "productGroups");
  const rows = sheetRows("Molecule").slice(1);
  const ops = [];
  for (const row of rows) {
    const moleculeName = str(row[1]);
    if (!moleculeName) { r.read++; skip(r, "missing MoleculeName"); continue; }
    r.read++;
    ops.push({ filter: { moleculeName: ci(moleculeName) }, doc: { moleculeName, therapyName: str(row[2]) } });
  }
  await bulkUpsert(ProductGroupModel, ops, r);
}

async function importProductBrand() {
  const r = newReport("Brand", "productBrands");
  const rows = sheetRows("Brand").slice(1);
  const ops = [];
  for (const row of rows) {
    const brandName = str(row[1]);
    if (!brandName) { r.read++; skip(r, "missing BrandName"); continue; }
    r.read++;
    ops.push({ filter: { brandName: ci(brandName) }, doc: { brandName, division: str(row[2]), moleculeName: str(row[3]) } });
  }
  await bulkUpsert(ProductBrandModel, ops, r);
}

async function importProductCatalog() {
  const r = newReport("Product", "productCatalog");
  const rows = sheetRows("Product").slice(1);
  const ops = [];
  for (const row of rows) {
    const productName = str(row[1]);
    if (!productName) { r.read++; skip(r, "missing ProductName"); continue; }
    r.read++;
    ops.push({
      filter: { productName: ci(productName) },
      doc: { productName, brandName: str(row[2]), molecule: str(row[3]), therapy: str(row[4]) }
    });
  }
  await bulkUpsert(ProductCatalogModel, ops, r);
}

// ─── Employee + login account ───────────────────────────────────────────────

const ROLE_TITLE_TO_CODE: Record<string, string> = {
  "BUSINESS EXECUTIVE": "MR",
  "AREA BUSINESS MANAGER": "ABM",
  "REGIONAL BUSINESS MANAGER": "RBM",
  "ZONAL BUSINESS MANAGER": "ZBM"
};

async function importEmployees() {
  const r = newReport("Employee", "employees");
  const rows = sheetRows("Employee").slice(1);
  const ops: { filter: Record<string, unknown>; doc: Record<string, unknown> }[] = [];
  const userOps: { filter: Record<string, unknown>; doc: Record<string, unknown> }[] = [];

  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const [, name, dob, email, phone, division, rolename, employeeCode, joindate, address1, landmark, location, city, stateName, country, postalcode, hqTerritory, l1Mgr, l1Division, l1Role] = row as unknown[];

    const nameS = str(name);
    const codeS = str(employeeCode);
    const divisionS = str(division);
    const territoryS = str(hqTerritory);
    const designationS = str(rolename);

    if (!nameS) { skip(r, "missing EmployeeName"); continue; }
    if (!codeS) { skip(r, "missing Employeecode"); continue; }
    if (!divisionS) { skip(r, "missing division"); continue; }
    if (!territoryS) { skip(r, "missing HQ /Territory"); continue; }
    if (!designationS) { skip(r, "missing rolename"); continue; }

    trackField(r, "dob", dob);
    trackField(r, "email", email);
    trackField(r, "phone", phone);
    trackField(r, "joindate", joindate);
    trackField(r, "address1", address1);
    trackField(r, "landmark", landmark);
    trackField(r, "location", location);
    trackField(r, "city", city);
    trackField(r, "state", stateName);
    trackField(r, "country", country);
    trackField(r, "postalcode", postalcode);
    trackField(r, "l1Division", l1Division);
    trackField(r, "l1Role", l1Role);

    const roleCode = ROLE_TITLE_TO_CODE[designationS.toUpperCase()] ?? "OTHER";

    ops.push({
      filter: { employeeCode: codeS },
      doc: {
        name: nameS,
        employeeCode: codeS,
        designation: designationS,
        division: divisionS,
        territory: territoryS,
        role: roleCode,
        reportingManager: str(l1Mgr),
        dob: parseTextDate(dob),
        email: str(email)?.toLowerCase() ?? null,
        phone: str(phone),
        joinDate: parseTextDate(joindate),
        address1: str(address1),
        landmark: str(landmark),
        location: str(location),
        city: str(city),
        state: str(stateName),
        country: str(country),
        postalCode: postalcode !== null ? String(postalcode) : null,
        l1Division: str(l1Division),
        l1Role: str(l1Role)
      }
    });

    const passwordHash = await bcrypt.hash(codeS, 10);
    userOps.push({
      filter: { username: codeS.toLowerCase() },
      doc: {
        username: codeS.toLowerCase(),
        passwordHash,
        displayName: nameS,
        role: "MR",
        portal: "FIELD_FORCE",
        active: true
      }
    });
  }

  await bulkUpsert(EmployeeModel, ops, r);

  // Login accounts (Employee Code == Employee Password, per requirement). Reported separately
  // since it's a different collection with its own natural key (username).
  const userReport = newReport("Employee (login accounts)", "users");
  userReport.read = userOps.length;
  for (let i = 0; i < userOps.length; i += BATCH_SIZE) {
    const batch = userOps.slice(i, i + BATCH_SIZE);
    const result = await UserModel.bulkWrite(
      batch.map((op) => ({
        updateOne: { filter: { username: op.filter.username, portal: "FIELD_FORCE" }, update: { $set: op.doc }, upsert: true }
      })),
      { ordered: false }
    );
    userReport.inserted += result.upsertedCount ?? 0;
    userReport.updated += result.modifiedCount ?? 0;
  }
}

// ─── Doctors (Customer sheet) ───────────────────────────────────────────────

async function importDoctors() {
  const r = newReport("Customer", "doctors");
  const rows = sheetRows("Customer").slice(1);
  const ops: { filter: Record<string, unknown>; doc: Record<string, unknown> }[] = [];
  const seenCodes = new Set<string>();
  let seq = 0;

  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const [
      sNo, employeeName, employeeCode, patchName, customerName, gender, speciality, categoty,
      registrationNo, maritalStatus, dob, qualification, specialityBroad, address1, location,
      city, stateName, country, postalCode, clinicName, phone, email, grade
    ] = row as unknown[];

    const nameS = str(customerName);
    const patchS = str(patchName);
    const cityS = str(city);
    const stateS = str(stateName);
    const specialtyS = str(specialityBroad); // broad SPECIALITY column — matches what's already displayed today

    if (!nameS) { skip(r, "missing Customer Name"); continue; }
    if (!patchS) { skip(r, "missing Patch name (mandatory per requirements)"); continue; }
    if (!cityS) { skip(r, "missing City"); continue; }
    if (!stateS) { skip(r, "missing State"); continue; }
    if (!specialtyS) { skip(r, "missing SPECIALITY (broad)"); continue; }

    seq += 1;
    const doctorCode = `DOC${String(seq).padStart(5, "0")}`;
    if (seenCodes.has(doctorCode)) { skip(r, "duplicate Doctor Code (generator bug)"); continue; }
    seenCodes.add(doctorCode);

    trackField(r, "dob", dob);
    trackField(r, "anniversaryDate", null); // no source column exists at all
    trackField(r, "gender", gender);
    trackField(r, "registrationNo", registrationNo);
    trackField(r, "maritalStatus", maritalStatus);
    trackField(r, "qualification", qualification);
    trackField(r, "address1", address1);
    trackField(r, "location", location);
    trackField(r, "country", country);
    trackField(r, "postalCode", postalCode);
    trackField(r, "clinicName", clinicName);
    trackField(r, "phone", phone);
    trackField(r, "email", email);
    trackField(r, "grade", grade);

    ops.push({
      filter: { doctorCode },
      doc: {
        doctorCode,
        name: nameS,
        specialty: specialtyS,
        specialityCode: str(speciality),
        categoryCode: str(categoty),
        state: stateS,
        city: cityS,
        territory: patchS,
        mappedEmployeeCode: str(employeeCode),
        mappedEmployeeName: str(employeeName),
        dob: excelDate(dob),
        anniversaryDate: null,
        gender: str(gender),
        registrationNo: str(registrationNo),
        maritalStatus: str(maritalStatus),
        qualification: str(qualification),
        address1: str(address1),
        location: str(location),
        country: str(country),
        postalCode: postalCode !== null ? String(postalCode) : null,
        clinicName: str(clinicName),
        phone: str(phone),
        email: str(email)?.toLowerCase() ?? null,
        grade: str(grade)
      }
    });
  }

  await bulkUpsert(DoctorModel, ops, r);
}

// Distinct Categoty / narrow Speciality / Qualification values -> lookup collections,
// each with a computed noOfDoctors count. Run only after doctors are imported.
async function importDoctorLookups() {
  const rCat = newReport("Customer (derived: Categoty)", "doctorCategories");
  const catAgg = await DoctorModel.aggregate([
    { $match: { tenantSlug: TENANT, categoryCode: { $nin: [null, ""] } } },
    { $group: { _id: "$categoryCode", count: { $sum: 1 } } }
  ]);
  rCat.read = catAgg.length;
  const catOps = catAgg.map((g) => ({ filter: { categoryName: ci(String(g._id)) }, doc: { categoryName: g._id, noOfDoctors: g.count } }));
  await bulkUpsert(DoctorCategoryModel, catOps, rCat);

  const rSpec = newReport("Customer (derived: narrow Speciality)", "doctorSpecialities");
  const specAgg = await DoctorModel.aggregate([
    { $match: { tenantSlug: TENANT, specialityCode: { $nin: [null, ""] } } },
    { $group: { _id: "$specialityCode", count: { $sum: 1 } } }
  ]);
  rSpec.read = specAgg.length;
  const specOps = specAgg.map((g) => ({ filter: { specialityName: ci(String(g._id)) }, doc: { specialityName: g._id, noOfDoctors: g.count } }));
  await bulkUpsert(DoctorSpecialityModel, specOps, rSpec);

  const rQual = newReport("Customer (derived: Qualification)", "doctorQualifications");
  const qualAgg = await DoctorModel.aggregate([
    { $match: { tenantSlug: TENANT, qualification: { $nin: [null, ""] } } },
    { $group: { _id: "$qualification", count: { $sum: 1 } } }
  ]);
  rQual.read = qualAgg.length;
  const qualOps = qualAgg.map((g) => ({ filter: { qualificationName: ci(String(g._id)) }, doc: { qualificationName: g._id, noOfDoctors: g.count } }));
  await bulkUpsert(DoctorQualificationModel, qualOps, rQual);
}

// ─── Dealer (Chemist) ────────────────────────────────────────────────────────

async function importDealers() {
  const r = newReport("Dealer", "dealers");
  const rows = sheetRows("Dealer").slice(1);
  const ops = [];
  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const [sNo, employeeName, employeeCode, patchName, dealerName, contactPersonName, dealerPhone, dealerEmail, country, stateName, city, location, pincode, address] = row as unknown[];
    const dealerNameS = str(dealerName);
    if (!dealerNameS) { skip(r, "missing Delear Name"); continue; }
    trackField(r, "employeeName", employeeName);
    trackField(r, "employeeCode", employeeCode);
    trackField(r, "patchName", patchName);
    trackField(r, "contactPersonName", contactPersonName);
    trackField(r, "dealerPhone", dealerPhone);
    trackField(r, "dealerEmail", dealerEmail);
    trackField(r, "pincode", pincode);
    trackField(r, "address", address);
    ops.push({
      filter: { sourceSNo: num(sNo) },
      doc: {
        sourceSNo: num(sNo),
        employeeName: str(employeeName),
        employeeCode: str(employeeCode),
        patchName: str(patchName),
        dealerName: dealerNameS,
        contactPersonName: str(contactPersonName),
        dealerPhone: str(dealerPhone),
        dealerEmail: str(dealerEmail)?.toLowerCase() ?? null,
        country: str(country),
        state: str(stateName),
        city: str(city),
        location: str(location),
        pincode: pincode !== null ? String(pincode) : null,
        address: str(address)
      }
    });
  }
  await bulkUpsert(DealerModel, ops, r);
}

// ─── Holiday Calendar ────────────────────────────────────────────────────────

async function importHolidays() {
  const r = newReport("HolidayCalendar", "holidays");
  const rows = sheetRows("HolidayCalendar").slice(1);
  const ops = [];
  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const [sNo, stateName, weekendHoliday, otherHolidayDate, otherHolidayDescription, ...rest] = row as unknown[];
    const stateS = str(stateName);
    if (!stateS) { skip(r, "missing StateName"); continue; }
    trackField(r, "weekendHoliday", weekendHoliday);
    trackField(r, "otherHolidayDate", otherHolidayDate);
    trackField(r, "otherHolidayDescription", otherHolidayDescription);
    const extraNotes = rest.map((v) => str(v)).filter((v): v is string => v !== null);
    ops.push({
      filter: { sourceSNo: num(sNo) },
      doc: {
        sourceSNo: num(sNo),
        stateName: stateS,
        weekendHoliday: str(weekendHoliday),
        otherHolidayDate: excelDate(otherHolidayDate),
        otherHolidayDescription: str(otherHolidayDescription),
        extraNotes
      }
    });
  }
  await bulkUpsert(HolidayModel, ops, r);
}

// ─── SFC ─────────────────────────────────────────────────────────────────────

async function importSfc() {
  const r = newReport("SFC", "sfc");
  const rows = sheetRows("SFC").slice(1);
  const ops = [];
  for (const row of rows) {
    if (row[0] === null) continue;
    r.read++;
    const [sNo, employeeName, employeeCode, hq, patchName, typeRaw, oneWayKms, , , region] = row as unknown[];
    trackField(r, "hq", hq);
    trackField(r, "patchName", patchName);
    trackField(r, "oneWayKms", oneWayKms);
    trackField(r, "region", region);
    ops.push({
      filter: { sourceSNo: num(sNo) },
      doc: {
        sourceSNo: num(sNo),
        employeeName: str(employeeName),
        employeeCode: str(employeeCode),
        hq: str(hq),
        patchName: str(patchName),
        typeRaw: str(typeRaw),
        oneWayKms: num(oneWayKms),
        region: str(region)
      }
    });
  }
  await bulkUpsert(SfcModel, ops, r);
}

// ─── Expense ─────────────────────────────────────────────────────────────────

async function importExpenses() {
  const r = newReport("Expense", "expenses");
  const rows = sheetRows("Expense").slice(1);
  const ops = [];
  let currentRole: string | null = null;
  let currentListOfExpense: string | null = null;

  for (const row of rows) {
    const [, role, listOfExpenseTypes, station, metroType, amtNC, dailyWork, frequency, , remarks] = row as unknown[];
    // Sl.No / Role / List of Expense Types are blank on merged continuation rows — forward-fill.
    const roleS: string | null = str(role) ?? currentRole;
    const listS: string | null = str(listOfExpenseTypes) ?? currentListOfExpense;
    if (!roleS) continue; // header/blank separator row
    currentRole = roleS;
    currentListOfExpense = listS;
    r.read++;

    trackField(r, "station", station);
    trackField(r, "metroType", metroType);
    trackField(r, "amtNC", amtNC);
    trackField(r, "dailyWork", dailyWork);
    trackField(r, "frequency", frequency);

    ops.push({
      filter: { role: ci(roleS), listOfExpenseTypes: listS ? ci(listS) : null, station: station ? ci(String(station)) : null, metroType: metroType ? ci(String(metroType)) : null },
      doc: {
        role: roleS,
        listOfExpenseTypes: listS,
        station: str(station),
        metroType: str(metroType),
        amountNC: num(amtNC),
        dailyWork: str(dailyWork),
        frequency: str(frequency),
        remarks: str(remarks)
      }
    });
  }
  await bulkUpsert(ExpenseModel, ops, r);
}

// ─── Post-processing: computed counts (Sub-Division, Product Category/Brand) ─

async function computeDerivedCounts() {
  // ProductCategory.noOfProducts = count of catalog products whose therapy matches the category
  const categories = await ProductCategoryModel.find({ tenantSlug: TENANT });
  for (const cat of categories) {
    const count = await ProductCatalogModel.countDocuments({ tenantSlug: TENANT, therapy: { $regex: `^${escapeRegex(cat.categoryName)}$`, $options: "i" } });
    await ProductCategoryModel.updateOne({ _id: cat._id }, { $set: { noOfProducts: count } });
  }

  // ProductBrand.noOfProducts = count of catalog products with that brand name
  const brands = await ProductBrandModel.find({ tenantSlug: TENANT });
  const brandDivision = new Map<string, string | null>();
  for (const brand of brands) {
    const count = await ProductCatalogModel.countDocuments({ tenantSlug: TENANT, brandName: { $regex: `^${escapeRegex(brand.brandName)}$`, $options: "i" } });
    await ProductBrandModel.updateOne({ _id: brand._id }, { $set: { noOfProducts: count } });
    brandDivision.set(brand.brandName.toUpperCase(), brand.division ?? null);
  }

  // Subdivision.productwiseCount = catalog products whose brand's division matches;
  // Subdivision.fieldforcewiseCount = employees whose division matches. Both match
  // case-insensitively, same as the live /company/employees and /company/product-catalog
  // ?division= routes, so the counts shown here always agree with what those screens
  // return when you select the same division.
  const subdivisions = await SubdivisionModel.find({ tenantSlug: TENANT });
  const catalogProducts = await ProductCatalogModel.find({ tenantSlug: TENANT }, { brandName: 1 });
  for (const sub of subdivisions) {
    const subDivisionUpper = sub.division.toUpperCase();
    const productwiseCount = catalogProducts.filter((p) => {
      if (!p.brandName) return false;
      const division = brandDivision.get(p.brandName.toUpperCase());
      return division != null && division.toUpperCase() === subDivisionUpper;
    }).length;
    const fieldforcewiseCount = await EmployeeModel.countDocuments({
      tenantSlug: TENANT,
      division: { $regex: `^${escapeRegex(sub.division)}$`, $options: "i" }
    });
    await SubdivisionModel.updateOne({ _id: sub._id }, { $set: { productwiseCount, fieldforcewiseCount } });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

// One-time repair for documents written by the original version of this script, which
// used a raw bulkWrite $set that (unlike Model.create()) never applies Mongoose's
// status default("ACTIVE") — every previously-imported document is missing `status`
// entirely. $setOnInsert in bulkUpsert() only protects future inserts; it doesn't touch
// documents that already exist. Runs first so the fix takes effect even if the rest of
// the import is interrupted.
async function backfillMissingStatus() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models: mongoose.Model<any>[] = [
    SubdivisionModel, ProductCategoryModel, ProductGroupModel, ProductBrandModel, ProductCatalogModel,
    EmployeeModel, DoctorModel, DoctorCategoryModel, DoctorSpecialityModel, DoctorQualificationModel,
    DealerModel, HolidayModel, SfcModel, ExpenseModel,
    CountryModel, StateModel, CityModel, LocationModel, HeadQuarterModel, RoleReferenceModel, LeaveTypeModel, CompetitorMapModel
  ];
  let totalFixed = 0;
  for (const Model of models) {
    const result = await Model.updateMany(
      { tenantSlug: TENANT, status: { $exists: false } },
      { $set: { status: "ACTIVE" } }
    );
    if (result.modifiedCount) {
      console.log(`Backfilled status="ACTIVE" on ${result.modifiedCount} existing ${Model.modelName} document(s).`);
      totalFixed += result.modifiedCount;
    }
  }
  console.log(`Status backfill complete: ${totalFixed} document(s) fixed.\n`);
}

async function main() {
  await connectMongo();
  console.log(`Connected to MongoDB. Importing from ${EXCEL_PATH} into tenant "${TENANT}"...\n`);

  await backfillMissingStatus();

  await importCountry();
  await importState();
  await importCity();
  await importLocation();
  await importHeadQuarter();
  await importRole();
  await importLeave();
  await importCompetitorMap();

  await importSubdivision();
  await importProductCategory();
  await importProductGroup();
  await importProductBrand();
  await importProductCatalog();

  await importEmployees();
  await importDoctors();
  await importDoctorLookups();

  await importDealers();
  await importHolidays();
  await importSfc();
  await importExpenses();

  await computeDerivedCounts();

  printReport();
  await mongoose.disconnect();
}

function printReport() {
  console.log("\n" + "=".repeat(100));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(100));
  for (const r of reports) {
    console.log(`\n--- ${r.sheet} -> ${r.collection} ---`);
    console.log(`  read: ${r.read}  inserted: ${r.inserted}  updated: ${r.updated}  skipped: ${r.skipped}`);
    if (Object.keys(r.skipReasons).length) {
      console.log(`  skip reasons:`);
      for (const [reason, count] of Object.entries(r.skipReasons)) {
        console.log(`    - ${reason}: ${count}`);
      }
    }
    if (Object.keys(r.fieldCompleteness).length) {
      const denom = r.read - r.skipped || r.read || 1;
      console.log(`  field completeness (of ${denom} imported rows):`);
      for (const [field, stat] of Object.entries(r.fieldCompleteness)) {
        const pct = ((stat.populated / denom) * 100).toFixed(1);
        console.log(`    - ${field}: ${stat.populated}/${denom} (${pct}%)`);
      }
    }
  }
  console.log("\n" + "=".repeat(100));
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
