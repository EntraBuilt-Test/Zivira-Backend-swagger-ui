// src/seed/exact-10.ts
//
// Resets EVERY master dataset — every legacy per-collection model the Admin
// portal's dedicated screens read from, AND every one of the 54 generic
// "masters registry" tabs (src/masters/registry.ts) — to EXACTLY 10 records
// per tenant, cross-linked to each other wherever the field is a code/name
// reference (doctor -> assigned MR, product -> brand -> molecule -> therapy
// -> division, stockist -> state/HQ, etc.).
//
// This directly fixes the "different tabs have different amounts / made-up
// names" problem: every tab that references "the doctor", "the employee",
// "the product" etc. now points at the SAME 10 canonical identities defined
// below, whether it's reading the legacy Doctor/Employee/Product/Stockist
// collections (used by DCR, Tour Plan, Visit Coverage, GST) or the newer
// generic doctorMaster/employees/productMaster/stockistMaster tabs (used by
// the Admin Masters screen).
//
// Usage (per PRD Section 5.4 — must run locally, Render free tier has no
// shell access):
//   cd Zivira-backend-main
//   $env:MONGODB_URI="<the real connection string>"
//   npm install
//   npx tsx scripts/seed-exact-10.ts
//
// Or trigger remotely once deployed, via the protected HTTP endpoint added
// in src/routes/seed.routes.ts:
//   POST {API_URL}/seed/exact-10   header: x-seed-secret: <SEED_SECRET>
//
// Safe to re-run any time — every collection is fully reset
// (deleteMany + insertMany) so the result is always exactly 10 rows, never
// 11, never duplicated.

import bcrypt from "bcryptjs";
import { connectMongo } from "../db.js";

import { EmployeeModel } from "../models/employee.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ProductModel } from "../models/product.model.js";
import { StockistModel } from "../models/stockist.model.js";
import { CompanyBranchModel } from "../models/company-branch.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { ProductCategoryModel } from "../models/product-category.model.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
import { ProductCatalogModel } from "../models/product-catalog.model.js";
import { DoctorCategoryModel } from "../models/doctor-category.model.js";
import { DoctorSpecialityModel } from "../models/doctor-speciality.model.js";
import { DoctorQualificationModel } from "../models/doctor-qualification.model.js";
import { ProductGroupModel } from "../models/product-group.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { HolidayModel } from "../models/holiday.model.js";
import { SfcModel } from "../models/sfc.model.js";
import { ExpenseModel } from "../models/expense.model.js";
import { HospitalModel } from "../models/hospital.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { FieldForceModel } from "../models/fieldforce.model.js";
import { UserModel } from "../models/user.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { MASTERS, type MasterConfig, type MasterField } from "../masters/registry.js";

const TENANT = "zivira-labs";
const N = 10; // the whole point of this script

// ─────────────────────────────────────────────────────────────────────────
// Canonical identity pools — every master/tab that references "a doctor",
// "an employee", "a product" etc. draws from these SAME 10 rows.
// ─────────────────────────────────────────────────────────────────────────

const TERRITORIES = [
  { code: "MUM", hq: "Mumbai HQ", city: "Mumbai", state: "Maharashtra", zone: "West", region: "Mumbai Metro" },
  { code: "PUN", hq: "Pune HQ", city: "Pune", state: "Maharashtra", zone: "West", region: "Maharashtra" },
  { code: "BLR", hq: "Bangalore HQ", city: "Bangalore", state: "Karnataka", zone: "South", region: "Karnataka" },
  { code: "CHE", hq: "Chennai HQ", city: "Chennai", state: "Tamil Nadu", zone: "South", region: "Tamil Nadu" },
  { code: "HYD", hq: "Hyderabad HQ", city: "Hyderabad", state: "Telangana", zone: "South", region: "Telangana" },
  { code: "DEL", hq: "Delhi HQ", city: "Delhi", state: "Delhi", zone: "North", region: "Delhi NCR" },
  { code: "KOL", hq: "Kolkata HQ", city: "Kolkata", state: "West Bengal", zone: "East", region: "West Bengal" },
  { code: "AHM", hq: "Ahmedabad HQ", city: "Ahmedabad", state: "Gujarat", zone: "West", region: "Gujarat" },
  { code: "KOC", hq: "Kochi HQ", city: "Kochi", state: "Kerala", zone: "South", region: "Kerala" },
  { code: "CHD", hq: "Chandigarh HQ", city: "Chandigarh", state: "Punjab", zone: "North", region: "Punjab" }
];

const EMPLOYEES = [
  { code: "NBH-001", name: "Arvind Rao", designation: "National Business Head", role: "NBH", division: "Zivira", territoryIdx: 0, manager: null },
  { code: "RBM-001", name: "Sunita Kulkarni", designation: "Regional Business Manager", role: "RBM", division: "Zivira", territoryIdx: 0, manager: "NBH-001" },
  { code: "ABM-001", name: "Vikram Shah", designation: "Area Business Manager", role: "ABM", division: "Zivira", territoryIdx: 0, manager: "RBM-001" },
  { code: "ABM-002", name: "Priya Nair", designation: "Area Business Manager", role: "ABM", division: "Astra", territoryIdx: 2, manager: "RBM-001" },
  { code: "MR-001", name: "Rahul Deshmukh", designation: "Medical Representative", role: "MR", division: "Zivira", territoryIdx: 0, manager: "ABM-001" },
  { code: "MR-002", name: "Anjali Menon", designation: "Medical Representative", role: "MR", division: "Zivira", territoryIdx: 1, manager: "ABM-001" },
  { code: "MR-003", name: "Karthik Subramaniam", designation: "Medical Representative", role: "MR", division: "Astra", territoryIdx: 3, manager: "ABM-002" },
  { code: "SR-MR-001", name: "Deepa Iyer", designation: "Senior Medical Representative", role: "SR_MR", division: "Astra", territoryIdx: 2, manager: "ABM-002" },
  { code: "MR-004", name: "Manoj Pillai", designation: "Medical Representative", role: "MR", division: "Aura", territoryIdx: 8, manager: "ABM-002" },
  { code: "MR-005", name: "Farhan Sheikh", designation: "Medical Representative", role: "MR", division: "Zivira", territoryIdx: 5, manager: "ABM-001" }
];

const SPECIALTIES = ["Ophthalmologist", "Cardiologist", "General Physician", "ENT Specialist", "Dermatologist", "Pediatrician", "Orthopedic", "Diabetologist", "Neurologist", "Gynaecologist"];
const QUALIFICATIONS = ["MBBS", "MBBS, MD", "MBBS, MS", "MBBS, DNB", "MBBS, DGO", "MBBS, MD (Ophthal)", "MBBS, MS (ENT)", "MBBS, MD (Derm)", "MBBS, MD (Peds)", "MBBS, MD (Cardio)"];

// Doctor -> MR mapping is round-robin by default, but indices 7 and 8 are
// pinned to MR-001 instead of their round-robin owners (MR-002/MR-003) so
// MR-001 has 4 doctors to visit instead of 2 — every other MR still keeps
// at least one, and the total stays at exactly 10 (no new doctor records,
// just a different assignment of the same 10).
const DOCTOR_MR_OVERRIDES: Record<number, string> = { 7: "MR-001", 8: "MR-001" };

const DOCTORS = TERRITORIES.slice(0, N).map((t, i) => {
  const mrList = EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR");
  const mr = DOCTOR_MR_OVERRIDES[i] ? mrList.find((e) => e.code === DOCTOR_MR_OVERRIDES[i])! : mrList[i % 6];
  return {
    code: `DOC-${String(i + 1).padStart(3, "0")}`,
    name: `Dr. ${["Ananya Mehta", "Rajesh Kumar", "Sneha Patil", "Arun Prakash", "Kavita Reddy", "Suresh Nair", "Meera Iyer", "Amit Joshi", "Divya Krishnan", "Rohan Verma"][i]}`,
    specialty: SPECIALTIES[i],
    qualification: QUALIFICATIONS[i],
    category: (["A", "B", "C"] as const)[i % 3],
    territoryIdx: i,
    mappedEmployeeCode: mr.code,
    mappedEmployeeName: mr.name,
    phone: `9${(800000000 + i * 111111).toString().slice(0, 9)}`,
    email: `dr.${["ananya.mehta", "rajesh.kumar", "sneha.patil", "arun.prakash", "kavita.reddy", "suresh.nair", "meera.iyer", "amit.joshi", "divya.krishnan", "rohan.verma"][i]}@clinic-demo.in`
  };
});

const THERAPIES = ["Ophthalmology", "Cardiology", "Diabetology", "Dermatology", "Pediatrics", "Neurology", "Gynaecology", "Orthopedics", "ENT", "General Medicine"];
const MOLECULES = ["Carboxymethylcellulose", "Olopatadine", "Moxifloxacin", "Loteprednol", "Timolol", "Brimonidine", "Ketotifen", "Nepafenac", "Bimatoprost", "Cyclosporine"];
const DIVISIONS_3 = ["Zivira", "Astra", "Aura"];

const PRODUCTS = MOLECULES.map((molecule, i) => ({
  code: `ZV-${String(i + 1).padStart(3, "0")}`,
  name: `${["Zivacard", "Zivatears", "Zivaflox", "Zivalergy", "Zivaglauc", "Zivapress", "Zivakid", "Zivapain", "Zivaskin", "Zivaneuro"][i]} ${[10, 5, 3, 2, 1, 20, 15, 8, 4, 6][i]}`,
  brand: `${["Zivacard", "Zivatears", "Zivaflox", "Zivalergy", "Zivaglauc", "Zivapress", "Zivakid", "Zivapain", "Zivaskin", "Zivaneuro"][i]}`,
  molecule,
  therapy: THERAPIES[i],
  division: DIVISIONS_3[i % 3],
  category: THERAPIES[i],
  uom: ["Tube", "Strip", "Bottle", "Vial", "Box"][i % 5]
}));

const GIFT_ITEM_TYPES = ["Pen", "Calendar", "Notepad", "Literature", "Diary", "Mug", "Visiting Card Holder", "Prescription Pad", "Key Chain", "Desk Clock"];

const STOCKISTS = TERRITORIES.slice(0, N).map((t, i) => ({
  code: `ST-${String(i + 1).padStart(3, "0")}`,
  name: `${t.city} ${["Pharma Distributors", "Medical Agencies", "Drug House", "Healthcare Traders", "Surgical & Pharma Co", "Life Sciences Agency", "Wellness Distributors", "Med Supply Co", "Pharma Corner", "Medico Traders"][i]}`,
  gst: `${["27", "27", "29", "33", "36", "07", "19", "24", "32", "03"][i]}AAACZ${1000 + i}J1Z${(i % 9) + 1}`,
  state: t.state,
  hq: t.hq,
  city: t.city,
  phone: `9${(700000000 + i * 222222).toString().slice(0, 9)}`,
  address: `${12 + i}, Market Road, ${t.city}`,
  mrCode: EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR")[i % 6].code,
  mrName: EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR")[i % 6].name
}));

const BRANCHES = [
  { name: "Bangalore HQ", gst: "29AAACZ3085J1ZP", city: "Bangalore", state: "Karnataka", pin: "560068", hq: true },
  { name: "Chennai Branch", gst: "33AAACZ3085J1ZQ", city: "Chennai", state: "Tamil Nadu", pin: "600006", hq: false },
  { name: "Mumbai Branch", gst: "27AAACZ3085J1ZR", city: "Mumbai", state: "Maharashtra", pin: "400063", hq: false },
  { name: "Delhi Branch", gst: "07AAACZ3085J1ZS", city: "Delhi", state: "Delhi", pin: "110020", hq: false },
  { name: "Hyderabad Branch", gst: "36AAACZ3085J1ZT", city: "Hyderabad", state: "Telangana", pin: "500034", hq: false },
  { name: "Kolkata Branch", gst: "19AAACZ3085J1ZU", city: "Kolkata", state: "West Bengal", pin: "700016", hq: false },
  { name: "Ahmedabad Branch", gst: "24AAACZ3085J1ZV", city: "Ahmedabad", state: "Gujarat", pin: "380015", hq: false },
  { name: "Pune Branch", gst: "27AAACZ3085J2ZW", city: "Pune", state: "Maharashtra", pin: "411001", hq: false },
  { name: "Kochi Branch", gst: "32AAACZ3085J1ZX", city: "Kochi", state: "Kerala", pin: "682016", hq: false },
  { name: "Chandigarh Branch", gst: "03AAACZ3085J1ZY", city: "Chandigarh", state: "Punjab", pin: "160017", hq: false }
];

function chunk(arr: string[], n: number) { return arr[n % arr.length]; }
function daysAgo(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }
function isoDate(n: number) { return daysAgo(n).toISOString().slice(0, 10); }

// ─────────────────────────────────────────────────────────────────────────

async function reset<T>(Model: { deleteMany: (q: object) => Promise<unknown>; insertMany: (docs: T[]) => Promise<unknown> }, filter: object, docs: T[], label: string) {
  await Model.deleteMany(filter);
  await Model.insertMany(docs);
  console.log(`  [${docs.length === N ? "OK" : "!!"}] ${label}: ${docs.length} records`);
}

async function seedLegacyModels() {
  console.log("\n── Legacy per-collection models (used by DCR / Tour Plan / GST / MIS) ──");

  await reset(EmployeeModel, { tenantSlug: TENANT }, EMPLOYEES.map((e) => ({
    tenantSlug: TENANT,
    name: e.name,
    employeeCode: e.code,
    designation: e.designation,
    division: e.division,
    reportingManager: e.manager ?? undefined,
    territory: TERRITORIES[e.territoryIdx].hq,
    role: e.role,
    email: `${e.code.toLowerCase()}@ziviralabs.com`,
    phone: `9${(600000000 + e.territoryIdx * 333333).toString().slice(0, 9)}`,
    joinDate: daysAgo(365 + e.territoryIdx * 30),
    city: TERRITORIES[e.territoryIdx].city,
    state: TERRITORIES[e.territoryIdx].state,
    country: "India",
    drivingLicense: `DL-${TERRITORIES[e.territoryIdx].state.slice(0, 2).toUpperCase()}-${String(2018 + (e.territoryIdx % 6)).slice(2)}-${String(1000000 + e.territoryIdx * 12345).slice(0, 7)}`,
    status: "ACTIVE"
  })), "Employee");

  await reset(DoctorModel, { tenantSlug: TENANT }, DOCTORS.map((d) => ({
    tenantSlug: TENANT,
    name: d.name,
    specialty: d.specialty,
    category: d.category,
    state: TERRITORIES[d.territoryIdx].state,
    city: TERRITORIES[d.territoryIdx].city,
    territory: TERRITORIES[d.territoryIdx].hq,
    mappedEmployeeCode: d.mappedEmployeeCode,
    mappedEmployeeName: d.mappedEmployeeName,
    doctorCode: d.code,
    qualification: d.qualification,
    phone: d.phone,
    email: d.email,
    gender: ["Male", "Female"][DOCTORS.indexOf(d) % 2],
    clinicName: `${d.name.replace("Dr. ", "")} Clinic`,
    grade: d.category,
    status: "ACTIVE"
  })), "Doctor");

  await reset(ProductModel, { tenantSlug: TENANT }, PRODUCTS.map((p) => ({
    tenantSlug: TENANT,
    name: p.name,
    code: p.code,
    productName: p.name,
    brandName: p.brand,
    description: `${p.molecule} — ${p.category}`,
    saleUnit: p.uom,
    category: p.category,
    division: p.division,
    subDivision: p.division,
    status: "ACTIVE"
  })), "Product");

  await reset(StockistModel, { tenantSlug: TENANT }, STOCKISTS.map((s) => ({
    tenantSlug: TENANT,
    name: s.name,
    erpCode: s.code,
    state: s.state,
    hqName: s.hq,
    address: s.address,
    phone: s.phone,
    fieldForceName: s.mrName,
    status: "ACTIVE"
  })), "Stockist");

  await reset(CompanyBranchModel, { tenantSlug: TENANT }, BRANCHES.map((b) => ({
    tenantSlug: TENANT,
    branchName: b.name,
    gstNumber: b.gst,
    address: `${b.name}, Zivira Labs Pvt. Ltd.`,
    city: b.city,
    state: b.state,
    pincode: b.pin,
    isHeadquarters: b.hq,
    status: "ACTIVE"
  })), "CompanyBranch (GST)");

  await reset(SubdivisionModel, { tenantSlug: TENANT }, [
    "Zivira Cardio-Diabetes", "Zivira Ophthalmology", "Zivira General Medicine",
    "Astra Neurology", "Astra Pain Care", "Astra Dermatology",
    "Aura Pediatrics", "Aura Gynaecology", "Aura ENT", "Aura Orthopedics"
  ].map((division, i) => ({
    tenantSlug: TENANT,
    division,
    subdivisionName: division,
    productwiseCount: 2 + (i % 3),
    fieldforcewiseCount: 1 + (i % 2),
    status: "ACTIVE"
  })), "Subdivision");

  await reset(ProductCategoryModel, { tenantSlug: TENANT }, THERAPIES.map((t, i) => ({
    tenantSlug: TENANT, shortName: t.slice(0, 4).toUpperCase(), categoryName: t, noOfProducts: PRODUCTS.filter((p) => p.category === t).length, sortOrder: i + 1, status: "ACTIVE"
  })), "ProductCategory");

  await reset(ProductBrandModel, { tenantSlug: TENANT }, PRODUCTS.map((p, i) => ({
    tenantSlug: TENANT, shortName: p.brand.slice(0, 4).toUpperCase(), brandName: p.brand, division: p.division, moleculeName: p.molecule, noOfProducts: 1, sortOrder: i + 1, status: "ACTIVE"
  })), "ProductBrand");

  await reset(ProductCatalogModel, { tenantSlug: TENANT }, PRODUCTS.map((p, i) => ({
    tenantSlug: TENANT, productCode: p.code, productName: p.name, description: `${p.molecule} — used in ${p.therapy}`, brandName: p.brand, molecule: p.molecule, therapy: p.therapy, saleUnit: p.uom, sortOrder: i + 1, status: "ACTIVE"
  })), "ProductCatalog");

  await reset(DoctorCategoryModel, { tenantSlug: TENANT }, [
    ["A", "Super Core — Top prescribers", 3], ["B", "Core — Regular prescribers", 3], ["C", "Non Core — Occasional", 2], ["D", "Prospect — Not yet prescribing", 2],
    ["A+", "Key Opinion Leader", 0], ["B+", "Rising Prescriber", 0], ["Trial", "Sample-stage doctor", 0], ["Referral", "Referral-only doctor", 0],
    ["Institutional", "Hospital-attached doctor", 0], ["Retired", "No longer practicing", 0]
  ].map(([code, label, count], i) => ({
    tenantSlug: TENANT, shortName: String(code), categoryName: `${code} — ${label}`, noOfDoctors: Number(count), noOfVisit: 3, sortOrder: i + 1, status: "ACTIVE"
  })), "DoctorCategory");

  await reset(DoctorSpecialityModel, { tenantSlug: TENANT }, SPECIALTIES.map((s, i) => ({
    tenantSlug: TENANT, shortName: s.slice(0, 4).toUpperCase(), specialityName: s, noOfDoctors: DOCTORS.filter((d) => d.specialty === s).length, sortOrder: i + 1, status: "ACTIVE"
  })), "DoctorSpeciality");

  await reset(DoctorQualificationModel, { tenantSlug: TENANT }, QUALIFICATIONS.map((q, i) => ({
    tenantSlug: TENANT, qualificationName: q, noOfDoctors: DOCTORS.filter((d) => d.qualification === q).length, sortOrder: i + 1, status: "ACTIVE"
  })), "DoctorQualification");

  await reset(ProductGroupModel, { tenantSlug: TENANT }, MOLECULES.map((m, i) => ({
    tenantSlug: TENANT, moleculeName: m, therapyName: THERAPIES[i], status: "ACTIVE"
  })), "ProductGroup");

  const dealerRows = STOCKISTS.map((s, i) => ({
    tenantSlug: TENANT, sourceSNo: i + 1, employeeName: s.mrName, employeeCode: s.mrCode, patchName: s.hq,
    dealerName: s.name, contactPersonName: `Contact Person ${i + 1}`, dealerPhone: s.phone,
    dealerEmail: `${s.code.toLowerCase()}@dealer-demo.in`, country: "India", state: s.state, city: s.city,
    location: s.city, pincode: `${400000 + i * 1111}`, address: s.address, status: "ACTIVE"
  }));
  await reset(DealerModel, { tenantSlug: TENANT }, dealerRows, "Dealer");
  // Zivira_Master_Client_Change_Requirement_3A.docx — this is the real,
  // live Chemist Master data (the "Add Chemist" screen writes here via
  // /company/dealers). Cached under the registry key "dealers" so every
  // "Chemist" field elsewhere (sourceMaster: "dealers") resolves against
  // these same real records instead of a disconnected placeholder.
  cache.set("dealers", dealerRows);

  await reset(HolidayModel, { tenantSlug: TENANT }, TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, sourceSNo: i + 1, stateName: t.state, weekendHoliday: "Sunday",
    otherHolidayDate: new Date(Date.UTC(2026, i % 12, 15)), otherHolidayDescription: ["Republic Day", "Holi", "Good Friday", "Independence Day", "Ganesh Chaturthi", "Diwali", "Christmas", "Pongal", "Onam", "Gurpurab"][i],
    extraNotes: [], status: "ACTIVE"
  })), "Holiday");

  await reset(SfcModel, { tenantSlug: TENANT }, EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR").concat(EMPLOYEES.slice(0, 4)).slice(0, N).map((e, i) => ({
    tenantSlug: TENANT, sourceSNo: i + 1, employeeName: e.name, employeeCode: e.code, hq: TERRITORIES[e.territoryIdx].hq,
    patchName: `${TERRITORIES[e.territoryIdx].city} Patch ${i + 1}`, typeRaw: ["Tour", "Outstation Work", "Outstation Excursion", "Admin"][i % 4],
    oneWayKms: 15 + i * 5, region: TERRITORIES[e.territoryIdx].region, status: "ACTIVE"
  })), "Sfc");

  await reset(ExpenseModel, { tenantSlug: TENANT }, EMPLOYEES.map((e, i) => ({
    tenantSlug: TENANT, sourceSNo: i + 1, role: e.role, listOfExpenseTypes: ["Travel", "Lodging", "Conveyance", "Food", "Stationery", "Courier", "Mobile", "Internet", "Printing", "Miscellaneous"][i],
    station: TERRITORIES[e.territoryIdx].city, metroType: i % 2 === 0 ? "Metro" : "Non-Metro", amountNC: 500 + i * 150,
    dailyWork: "Field Visit", frequency: "Monthly", remarks: `Standard ${e.role} allowance`, status: "ACTIVE"
  })), "Expense");

  await reset(HospitalModel, { tenantSlug: TENANT }, TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, hospitalCode: `HOSP-${String(i + 1).padStart(3, "0")}`, hospitalName: `${t.city} ${["General Hospital", "City Hospital", "Care Hospital", "Multispeciality Hospital", "Medical Centre"][i % 5]}`,
    type: (["Private", "Government", "Trust", "Other"] as const)[i % 4], city: t.city,
    medicalRepresentative: EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR")[i % 6].name, status: "ACTIVE"
  })), "Hospital");

  await reset(UnlistedDoctorModel, { tenantSlug: TENANT }, TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, tempCode: `TEMP-DOC-${String(i + 1).padStart(3, "0")}`, name: `Dr. Pending Review ${i + 1}`,
    specialty: SPECIALTIES[(i + 3) % SPECIALTIES.length], city: t.city, mr: EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR")[i % 6].name,
    clinicName: `New Clinic ${i + 1}`, address: `${t.city} Market Area`, area: "Market Area", state: t.state, pinCode: `${500000 + i * 1234}`,
    patch: t.hq, hq: t.hq, mobile: `9${(500000000 + i * 444444).toString().slice(0, 9)}`, email: `unlisted${i + 1}@clinic-demo.in`,
    visitFrequency: "Monthly", potential: ["High", "Medium", "Low"][i % 3], remarks: "Awaiting admin approval",
    status: "Pending"
  })), "UnlistedDoctor");

  await reset(FieldForceModel, { tenantSlug: TENANT }, EMPLOYEES.map((e) => ({
    tenantSlug: TENANT, name: e.name, designation: e.designation, hq: TERRITORIES[e.territoryIdx].hq,
    reportingTo: e.manager ?? "", subDivision: e.division, employeeCode: e.code, status: "ACTIVE"
  })), "FieldForce");
}

async function seedTourPlans() {
  console.log("\n── Tour Plans (demo data for the new Void/Reassign workflow) ──");
  const mrs = EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR");
  const month = new Date().toISOString().slice(0, 7);

  // BUG FIXED: the previous version computed a padded tpId with
  // `Math.ceil((i+1)/mrs.length)+1`, which SKIPPED sequence "002" for the
  // first MR and jumped straight to "003". That gap meant the real
  // nextTourPlanId() logic in utils/tour-plan-id.ts (at the time, based on
  // countDocuments) would later regenerate the exact same "003" the MR
  // tries to submit for real, causing a permanent E11000 duplicate-key error
  // on first use. Sequence numbers per employee+month must always be
  // strictly sequential with no gaps — tracked here with a running counter
  // per employee code instead of a derived formula. Statuses also now match
  // what the real workflow actually produces (SUBMITTED/APPROVED/REJECTED/
  // VOIDED) — "DRAFT" is never set by the live submit flow, so seeding it
  // just left dead rows Managers could never act on.
  const nextSeq = new Map<string, number>();
  function seq(employeeCode: string) {
    const n = (nextSeq.get(employeeCode) ?? 0) + 1;
    nextSeq.set(employeeCode, n);
    return String(n).padStart(3, "0");
  }
  function makeTp(mr: (typeof EMPLOYEES)[number], i: number, overrides: Partial<{
    status: string; assignedManager: string | null; parentTpId: string; reassignedToTpId: string;
    voidedBy: string; voidedAt: Date; voidReason: string; rejectReason: string; approvedBy: string; approvedAt: Date;
  }> = {}) {
    const tpId = `TP-${month}-${mr.code}-${seq(mr.code)}`;
    return {
      tenantSlug: TENANT,
      tpId,
      employeeCode: mr.code,
      employeeName: mr.name,
      primaryManager: mr.manager,
      assignedManager: overrides.assignedManager ?? mr.manager,
      month,
      locations: [
        { date: isoDate(-1 - i), area: TERRITORIES[i % TERRITORIES.length].city, town: TERRITORIES[i % TERRITORIES.length].hq, purpose: "Regular Coverage" },
        { date: isoDate(-2 - i), area: TERRITORIES[(i + 1) % TERRITORIES.length].city, town: TERRITORIES[(i + 1) % TERRITORIES.length].hq, purpose: "Joint Work" }
      ],
      status: overrides.status ?? "SUBMITTED",
      gstBranchCode: BRANCHES[i % BRANCHES.length].gst,
      gstBranchName: BRANCHES[i % BRANCHES.length].name,
      parentTpId: overrides.parentTpId,
      reassignedToTpId: overrides.reassignedToTpId,
      voidedBy: overrides.voidedBy,
      voidedAt: overrides.voidedAt,
      voidReason: overrides.voidReason,
      rejectReason: overrides.rejectReason,
      approvedBy: overrides.approvedBy,
      approvedAt: overrides.approvedAt
    };
  }

  const docs: ReturnType<typeof makeTp>[] = [];
  const mr001 = mrs.find((m) => m.code === "MR-001") ?? mrs[0];

  // One straightforward TP per MR — first two pre-approved, rest pending
  // (so the Manager portal has real SUBMITTED rows to approve/reject).
  // BUG FIXED: this used to ALSO create a base TP for MR-001 here, on top of
  // the separate voided+reassigned pair below — leaving MR-001 with two
  // simultaneously "active" Tour Plans for the same month (their base TP
  // plus the reassigned one). That's exactly the state the manager-portal
  // reassign guard correctly refuses to resolve (there's no way to tell
  // which of two independent active TPs is "the" one), which is what
  // produced the false-positive "already has an active Tour Plan" error.
  // MR-001 is skipped here — their only Tour Plan this month is the
  // voided-then-reassigned pair created below.
  mrs.forEach((mr, i) => {
    if (mr.code === mr001.code) return;
    docs.push(makeTp(mr, i, mr.code === "MR-002" || mr.code === "SR-MR-001"
      ? { status: "APPROVED", approvedBy: mr.manager ?? undefined, approvedAt: daysAgo(2) }
      : { status: "SUBMITTED" }));
  });

  // Cross-manager void + reassign demo (PRD 12.1) — MR-001's ONLY Tour Plan
  // for the month starts life under their primary manager, gets voided by a
  // second manager, and replaced with a new linked TP under that manager's
  // chain. Keeping this as MR-001's sole TP for the month means they always
  // have exactly one active plan (the reassigned one) — a real reassign of
  // it will succeed instead of tripping the "separate active TP" guard.
  const crossManager = EMPLOYEES.find((e) => e.role === "ABM" && e.code !== mr001.manager)?.code ?? mr001.manager;
  const voided = makeTp(mr001, 6, {
    status: "VOIDED", voidedBy: crossManager ?? undefined, voidedAt: daysAgo(1), voidReason: "Accompanying Manager B's team on a joint tour this month"
  });
  docs.push(voided);
  const reassigned = makeTp(mr001, 6, {
    status: "SUBMITTED", assignedManager: crossManager, parentTpId: voided.tpId
  });
  voided.reassignedToTpId = reassigned.tpId;
  docs.push(reassigned);

  // One rejected TP, for a realistic status mix.
  const mr002 = mrs.find((m) => m.code !== mr001.code) ?? mrs[1];
  docs.push(makeTp(mr002, 7, { status: "REJECTED", rejectReason: "Overlaps with last month's uncovered patch — resubmit with corrected route" }));

  // Forward-looking Tour Plan for MR-001 covering visits to the two doctors
  // just remapped to them (DOCTOR_MR_OVERRIDES above — Dr. Amit Joshi and
  // Dr. Divya Krishnan). Filed for NEXT month rather than the current one:
  // MR-001 already has an active Tour Plan this month (the reassigned pair
  // above), and the one-active-TP-per-month guard (field.routes.ts /
  // manager.routes.ts) would reject a second one for the same month.
  const nextMonthDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  docs.push({
    tenantSlug: TENANT,
    tpId: `TP-${nextMonth}-${mr001.code}-001`,
    employeeCode: mr001.code,
    employeeName: mr001.name,
    primaryManager: mr001.manager,
    assignedManager: mr001.manager,
    month: nextMonth,
    locations: [
      { date: `${nextMonth}-05`, area: TERRITORIES[1].city, town: TERRITORIES[1].hq, purpose: "Doctor Visit — Dr. Amit Joshi" },
      { date: `${nextMonth}-12`, area: TERRITORIES[2].city, town: TERRITORIES[2].hq, purpose: "Doctor Visit — Dr. Divya Krishnan" }
    ],
    status: "SUBMITTED",
    gstBranchCode: BRANCHES[0].gst,
    gstBranchName: BRANCHES[0].name,
    parentTpId: undefined,
    reassignedToTpId: undefined,
    voidedBy: undefined,
    voidedAt: undefined,
    voidReason: undefined,
    rejectReason: undefined,
    approvedBy: undefined,
    approvedAt: undefined
  });

  // Pad up to exactly N. Every MR already has exactly one active (DRAFT/
  // SUBMITTED/APPROVED) Tour Plan at this point from the loops above — a
  // second SUBMITTED/APPROVED plan for the same MR+month would recreate the
  // very "two active TPs" bug this seed was just fixed to avoid. REJECTED
  // is terminal and never counts as active (matches the submit-time guard
  // in field.routes.ts and the reassign guard in manager.routes.ts), so pad
  // with additional REJECTED history instead — still realistic, never
  // conflicts, sequence numbers stay strictly sequential per employee.
  let padIdx = 8;
  while (docs.length < N) {
    const mr = mrs[padIdx % mrs.length];
    docs.push(makeTp(mr, padIdx, { status: "REJECTED", rejectReason: "Route overlaps with a colleague's patch — resubmit with corrected locations" }));
    padIdx++;
  }

  const finalDocs = docs.slice(0, N);
  await reset(TourPlanModel, { tenantSlug: TENANT }, finalDocs, "TourPlan");
  return finalDocs;
}

// PRD 12.5 follow-up — "how it should be redirect to the admin, manager, to
// claim their expenses ... create a linkage for this." Demo Expense Claims
// filed against the Tour Plans just seeded above, inheriting their GST
// branch — gives Admin/Manager a realistic branch-wise claims report out of
// the box instead of an empty screen.
async function seedExpenseClaims(tourPlanDocs: Awaited<ReturnType<typeof seedTourPlans>>) {
  console.log("\n── Expense Claims (GST Branch → claims linkage demo data) ──");

  // Claims can only ever be filed against a live Tour Plan (VOIDED/REJECTED
  // ones are blocked by the field route) — same rule applied here.
  const eligible = tourPlanDocs.filter((tp) => tp.status !== "VOIDED" && tp.status !== "REJECTED");
  const categories = ["Travel", "Lodging", "Food", "Local Conveyance", "Other"] as const;

  const claimSeq = new Map<string, number>();
  function nextClaimId(employeeCode: string, month: string) {
    const key = `${employeeCode}-${month}`;
    const n = (claimSeq.get(key) ?? 0) + 1;
    claimSeq.set(key, n);
    return `EXP-${month}-${employeeCode.toUpperCase()}-${String(n).padStart(3, "0")}`;
  }

  const docs = [];
  for (let i = 0; i < N; i++) {
    const tp = eligible[i % eligible.length];
    const status = i < 5 ? "APPROVED" : i < 8 ? "SUBMITTED" : "REJECTED";
    const category = categories[i % categories.length];
    docs.push({
      tenantSlug: TENANT,
      claimId: nextClaimId(tp.employeeCode, tp.month),
      employeeCode: tp.employeeCode,
      employeeName: tp.employeeName,
      assignedManager: tp.assignedManager,
      tpId: tp.tpId,
      month: tp.month,
      gstBranchCode: tp.gstBranchCode,
      gstBranchName: tp.gstBranchName,
      category,
      expenseDate: isoDate(i + 1),
      amountRs: 500 + i * 275,
      description: `${category} expense during Tour Plan ${tp.tpId}`,
      status,
      approvedBy: status === "APPROVED" ? tp.assignedManager : undefined,
      approvedAt: status === "APPROVED" ? daysAgo(1) : undefined,
      rejectedBy: status === "REJECTED" ? tp.assignedManager : undefined,
      rejectReason: status === "REJECTED" ? "Receipt not attached — resubmit with proof" : undefined,
      rejectedAt: status === "REJECTED" ? daysAgo(1) : undefined
    });
  }

  await reset(ExpenseClaimModel, { tenantSlug: TENANT }, docs, "ExpenseClaim");
}

// ─────────────────────────────────────────────────────────────────────────
// Generic engine for the 51 masters-registry tabs (src/masters/registry.ts)
// ─────────────────────────────────────────────────────────────────────────

// In-memory cache of what's already been generated for each master key, in
// seeding order, so later masters can resolve sourceMaster/sourceField
// cross-references without re-querying MongoDB.
const cache = new Map<string, Record<string, unknown>[]>();

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function genericValue(field: MasterField, i: number): unknown {
  if (field.computed) return undefined; // derived client-side — never stored

  if (field.sourceMaster && field.sourceField) {
    const source = cache.get(field.sourceMaster);
    if (source && source.length) {
      return source[i % source.length][field.sourceField] ?? `Sample ${field.label} ${i + 1}`;
    }
    // Dependency not seeded yet (e.g. a genuine cycle) — fall back to a
    // plausible plain value instead of leaving the field empty.
    return `${field.label} ${i + 1}`;
  }

  if (field.options && field.options.length) {
    if (field.key === "status" && (field.options.includes("Active") || field.options.includes("ACTIVE"))) {
      return i < 8 ? field.options[0] : field.options[1] ?? field.options[0];
    }
    return pick(field.options, i);
  }

  if (field.type === "date") return isoDate(i * 3);
  if (field.type === "number") {
    const key = field.key.toLowerCase();
    if (key.includes("percentage") || key.includes("achievement")) return 60 + i * 4;
    if (key.includes("amount") || key.includes("value") || key.includes("budget") || key.includes("limit")) return 500 + i * 250;
    if (key.includes("kms")) return 10 + i * 5;
    if (key.includes("rank")) return i + 1;
    if (key.includes("score")) return 70 + i * 3;
    // A "number" field literally named/keyed "year" (Holiday Calendar's
    // Year column, etc) needs an actual calendar year, not the generic
    // 1-based row index — otherwise every seeded row shows "1", "2", "3"...
    // instead of "2024", "2025", "2026".
    if (key === "year" || key.endsWith("year")) return 2023 + (i % 4);
    return i + 1;
  }

  const key = field.key.toLowerCase();
  if (key.includes("email")) return `demo.${key}${i + 1}@zivira-labs-demo.in`;
  if (key.includes("mobile") || key.includes("phone") || key.includes("whatsapp") || key.includes("contact")) return `9${(400000000 + i * 111111).toString().slice(0, 9)}`;
  if (key === "gst" || key.includes("gstno") || key.includes("gstnumber")) return BRANCHES[i % BRANCHES.length].gst;
  if (key.includes("pin")) return `${560000 + i * 111}`;
  if (key.includes("address")) return `${10 + i}, Demo Street, ${pick(TERRITORIES, i).city}`;
  if (key === "city") return pick(TERRITORIES, i).city;
  if (key === "state") return pick(TERRITORIES, i).state;
  if (key.includes("code")) return `${field.key.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "COD"}-${String(i + 1).padStart(3, "0")}`;
  if (key.includes("remarks") || key.includes("description") || key.includes("feedback") || key.includes("purpose") || key.includes("observation")) {
    return `${field.label} — demo record ${i + 1}`;
  }
  if (key.includes("name")) return `${field.label} ${i + 1}`;
  return `${field.label} ${i + 1}`;
}

async function seedMasterGeneric(config: MasterConfig) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < N; i++) {
    const doc: Record<string, unknown> = { tenantSlug: TENANT, status: "Active" };
    for (const field of config.fields) {
      const value = genericValue(field, i);
      if (value !== undefined) doc[field.key] = value;
    }
    rows.push(doc);
  }
  const Model = getMasterModel(config.key);
  await Model.deleteMany({ tenantSlug: TENANT });
  await Model.insertMany(rows);
  cache.set(config.key, rows);
  console.log(`  [OK] ${config.title} (${config.key}): ${rows.length} records`);
}

// Hand-crafted seeders for the masters that must match the legacy
// collections' canonical identities (Section 12's doctor/employee/product/
// stockist cross-references all trace back to these same 10 people).

async function seedIdentityMasters() {
  console.log("\n── Generic masters registry — identity-linked tabs ──");

  const divisionRows = DIVISIONS_3.concat(["Zivira", "Astra", "Aura", "Zivira", "Astra", "Aura", "Zivira"]).slice(0, N).map((name, i) => ({
    tenantSlug: TENANT, divisionCode: `DIV-${String(i + 1).padStart(2, "0")}`, divisionName: name,
    divisionShortName: name.slice(0, 3).toUpperCase(), description: `${name} sub-brand division`, status: "Active"
  }));
  cache.set("divisionMaster", divisionRows);
  await getMasterModel("divisionMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("divisionMaster").insertMany(divisionRows);
  console.log(`  [OK] Division Master (divisionMaster): ${divisionRows.length} records`);

  // employees — SAME MongoDB collection as the legacy EmployeeModel (both
  // resolve to the "employees" collection), so this simply re-affirms the
  // canonical 10 employees already written by seedLegacyModels().
  const employeeRows = EMPLOYEES.map((e) => ({
    tenantSlug: TENANT, employeeCode: e.code, name: e.name, designation: e.designation,
    division: e.division, territory: TERRITORIES[e.territoryIdx].hq, role: e.role,
    dob: daysAgo(11000), email: `${e.code.toLowerCase()}@ziviralabs.com`,
    phone: `9${(600000000 + e.territoryIdx * 333333).toString().slice(0, 9)}`, joinDate: daysAgo(365),
    city: TERRITORIES[e.territoryIdx].city, state: TERRITORIES[e.territoryIdx].state, country: "India",
    reportingManager: e.manager ?? "", status: "Active"
  }));
  cache.set("employees", employeeRows);
  console.log(`  [--] employees: reusing the ${employeeRows.length} records already written to the shared "employees" collection`);

  const regionRows = TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, zoneName: t.zone, regionName: t.region, regionCode: `RG-${String(i + 1).padStart(2, "0")}`,
    state: t.state, division: DIVISIONS_3[i % 3], manager: pick(EMPLOYEES.filter((e) => e.role === "ABM" || e.role === "RBM"), i).name, status: "Active"
  }));
  cache.set("regionZoneMaster", regionRows);
  await getMasterModel("regionZoneMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("regionZoneMaster").insertMany(regionRows);
  console.log(`  [OK] Region/Zone Master: ${regionRows.length} records`);

  const territoryRows = TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, hqCode: t.code, headquartersName: t.hq, division: DIVISIONS_3[i % 3], state: t.state, city: t.city,
    metroNonMetro: i % 2 === 0 ? "Metro" : "Non-Metro", zone: t.zone, region: t.region, patchName: `${t.city} Patch`, status: "Active"
  }));
  cache.set("territoryHqMaster", territoryRows);
  await getMasterModel("territoryHqMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("territoryHqMaster").insertMany(territoryRows);
  console.log(`  [OK] Territory/HQ Master: ${territoryRows.length} records`);

  // Not its own admin tab (see registry.ts comment) — exists purely so the
  // Sales tab's Area field (Zivira_Master_Tab_Client_Change_3B.docx §9) is
  // a real live dropdown instead of free text.
  const areaRows = TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, areaCode: `AR-${String(i + 1).padStart(2, "0")}`, areaName: `${t.city} Area`, hq: t.hq, status: "Active"
  }));
  cache.set("areaMaster", areaRows);
  await getMasterModel("areaMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("areaMaster").insertMany(areaRows);
  console.log(`  [OK] Area Master: ${areaRows.length} records`);

  const therapyRows = THERAPIES.map((name, i) => ({
    tenantSlug: TENANT, therapyCode: `TH-${String(i + 1).padStart(2, "0")}`, therapyName: name, description: `${name} therapy area`, status: "Active"
  }));
  cache.set("therapyMaster", therapyRows);
  await getMasterModel("therapyMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("therapyMaster").insertMany(therapyRows);
  console.log(`  [OK] Therapy Master: ${therapyRows.length} records`);

  const moleculeRows = MOLECULES.map((name, i) => ({
    tenantSlug: TENANT, moleculeCode: `MOL-${String(i + 1).padStart(2, "0")}`, moleculeName: name, therapy: THERAPIES[i], description: `${name} molecule`, status: "Active"
  }));
  cache.set("moleculeMaster", moleculeRows);
  await getMasterModel("moleculeMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("moleculeMaster").insertMany(moleculeRows);
  console.log(`  [OK] Molecule Master: ${moleculeRows.length} records`);

  const brandRows = PRODUCTS.map((p, i) => ({
    tenantSlug: TENANT, brandCode: `BR-${String(i + 1).padStart(2, "0")}`, brandName: p.brand, molecule: p.molecule, therapy: p.therapy, division: p.division, status: "Active"
  }));
  cache.set("brandMaster", brandRows);
  await getMasterModel("brandMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("brandMaster").insertMany(brandRows);
  console.log(`  [OK] Brand Master: ${brandRows.length} records`);

  const productRows = PRODUCTS.map((p, i) => ({
    tenantSlug: TENANT, productCode: p.code, productName: p.name, brand: p.brand, strength: `${[10, 5, 3, 2, 1, 20, 15, 8, 4, 6][i]}mg`,
    pack: `1x${5 + i}`, sku: `SKU-${p.code}`, division: p.division, uom: p.uom, status: "Active"
  }));
  cache.set("productMaster", productRows);
  await getMasterModel("productMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("productMaster").insertMany(productRows);
  console.log(`  [OK] Product Master: ${productRows.length} records`);

  const rateRows = PRODUCTS.map((p, i) => ({
    tenantSlug: TENANT, product: p.name, batchNo: `BATCH-${p.code}`, manufacturingDate: daysAgo(180 + i * 10),
    expiryDate: daysAgo(-540 - i * 10), pack: `1x${5 + i}`, ptr: 80 + i * 5, pts: 85 + i * 5, mrp: 110 + i * 8, effectiveDate: daysAgo(30), status: "Active"
  }));
  cache.set("rateMaster", rateRows);
  await getMasterModel("rateMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("rateMaster").insertMany(rateRows);
  console.log(`  [OK] Rate Master: ${rateRows.length} records`);

  const doctorMasterRows = DOCTORS.map((d) => ({
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, qualification: d.qualification, specialty: d.specialty, registrationNumber: `REG-${d.code}`,
    clinicName: `${d.name.replace("Dr. ", "")} Clinic`, address: `${TERRITORIES[d.territoryIdx].city} Medical Complex`, area: "Central Area",
    city: TERRITORIES[d.territoryIdx].city, state: TERRITORIES[d.territoryIdx].state, country: "India", pinCode: `${560000 + d.territoryIdx * 111}`,
    mobile: d.phone, phone: d.phone, email: d.email, whatsapp: d.phone, status: "Active"
  }));
  cache.set("doctorMaster", doctorMasterRows);
  await getMasterModel("doctorMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorMaster").insertMany(doctorMasterRows);
  console.log(`  [OK] Doctor Master: ${doctorMasterRows.length} records`);

  const doctorAddressRows = DOCTORS.map((d) => ({
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, clinicName: `${d.name.replace("Dr. ", "")} Clinic`,
    address: `${TERRITORIES[d.territoryIdx].city} Medical Complex`, area: "Central Area", city: TERRITORIES[d.territoryIdx].city,
    state: TERRITORIES[d.territoryIdx].state, country: "India", pinCode: `${560000 + d.territoryIdx * 111}`
  }));
  await getMasterModel("doctorAddress").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorAddress").insertMany(doctorAddressRows);
  cache.set("doctorAddress", doctorAddressRows);
  console.log(`  [OK] Doctor — Address: ${doctorAddressRows.length} records`);

  const doctorClassificationRows = DOCTORS.map((d, i) => ({
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, doctorCategory: d.category,
    potential: ["High", "Medium", "Low"][i % 3], visitFrequency: pick(["Weekly", "Fortnightly", "Monthly"], i), active: "Active"
  }));
  await getMasterModel("doctorClassification").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorClassification").insertMany(doctorClassificationRows);
  console.log(`  [OK] Doctor — Classification: ${doctorClassificationRows.length} records`);

  const doctorMappingRows = DOCTORS.map((d) => ({
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, division: PRODUCTS[DOCTORS.indexOf(d) % PRODUCTS.length].division,
    hq: TERRITORIES[d.territoryIdx].hq, patch: `${TERRITORIES[d.territoryIdx].city} Patch`,
    medicalRepresentative: d.mappedEmployeeName, areaManager: EMPLOYEES.find((e) => e.role === "ABM")?.name ?? EMPLOYEES[2].name, status: "Active"
  }));
  await getMasterModel("doctorMapping").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorMapping").insertMany(doctorMappingRows);
  console.log(`  [OK] Doctor — Mapping: ${doctorMappingRows.length} records`);

  const doctorDealerMappingRows = DOCTORS.map((d, i) => ({
    // Zivira_Master_Client_Change_Requirement_3A.docx — "chemist" now
    // matches an actual record in the "dealers" collection (see the
    // DealerModel reset above, dealerName: STOCKISTS[i].name) instead of a
    // freestanding "<city> Chemist" string nothing else pointed to.
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, stockist: STOCKISTS[i % STOCKISTS.length].name,
    chemist: STOCKISTS[i % STOCKISTS.length].name, distributor: STOCKISTS[i % STOCKISTS.length].name
  }));
  await getMasterModel("doctorDealerMapping").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorDealerMapping").insertMany(doctorDealerMappingRows);
  console.log(`  [OK] Doctor — Dealer Mapping: ${doctorDealerMappingRows.length} records`);

  const doctorContactRows = DOCTORS.map((d) => ({
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, mobile: d.phone, phone: d.phone, email: d.email, whatsapp: d.phone
  }));
  await getMasterModel("doctorContactDetails").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorContactDetails").insertMany(doctorContactRows);
  console.log(`  [OK] Doctor — Contact Details: ${doctorContactRows.length} records`);

  const doctorAdditionalRows = DOCTORS.map((d, i) => ({
    tenantSlug: TENANT, doctorCode: d.code, doctorName: d.name, birthDate: daysAgo(15000 + i * 100),
    anniversary: daysAgo(3000 + i * 50), remarks: "Standard demo record", latitude: 12.9 + i * 0.1, longitude: 77.5 + i * 0.1, status: "Active"
  }));
  await getMasterModel("doctorAdditionalInfo").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("doctorAdditionalInfo").insertMany(doctorAdditionalRows);
  console.log(`  [OK] Doctor — Additional Info: ${doctorAdditionalRows.length} records`);

  const patchRows = TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, patchCode: `PATCH-${String(i + 1).padStart(2, "0")}`, patchName: `${t.city} Patch`,
    hq: t.hq, region: t.region, division: DIVISIONS_3[i % 3],
    medicalRepresentative: pick(EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR"), i).name,
    areaManager: pick(EMPLOYEES.filter((e) => e.role === "ABM"), i).name,
    noOfDoctors: DOCTORS.filter((d) => d.territoryIdx === i).length, status: "Active"
  }));
  cache.set("patchNameMaster", patchRows);
  await getMasterModel("patchNameMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("patchNameMaster").insertMany(patchRows);
  console.log(`  [OK] Patch Name Master: ${patchRows.length} records`);

  const stockistMasterRows = STOCKISTS.map((s, i) => ({
    tenantSlug: TENANT, stockistCode: s.code, stockistName: s.name, gstNo: s.gst, licenseNo: `LIC-${s.code}`,
    contactNumber: s.phone, emailAddress: `${s.code.toLowerCase()}@stockist-demo.in`, territory: `${s.city} Patch`, hq: s.hq,
    state: s.state, pinCode: `${560000 + i * 111}`, location: s.city, city: s.city, pincode: `${560000 + i * 111}`, status: "Active"
  }));
  cache.set("stockistMaster", stockistMasterRows);
  await getMasterModel("stockistMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistMaster").insertMany(stockistMasterRows);
  console.log(`  [OK] Stockist Master: ${stockistMasterRows.length} records`);

  const stockistAddressRows = STOCKISTS.map((s) => ({ tenantSlug: TENANT, stockistCode: s.code, address: s.address, city: s.city, state: s.state, pin: `${560000 + STOCKISTS.indexOf(s) * 111}`, status: "Active" }));
  await getMasterModel("stockistAddress").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistAddress").insertMany(stockistAddressRows);
  console.log(`  [OK] Stockist — Address: ${stockistAddressRows.length} records`);

  const stockistContactRows = STOCKISTS.map((s, i) => ({ tenantSlug: TENANT, stockistCode: s.code, contactPerson: `Contact Person ${i + 1}`, mobile: s.phone, email: `${s.code.toLowerCase()}@stockist-demo.in`, status: "Active" }));
  await getMasterModel("stockistContact").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistContact").insertMany(stockistContactRows);
  console.log(`  [OK] Stockist — Contact: ${stockistContactRows.length} records`);

  const stockistHqRows = STOCKISTS.map((s) => ({ tenantSlug: TENANT, stockistCode: s.code, hq: s.hq, territory: `${s.city} Patch`, status: "Active" }));
  await getMasterModel("stockistHeadquarters").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistHeadquarters").insertMany(stockistHqRows);
  console.log(`  [OK] Stockist — Headquarters: ${stockistHqRows.length} records`);

  const stockistDivisionRows = STOCKISTS.map((s, i) => ({ tenantSlug: TENANT, stockistCode: s.code, division: DIVISIONS_3[i % 3], products: PRODUCTS.filter((p) => p.division === DIVISIONS_3[i % 3]).map((p) => p.name).join(", "), status: "Active" }));
  await getMasterModel("stockistDivisionMapping").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistDivisionMapping").insertMany(stockistDivisionRows);
  console.log(`  [OK] Stockist — Division Mapping: ${stockistDivisionRows.length} records`);

  const stockistBankRows = STOCKISTS.map((s, i) => ({ tenantSlug: TENANT, stockistCode: s.code, bank: pick(["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"], i), accountNo: `${100000000000 + i * 11111}`, ifsc: `${pick(["HDFC", "ICIC", "SBIN", "UTIB", "KKBK"], i)}0${String(i).padStart(6, "0")}`, status: "Active" }));
  await getMasterModel("stockistBankDetails").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistBankDetails").insertMany(stockistBankRows);
  console.log(`  [OK] Stockist — Bank Details: ${stockistBankRows.length} records`);

  const stockistLicenseRows = STOCKISTS.map((s, i) => ({ tenantSlug: TENANT, stockistCode: s.code, drugLicense: `DL-${s.code}`, expiryDate: daysAgo(-365 - i * 20), status: "Active" }));
  await getMasterModel("stockistLicenseDetails").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistLicenseDetails").insertMany(stockistLicenseRows);
  console.log(`  [OK] Stockist — License Details: ${stockistLicenseRows.length} records`);

  const stockistStatusRows = STOCKISTS.map((s, i) => ({ tenantSlug: TENANT, stockist: s.name, status: i < 8 ? "Active" : "Inactive" }));
  await getMasterModel("stockistStatus").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("stockistStatus").insertMany(stockistStatusRows);
  console.log(`  [OK] Stockist — Status: ${stockistStatusRows.length} records`);

  const inputRows = GIFT_ITEM_TYPES.map((name, i) => ({
    tenantSlug: TENANT, inputCode: `INP-${String(i + 1).padStart(2, "0")}`, inputName: name, category: pick(["Gift Item", "Literature", "Sample Bag", "Stationery"], i), unit: pick(["Nos", "Box", "Roll"], i),
    typeOfInput: pick(["Physical", "Digital", "Financial"], i), division: DIVISIONS_3[i % 3], valueOfInput: `${50 + i * 25}`,
    fromDate: daysAgo(180), toDate: daysAgo(-185), financialYear: "2025-26", status: "Active"
  }));
  cache.set("inputMaster", inputRows);
  await getMasterModel("inputMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("inputMaster").insertMany(inputRows);
  console.log(`  [OK] Input Master: ${inputRows.length} records`);

  const expenseTypeRows = ["Travel", "Lodging", "Conveyance", "Food", "Stationery", "Courier", "Mobile", "Internet", "Printing", "Miscellaneous"].map((t) => ({ tenantSlug: TENANT, expenseType: t, description: `${t} expense`, status: "Active" }));
  cache.set("expenseTypes", expenseTypeRows);
  await getMasterModel("expenseTypes").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("expenseTypes").insertMany(expenseTypeRows);
  console.log(`  [OK] Expense Types: ${expenseTypeRows.length} records`);
}

// Reporting Structure (division's BH/ZBM/RBM/ABM/BE chain) + the 4 Sales
// masters (Target/Primary/Secondary/Claims) — cross-linked to the same
// division/zone/region/hq/product identities as everything else, instead of
// the generic placeholder text seedMasterGeneric() would produce.
async function seedSalesAndReportingMasters() {
  console.log("\n── Generic masters registry — Reporting Structure & Sales tabs ──");

  // BH is a single company-wide role (there's only one NBH in the demo
  // roster, which is realistic), but ZBM/RBM/ABM/BE genuinely vary by
  // territory — cycling through the actual employees in each role instead
  // of pinning every row to the same one or two names.
  const bhName = EMPLOYEES.find((e) => e.role === "NBH")?.name ?? EMPLOYEES[0].name;
  const rbms = EMPLOYEES.filter((e) => e.role === "RBM").length ? EMPLOYEES.filter((e) => e.role === "RBM") : EMPLOYEES;
  const abms = EMPLOYEES.filter((e) => e.role === "ABM").length ? EMPLOYEES.filter((e) => e.role === "ABM") : EMPLOYEES;
  const fieldStaff = EMPLOYEES.filter((e) => e.role === "MR" || e.role === "SR_MR");
  const reportingRows = TERRITORIES.map((t, i) => ({
    tenantSlug: TENANT, division: DIVISIONS_3[i % 3], zone: t.zone,
    bh: bhName,
    zbm: pick(rbms, i).name,
    rbm: pick(rbms, i + 1).name,
    abm: pick(abms, i).name,
    be: pick(fieldStaff, i).name,
    status: "Active"
  }));
  await getMasterModel("reportingStructure").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("reportingStructure").insertMany(reportingRows);
  console.log(`  [OK] Reporting Structure: ${reportingRows.length} records`);

  const months = ["April 2026", "May 2026", "June 2026", "July 2026", "August 2026", "September 2026", "October 2026", "November 2026", "December 2026", "January 2027"];
  function salesRows(mkValue: (i: number) => Record<string, unknown>) {
    return TERRITORIES.map((t, i) => {
      const p = PRODUCTS[i];
      return {
        tenantSlug: TENANT, division: p.division, zone: t.zone, region: t.region, area: `${t.city} Area`, hq: t.hq,
        product: p.name, month: months[i], status: "Active", ...mkValue(i)
      };
    });
  }

  // Zivira_Master_Tab_Client_Change_3B.docx field names — Target Unit x Unit
  // Price = Target Value, and Sales - Return = Net Sale (mirrors the same
  // calculation masters.routes.ts now applies server-side on every save).
  const targetRows = salesRows((i) => {
    const targetUnit = 500 + i * 50;
    const unitPrice = 110 + i * 8;
    return { targetUnit, unitPrice, targetValue: targetUnit * unitPrice };
  });
  await getMasterModel("targetMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("targetMaster").insertMany(targetRows);
  console.log(`  [OK] Target Master: ${targetRows.length} records`);

  const primaryRows = salesRows((i) => {
    const unitPrice = 110 + i * 8;
    const salesUnit = 500 + i * 40, freeUnit = 10 + i * 5, returnUnit = 5 + i * 2;
    return {
      stockist: STOCKISTS[i % STOCKISTS.length].name,
      salesUnit, salesValue: salesUnit * unitPrice,
      freeUnit, freeValue: freeUnit * unitPrice,
      returnUnit, returnValue: returnUnit * unitPrice,
      netSaleUnit: salesUnit - returnUnit, netSaleValue: (salesUnit - returnUnit) * unitPrice
    };
  });
  await getMasterModel("primarySales").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("primarySales").insertMany(primaryRows);
  console.log(`  [OK] Primary Sales: ${primaryRows.length} records`);

  // Secondary Sales = Stockist -> Chemist. The "chemist" value matches the
  // real dealers/Chemist Master record (dealerName === STOCKISTS[i].name,
  // same identity the DealerModel reset above and Dealer — Dealer Mapping
  // seeding use) so the dropdown and the seeded value agree.
  const secondaryRows = salesRows((i) => {
    const unitPrice = 110 + i * 8;
    const salesUnit = 440 + i * 35, freeUnit = 8 + i * 4, returnUnit = 4 + i * 2;
    return {
      stockist: STOCKISTS[i % STOCKISTS.length].name,
      chemist: STOCKISTS[i % STOCKISTS.length].name,
      salesUnit, salesValue: salesUnit * unitPrice,
      freeUnit, freeValue: freeUnit * unitPrice,
      returnUnit, returnValue: returnUnit * unitPrice,
      netSaleUnit: salesUnit - returnUnit, netSaleValue: (salesUnit - returnUnit) * unitPrice
    };
  });
  await getMasterModel("secondarySales").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("secondarySales").insertMany(secondaryRows);
  console.log(`  [OK] Secondary Sales: ${secondaryRows.length} records`);

  const claimsRows = TERRITORIES.map((t, i) => {
    const p = PRODUCTS[i];
    return {
      tenantSlug: TENANT, division: p.division, zone: t.zone, region: t.region, area: `${t.city} Area`, hq: t.hq,
      product: p.name, stockist: STOCKISTS[i % STOCKISTS.length].name, claimDate: daysAgo(20 + i * 5),
      claimType: ["Scheme", "Damage", "Expiry", "Rate Difference", "Other"][i % 5],
      claimQuantity: 20 + i * 4, claimValue: 5000 + i * 750,
      claimStatus: ["Approved", "Pending", "Rejected"][i % 3], remarks: `Claim record ${i + 1}`, status: "Active"
    };
  });
  await getMasterModel("claimsMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("claimsMaster").insertMany(claimsRows);
  console.log(`  [OK] Claims Master: ${claimsRows.length} records`);

  // IMS — the transcript confirms only that this is the fifth Sales button;
  // its field list is explicitly left undefined, so it gets the same
  // organizational/product/month hierarchy every other Sales button shares.
  const imsRows = salesRows(() => ({}));
  await getMasterModel("imsMaster").deleteMany({ tenantSlug: TENANT });
  await getMasterModel("imsMaster").insertMany(imsRows);
  console.log(`  [OK] IMS: ${imsRows.length} records`);
}

// The remaining ~30 masters (attendance/holiday/expense-setup/daily-MR-work
// entries/manager-activity reports) are generated fully generically — every
// sourceMaster reference in them resolves against the identity masters
// seeded above.
const GENERIC_REMAINING_KEYS = [
  "sfc", "allowanceFixation", "expenseCategory", "managerTravelApproval", "expenseApproval",
  "employeePersonalInfo", "expenseReports", "personalInformationView",
  "attendance", "holidayStateMaster", "holidayCalendar",
  "dcrEntry", "tourPlanEntry", "expenseEntry", "leaveEntry", "campEntry", "marketSurveyEntry",
  "attendanceReport", "dcrSummaryReport", "tourPlanReport", "expenseReport", "leaveReport",
  "campReport", "marketSurveyReport", "doctorCoverageReport", "chemistCoverageReport", "productivityDashboard"
];

async function seedRemainingGenericMasters() {
  console.log("\n── Generic masters registry — remaining tabs (Expense Setup / Daily MR Work / Manager Activity Report) ──");
  for (const key of GENERIC_REMAINING_KEYS) {
    const config = MASTERS.find((m) => m.key === key);
    if (!config) { console.warn(`  [!!] Registry key not found: ${key}`); continue; }
    await seedMasterGeneric(config);
  }
}

async function verifyAllMastersHaveExactly10() {
  console.log("\n── Verification ──");
  let allGood = true;
  for (const config of MASTERS) {
    const count = await getMasterModel(config.key).countDocuments({ tenantSlug: TENANT });
    if (count !== N) { allGood = false; console.warn(`  [MISMATCH] ${config.key}: ${count} (expected ${N})`); }
  }
  console.log(allGood ? "  All 51 masters-registry tabs confirmed at exactly 10 records." : "  Some tabs did not reach exactly 10 — see warnings above.");
}

async function ensureDemoLoginsExist() {
  // Doesn't touch existing users beyond making sure the 10 canonical
  // employees above are reachable via the existing login pattern already
  // used elsewhere in this repo (seed.ts / seed.routes.ts): username =
  // lowercased employee code, password = 'ziviramumbai'.
  const passwordHash = await bcrypt.hash("ziviramumbai", 12);
  for (const e of EMPLOYEES) {
    const portal = e.role === "MR" || e.role === "SR_MR" ? "FIELD_FORCE" : "FIELD_FORCE"; // managers keep portal=FIELD_FORCE — see PRD 8.1
    await UserModel.updateOne(
      { username: e.code.toLowerCase() },
      { username: e.code.toLowerCase(), passwordHash, displayName: e.name, role: e.role, portal, tenantSlug: TENANT, active: true },
      { upsert: true }
    );
  }
  console.log(`\n── Login accounts ensured for all ${EMPLOYEES.length} employees (username: employee code lowercased, password: ziviramumbai) ──`);
}

// Exported so src/routes/seed.routes.ts can trigger the exact same logic
// over HTTP (Render free tier has no shell access — PRD Section 5.4 /
// Section 18 "Seed script must always be run locally... no shell access on
// Render free tier"). connectMongo() is idempotent (mongoose no-ops a
// second connect call against an already-open connection), so this is safe
// to call from a running server process too.
export async function runExactTenSeed() {
  await connectMongo();
  console.log(`Connected. Resetting every master dataset for tenant "${TENANT}" to exactly ${N} records each...`);

  await seedLegacyModels();
  const tourPlanDocs = await seedTourPlans();
  await seedExpenseClaims(tourPlanDocs);
  await seedIdentityMasters();
  await seedSalesAndReportingMasters();
  await seedRemainingGenericMasters();
  await ensureDemoLoginsExist();
  await verifyAllMastersHaveExactly10();

  console.log("\nDone.");
}

// No CLI entry point here — this file lives under src/ so it compiles into
// dist/ alongside the rest of the server (tsconfig rootDir is "src"). The
// runnable CLI wrapper is scripts/seed-exact-10.ts, which imports
// runExactTenSeed from here; src/routes/seed.routes.ts imports it directly
// for the HTTP-triggered path.
