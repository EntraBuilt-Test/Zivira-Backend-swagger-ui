import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import * as XLSX from "xlsx";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { getMasterConfig } from "../masters/registry.js";
import { getMasterModel } from "../models/master-record.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { StockistModel } from "../models/stockist.model.js";
import { ProductModel } from "../models/product.model.js";
import { HolidayModel } from "../models/holiday.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { audit } from "../utils/audit.js";

// ONE shared Excel/CSV upload implementation reused across every "Upload
// Tool" Options screen, instead of ~13 bespoke importers. xlsx parses both
// .xlsx and .csv from the same in-memory buffer. Each upload's masterKey
// decides where the parsed rows land: a real target collection when one
// exists and is safe to bulk-upsert into (see REAL_TARGETS below), or
// log-only (just the summary row on the upload-log master) when there's no
// real model to sensibly map onto.

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const uploadsRouter = Router();

function normalizeHeader(h: string) {
  return String(h).trim().toLowerCase().replace(/[\s_.-]+/g, "");
}

function parseWorkbookRows(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeHeader(k)] = typeof v === "string" ? v.trim() : v;
    }
    return normalized;
  });
}

function pick(row: Record<string, unknown>, ...aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const v = row[normalizeHeader(alias)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

type UploadResult = { processed: number; failed: number; errors: string[] };

async function importDoctors(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const name = pick(row, "doctorname", "name");
      if (!name) { errors.push(`Row ${i + 2}: missing Doctor Name`); continue; }
      const doctorCode = pick(row, "doctorcode", "code");
      const territory = pick(row, "territory", "hq", "city") || "Unassigned";
      const cat = pick(row, "category");
      const filter = doctorCode ? { tenantSlug, doctorCode } : { tenantSlug, name, territory };
      await DoctorModel.findOneAndUpdate(
        filter,
        {
          $set: {
            tenantSlug,
            ...(doctorCode ? { doctorCode } : {}),
            name,
            specialty: pick(row, "specialty", "speciality") || "General Physician",
            category: ["A", "B", "C"].includes(cat ?? "") ? cat : "C",
            state: pick(row, "state") || territory,
            city: pick(row, "city") || territory,
            territory,
            qualification: pick(row, "qualification") ?? null,
            phone: pick(row, "phone", "mobile") ?? null,
            status: "ACTIVE"
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

async function importChemists(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const dealerName = pick(row, "dealername", "chemistname", "name");
      if (!dealerName) { errors.push(`Row ${i + 2}: missing Chemist/Dealer Name`); continue; }
      const city = pick(row, "city") ?? undefined;
      await DealerModel.findOneAndUpdate(
        { tenantSlug, dealerName, city: city ?? null },
        {
          $set: {
            tenantSlug,
            dealerName,
            employeeName: pick(row, "employeename", "fieldforcename") ?? null,
            employeeCode: pick(row, "employeecode", "empcode") ?? null,
            patchName: pick(row, "patchname", "patch") ?? null,
            contactPersonName: pick(row, "contactperson", "contactpersonname") ?? null,
            dealerPhone: pick(row, "phone", "dealerphone", "mobile") ?? null,
            dealerEmail: pick(row, "email", "dealeremail") ?? null,
            country: pick(row, "country") ?? null,
            state: pick(row, "state") ?? null,
            city: city ?? null,
            location: pick(row, "location") ?? null,
            pincode: pick(row, "pincode") ?? null,
            address: pick(row, "address") ?? null,
            status: "ACTIVE"
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

async function importStockists(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const name = pick(row, "name", "stockistname");
      const state = pick(row, "state");
      const hqName = pick(row, "hqname", "hq");
      const address = pick(row, "address");
      if (!name || !state || !hqName || !address) {
        errors.push(`Row ${i + 2}: missing required field (Name/State/HQ Name/Address)`);
        continue;
      }
      const erpCode = pick(row, "erpcode", "code");
      await StockistModel.findOneAndUpdate(
        erpCode ? { tenantSlug, erpCode } : { tenantSlug, name, hqName },
        {
          $set: {
            tenantSlug,
            name,
            ...(erpCode ? { erpCode } : {}),
            state,
            hqName,
            address,
            phone: pick(row, "phone", "mobile") ?? null,
            fieldForceName: pick(row, "fieldforcename", "employeename") ?? null,
            status: "ACTIVE"
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

async function importProducts(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const productName = pick(row, "productname", "name");
      const category = pick(row, "category");
      if (!productName || !category) { errors.push(`Row ${i + 2}: missing Product Name/Category`); continue; }
      const brandName = pick(row, "brandname", "brand") ?? undefined;
      const subDivision = pick(row, "subdivision") ?? undefined;
      await ProductModel.findOneAndUpdate(
        { tenantSlug, productName, brandName: brandName ?? null },
        {
          $set: {
            tenantSlug,
            name: productName,
            productName,
            brandName: brandName ?? null,
            category,
            division: pick(row, "division") ?? "",
            ...(subDivision ? { subDivision } : {}),
            group: pick(row, "group") ?? null,
            saleUnit: pick(row, "saleunit", "unit") ?? null,
            description: pick(row, "description") ?? null,
            status: "ACTIVE"
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

// salesforceUploadLog -> real EmployeeModel upsert. Deliberately careful:
// this NEVER touches UserModel/passwordHash, so bulk-uploading a
// salesforce sheet can never overwrite an existing employee's login
// credentials — it only updates the Employee Master profile fields.
async function importSalesforce(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const employeeCode = pick(row, "employeecode", "empcode", "code");
      const name = pick(row, "name", "employeename");
      const designation = pick(row, "designation");
      const division = pick(row, "division");
      const territory = pick(row, "territory", "hq");
      if (!employeeCode || !name || !designation || !division || !territory) {
        errors.push(`Row ${i + 2}: missing required field (Emp Code/Name/Designation/Division/Territory)`);
        continue;
      }
      const roleRaw = (pick(row, "role") ?? "MR").toUpperCase();
      const role = ["NBH", "BH", "RBM", "ZBM", "ABM", "SR_MR", "MR", "OTHER"].includes(roleRaw) ? roleRaw : "OTHER";
      await EmployeeModel.findOneAndUpdate(
        { tenantSlug, employeeCode },
        {
          $set: {
            tenantSlug,
            employeeCode,
            name,
            designation,
            division,
            territory,
            role,
            reportingManager: pick(row, "reportingmanager") ?? null,
            email: pick(row, "email") ?? null,
            phone: pick(row, "phone", "mobile") ?? null,
            city: pick(row, "city") ?? null,
            state: pick(row, "state") ?? null
          },
          $setOnInsert: { status: "ACTIVE" }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

async function importHolidays(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const stateName = pick(row, "statename", "state");
      if (!stateName) { errors.push(`Row ${i + 2}: missing State Name`); continue; }
      const dateStr = pick(row, "otherholidaydate", "date");
      await HolidayModel.create({
        tenantSlug,
        stateName,
        weekendHoliday: pick(row, "weekendholiday") ?? null,
        otherHolidayDate: dateStr ? new Date(dateStr) : null,
        otherHolidayDescription: pick(row, "otherholidaydescription", "description") ?? null,
        status: "ACTIVE"
      });
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

async function importLeaves(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      const employeeCode = pick(row, "employeecode", "empcode");
      const leaveType = pick(row, "leavetype");
      const fromDateStr = pick(row, "fromdate");
      const toDateStr = pick(row, "todate");
      if (!employeeCode || !leaveType || !fromDateStr || !toDateStr) {
        errors.push(`Row ${i + 2}: missing required field (Emp Code/Leave Type/From Date/To Date)`);
        continue;
      }
      const fromDate = new Date(fromDateStr);
      const toDate = new Date(toDateStr);
      const daysStr = pick(row, "days");
      const days = daysStr ? Number(daysStr) : Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
      await LeaveApplicationModel.create({
        tenantSlug,
        employeeCode,
        leaveType,
        fromDate,
        toDate,
        days,
        reason: pick(row, "reason") ?? "Bulk uploaded by Admin",
        isLWP: leaveType.toUpperCase() === "LOP",
        status: "APPROVED",
        approvedBy: "ADMIN_BULK_UPLOAD",
        approvedAt: new Date()
      });
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

async function importTargets(tenantSlug: string, rows: Record<string, unknown>[]): Promise<UploadResult> {
  let processed = 0;
  const errors: string[] = [];
  const TargetModel = getMasterModel("targetMaster");
  for (const [i, row] of rows.entries()) {
    try {
      const targetUnit = Number(pick(row, "targetunit") ?? 0);
      const unitPrice = Number(pick(row, "unitprice") ?? 0);
      const fieldForceName = pick(row, "fieldforcename", "employeename") ?? null;
      const product = pick(row, "product", "productname") ?? null;
      if (!fieldForceName || !product) { errors.push(`Row ${i + 2}: missing Field Force Name/Product`); continue; }
      await TargetModel.create({
        tenantSlug,
        status: "Active",
        division: pick(row, "division") ?? null,
        hq: pick(row, "hq") ?? null,
        fieldForceName,
        product,
        month: pick(row, "month") ?? null,
        year: pick(row, "year") ?? null,
        targetUnit,
        unitPrice,
        targetValue: targetUnit * unitPrice
      });
      processed++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { processed, failed: rows.length - processed, errors };
}

const REAL_TARGETS: Record<string, (tenantSlug: string, rows: Record<string, unknown>[]) => Promise<UploadResult>> = {
  listedDoctorUploadLog: importDoctors,
  chemistUploadLog: importChemists,
  stockistUploadLog: importStockists,
  productUploadLog: importProducts,
  salesforceUploadLog: importSalesforce,
  holidayFixationUploadLog: importHolidays,
  leaveBulkUploadLog: importLeaves,
  targetUploadLog: importTargets
};

// Masters whose upload log rows keep the raw uploaded file itself (as
// base64) so the sanpharma-style "Download" link in the resulting table
// can hand back the exact original file, and whose model has a
// tenant-scoped "deactivate existing before import" bulk-update available.
const FILE_STORING_UPLOAD_KEYS = new Set(["fileUploadDesignationwise", "userManualUpload"]);

const DEACTIVATABLE_MODELS: Record<string, mongoose.Model<any>> = {
  listedDoctorUploadLog: DoctorModel,
  chemistUploadLog: DealerModel
};


// Every other "Upload Tool" master has no obvious safe real target
// collection — accepted here as log-only: the file is received, its
// metadata is stored on the upload-log master, but no fabricated data
// model is invented just to look busy.
const LOG_ONLY_UPLOAD_KEYS = new Set([
  "sampleDespatchUploadLog",
  "inputDespatchUploadLog",
  "productRateUploadLog",
  "slideUploadEDetailing",
  "homepageImageUpload",
  "homepageImageFieldForcewise",
  "fileUploadDesignationwise",
  "userManualUpload",
  "transactionUpload"
]);

// POST /masters/:key/action/upload — multipart file upload for any
// upload-log master. `file` field carries the .xlsx/.xls/.csv.
uploadsRouter.post(
  "/:key/action/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const config = getMasterConfig(req.params.key);
    if (!config) throw new HttpError(404, `Unknown master: ${req.params.key}`);
    const tenantSlug = req.auth!.tenantSlug!;

    if (!req.file) throw new HttpError(400, "No file uploaded (expected multipart field \"file\")");

    const fileName = req.file.originalname;
    const LogModel = getMasterModel(config.key);
    const extraFields: Record<string, unknown> = {};
    for (const f of config.fields) {
      if (f.key === "fileName" || f.key === "uploadedOn" || f.key === "status" || f.key === "recordsProcessed") continue;
      if (typeof req.body[f.key] === "string" && req.body[f.key].trim()) extraFields[f.key] = req.body[f.key].trim();
    }

    if (FILE_STORING_UPLOAD_KEYS.has(config.key)) {
      extraFields.fileData = req.file.buffer.toString("base64");
      extraFields.mimeType = req.file.mimetype || "application/octet-stream";
    }

    if (String(req.body.deactivateExisting).toLowerCase() === "true") {
      const DeactivateModel = DEACTIVATABLE_MODELS[config.key];
      if (DeactivateModel) {
        await DeactivateModel.updateMany({ tenantSlug, status: "ACTIVE" }, { $set: { status: "INACTIVE" } });
      }
    }

    let rows: Record<string, unknown>[] = [];
    let parseError: string | null = null;
    try {
      rows = parseWorkbookRows(req.file.buffer);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    if (parseError) {
      const failedRow = await LogModel.create({
        tenantSlug,
        status: config.fields.find((f) => f.key === "status")?.options?.includes("Failed") ? "Failed" : "Active",
        fileName,
        uploadedOn: new Date(),
        recordsProcessed: 0,
        ...extraFields
      });
      await audit(`UPLOAD_${config.key.toUpperCase()}_FAILED`, config.key, String(failedRow._id), { tenantSlug, fileName, error: parseError });
      res.status(400).json({ data: { success: false, recordsProcessed: 0, error: `Could not parse file: ${parseError}` } });
      return;
    }

    const importer = REAL_TARGETS[config.key];
    let result: UploadResult;
    if (importer) {
      result = await importer(tenantSlug, rows);
    } else {
      result = { processed: rows.length, failed: 0, errors: [] };
    }

    const hasStatusField = config.fields.find((f) => f.key === "status");
    const status = result.failed > 0 && result.processed === 0
      ? "Failed"
      : (hasStatusField?.options?.includes("Success") ? "Success" : "Active");

    const logRow = await LogModel.create({
      tenantSlug,
      fileName,
      uploadedOn: new Date(),
      recordsProcessed: result.processed,
      status,
      ...extraFields
    });

    await audit(`UPLOAD_${config.key.toUpperCase()}`, config.key, String(logRow._id), {
      tenantSlug,
      fileName,
      recordsProcessed: result.processed,
      failed: result.failed,
      logOnly: !importer
    });

    res.status(201).json({
      data: {
        success: true,
        recordsProcessed: result.processed,
        recordsFailed: result.failed,
        errors: result.errors.slice(0, 20),
        logOnly: !importer,
        logRow: logRow.toObject()
      }
    });
  })
);

// GET /masters/:key/:id/download — hands back the exact original file for
// the handful of upload-log masters that keep it (File Upload
// (Designation-wise), User Manual Upload), matching sanpharma's own
// "Download" link next to each uploaded row.
uploadsRouter.get(
  "/:key/:id/download",
  asyncHandler(async (req, res) => {
    const config = getMasterConfig(req.params.key);
    if (!config) throw new HttpError(404, `Unknown master: ${req.params.key}`);
    if (!FILE_STORING_UPLOAD_KEYS.has(config.key)) throw new HttpError(404, "No stored file for this master");
    const tenantSlug = req.auth!.tenantSlug!;
    const LogModel = getMasterModel(config.key);
    const row = (await LogModel.findOne({ _id: req.params.id, tenantSlug }).lean()) as Record<string, unknown> | null;
    if (!row || !row.fileData) throw new HttpError(404, "File not found");
    const buffer = Buffer.from(row.fileData as string, "base64");
    res.setHeader("Content-Type", (row.mimeType as string) || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(String(row.fileName ?? "download"))}"`);
    res.send(buffer);
  })
);
