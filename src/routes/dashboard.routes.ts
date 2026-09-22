import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { DASHBOARD_MAX_WIDGETS, DashboardModel } from "../models/dashboard.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { StockistModel } from "../models/stockist.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { ProductModel } from "../models/product.model.js";
import { HolidayModel } from "../models/holiday.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { serializeDocument } from "../utils/serialize.js";
import { audit } from "../utils/audit.js";

// Real dashboard-builder backing the "Options > Dashboard" screen, mirroring
// sanpharma.info's MasterFiles/DynamicDashboard/Dashboard.aspx flow: Module
// tabs (Master/Marketing/Sales KPI) each hold named dashboards, each
// dashboard holds up to DASHBOARD_MAX_WIDGETS widgets, each widget an
// aggregation chart over a real master collection. Mounted at
// /company/dashboards (see company.routes.ts) — same requireAuth +
// requireCompanyAdmin gate as every other Admin-portal route, and every
// query below is scoped to req.auth.tenantSlug like mail.routes.ts /
// quiz.routes.ts.
export const dashboardsRouter = Router();

// ─────────────────────────────────────────────────────────────────────────
// Category → dimension → real-model/real-field lookup table.
//
// This is the single source of truth for what the "Add Widget" left-panel
// tree offers and what each leaf actually aggregates. Where the real schema
// in this codebase has no field that matches the sanpharma.info label
// exactly, the mapping reuses the closest real field instead of inventing
// one, and `note` records the honest gap so it shows up in tooling/reports
// rather than being silently papered over.
// ─────────────────────────────────────────────────────────────────────────
type WidgetSource = {
  model: any;
  field: string;
  // How to associate a row of this collection with a given employeeCode,
  // for the optional Field Force filter. "none" = filter is ignored for
  // this leaf (no real per-rep association exists in the schema).
  fieldForce:
    | { kind: "none" }
    | { kind: "directField"; field: string } // row has employeeCode directly
    | { kind: "nameField"; field: string } // row has the rep's NAME (not code) in this field
    | { kind: "viaDcr" }; // association is via DcrModel.doctorId visits
  note?: string;
};

const CATEGORY_MAP: Record<string, Record<string, WidgetSource>> = {
  "Listed Doctors": {
    Speciality: { model: DoctorModel, field: "specialty", fieldForce: { kind: "viaDcr" } },
    Category: { model: DoctorModel, field: "category", fieldForce: { kind: "viaDcr" } },
    Class: {
      model: DoctorModel,
      field: "grade",
      fieldForce: { kind: "viaDcr" },
      note: "Doctor has no dedicated 'class' field — grouped by the closest real field, `grade`."
    },
    Campaign: {
      model: DoctorModel,
      field: "territory",
      fieldForce: { kind: "viaDcr" },
      note: "Doctor has no campaign field — grouped by `territory` as the closest real field (simplification)."
    },
    Subdivision: {
      model: DoctorModel,
      field: "city",
      fieldForce: { kind: "viaDcr" },
      note: "Doctor has no subdivision field — grouped by `city` as the closest real geographic subunit."
    },
    "State wise": { model: DoctorModel, field: "state", fieldForce: { kind: "viaDcr" } }
  },
  "Unlisted Doctors": {
    Status: { model: UnlistedDoctorModel, field: "status", fieldForce: { kind: "nameField", field: "mr" } },
    Potential: { model: UnlistedDoctorModel, field: "potential", fieldForce: { kind: "nameField", field: "mr" } },
    "State wise": { model: UnlistedDoctorModel, field: "state", fieldForce: { kind: "nameField", field: "mr" } }
  },
  Chemist: {
    "State wise": { model: DealerModel, field: "state", fieldForce: { kind: "directField", field: "employeeCode" } },
    City: { model: DealerModel, field: "city", fieldForce: { kind: "directField", field: "employeeCode" } },
    Status: { model: DealerModel, field: "status", fieldForce: { kind: "directField", field: "employeeCode" } }
  },
  Stockist: {
    "State wise": {
      model: StockistModel,
      field: "state",
      fieldForce: { kind: "nameField", field: "fieldForceName" },
      note: "Stockist stores the rep's NAME (fieldForceName), not employeeCode — filter matches by resolved name."
    },
    HQ: { model: StockistModel, field: "hqName", fieldForce: { kind: "nameField", field: "fieldForceName" } },
    Status: { model: StockistModel, field: "status", fieldForce: { kind: "nameField", field: "fieldForceName" } }
  },
  "Field Force": {
    Designation: { model: EmployeeModel, field: "designation", fieldForce: { kind: "directField", field: "employeeCode" } },
    Territory: { model: EmployeeModel, field: "territory", fieldForce: { kind: "directField", field: "employeeCode" } },
    Division: { model: EmployeeModel, field: "division", fieldForce: { kind: "directField", field: "employeeCode" } },
    Role: { model: EmployeeModel, field: "role", fieldForce: { kind: "directField", field: "employeeCode" } },
    Status: { model: EmployeeModel, field: "status", fieldForce: { kind: "directField", field: "employeeCode" } }
  },
  Product: {
    Category: {
      model: ProductModel,
      field: "category",
      fieldForce: { kind: "none" },
      note: "Product has no per-rep association in this schema — Field Force filter is ignored for this leaf."
    },
    Division: { model: ProductModel, field: "division", fieldForce: { kind: "none" } },
    Group: { model: ProductModel, field: "group", fieldForce: { kind: "none" } }
  },
  Holiday: {
    "State wise": {
      model: HolidayModel,
      field: "stateName",
      fieldForce: { kind: "none" },
      note: "Holiday has no per-rep association — Field Force filter is ignored for this leaf."
    }
    // "Month" is handled specially below (derived from otherHolidayDate), not a plain field group.
  }
};

// Ordered tree shown in the Add-Widget left panel (drives both the UI
// contract and this route's own validation of category/dimension pairs).
export const DASHBOARD_WIDGET_TREE: { category: string; dimensions: string[] }[] = [
  { category: "Listed Doctors", dimensions: ["Speciality", "Category", "Class", "Campaign", "Subdivision", "State wise"] },
  { category: "Unlisted Doctors", dimensions: ["Status", "Potential", "State wise"] },
  { category: "Chemist", dimensions: ["State wise", "City", "Status"] },
  { category: "Stockist", dimensions: ["State wise", "HQ", "Status"] },
  { category: "Field Force", dimensions: ["Designation", "Territory", "Division", "Role", "Status"] },
  { category: "Product", dimensions: ["Category", "Division", "Group"] },
  { category: "Holiday", dimensions: ["State wise", "Month"] }
];

async function resolveEmployeeName(tenantSlug: string, employeeCode: string): Promise<string | null> {
  const emp = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean<{ name?: string }>();
  return emp?.name ?? null;
}

async function computeWidgetData(
  tenantSlug: string,
  category: string,
  dimension: string,
  fieldForceCode?: string
): Promise<{ labels: string[]; values: number[]; total: number; note?: string }> {
  // Special-cased leaf: Holiday x Month has no plain field to $group by —
  // it's derived from otherHolidayDate.
  if (category === "Holiday" && dimension === "Month") {
    const rows = await HolidayModel.find({ tenantSlug }).lean<{ otherHolidayDate?: Date | null }[]>();
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.otherHolidayDate) continue;
      const m = MONTHS[new Date(r.otherHolidayDate).getUTCMonth()];
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    const labels = [...counts.keys()];
    const values = labels.map((l) => counts.get(l)!);
    return {
      labels,
      values,
      total: values.reduce((a, b) => a + b, 0),
      note: "Holiday has no per-rep association — Field Force filter is ignored for this leaf."
    };
  }

  const source = CATEGORY_MAP[category]?.[dimension];
  if (!source) {
    throw new HttpError(400, `Unknown category/dimension combination: ${category} / ${dimension}`);
  }

  const filter: Record<string, unknown> = { tenantSlug };

  if (fieldForceCode) {
    if (source.fieldForce.kind === "directField") {
      filter[source.fieldForce.field] = fieldForceCode;
    } else if (source.fieldForce.kind === "nameField") {
      const name = await resolveEmployeeName(tenantSlug, fieldForceCode);
      // No match found for that code -> scope to an impossible value so the
      // widget honestly renders "no data" rather than silently ignoring the
      // filter the user asked for.
      filter[source.fieldForce.field] = name ?? "__no_match__";
    } else if (source.fieldForce.kind === "viaDcr") {
      const doctorIds = await DcrModel.find({ tenantSlug, employeeCode: fieldForceCode, status: { $ne: "REJECTED" } })
        .distinct("doctorId");
      filter._id = { $in: doctorIds };
    }
    // "none" -> filter intentionally left unscoped by field force.
  }

  const rows: Record<string, unknown>[] = await source.model
    .aggregate([
      { $match: filter },
      { $group: { _id: { $ifNull: [`$${source.field}`, "Unspecified"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    .exec();

  const labels = rows.map((r) => String(r._id));
  const values = rows.map((r) => Number(r.count));

  return { labels, values, total: values.reduce((a, b) => a + b, 0), note: source.note };
}

dashboardsRouter.get(
  "/widget-tree",
  asyncHandler(async (_req, res) => {
    res.json({ data: DASHBOARD_WIDGET_TREE });
  })
);

dashboardsRouter.get(
  "/widget-data",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const category = String(req.query.category ?? "");
    const dimension = String(req.query.dimension ?? "");
    const fieldForce = typeof req.query.fieldForce === "string" && req.query.fieldForce.trim() ? req.query.fieldForce.trim() : undefined;

    if (!category || !dimension) throw new HttpError(400, "category and dimension are required");

    const data = await computeWidgetData(tenantSlug, category, dimension, fieldForce);
    res.json({ data });
  })
);

const createDashboardSchema = z.object({
  name: z.string().min(1),
  module: z.enum(["Master KPI", "Marketing KPI", "Sales KPI"]).default("Master KPI")
});

dashboardsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = createDashboardSchema.parse(req.body);
    const dashboard = await DashboardModel.create({
      tenantSlug,
      name: body.name,
      module: body.module,
      widgets: [],
      createdBy: req.auth!.sub ?? null
    });
    await audit("DASHBOARD_CREATED", "dashboard", String(dashboard._id), { tenantSlug, name: body.name, module: body.module });
    res.status(201).json({ data: serializeDocument(dashboard) });
  })
);

dashboardsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const filter: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.module === "string" && req.query.module.trim()) filter.module = req.query.module.trim();
    const rows = await DashboardModel.find(filter).sort({ createdAt: -1 });
    res.json({ data: rows.map((r) => serializeDocument(r)) });
  })
);

dashboardsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const dashboard = await DashboardModel.findOne({ _id: req.params.id, tenantSlug });
    if (!dashboard) throw new HttpError(404, "Dashboard not found");
    res.json({ data: serializeDocument(dashboard) });
  })
);

dashboardsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const dashboard = await DashboardModel.findOneAndDelete({ _id: req.params.id, tenantSlug });
    if (!dashboard) throw new HttpError(404, "Dashboard not found");
    await audit("DASHBOARD_DELETED", "dashboard", String(dashboard._id), { tenantSlug });
    res.json({ data: { success: true } });
  })
);

const addWidgetSchema = z.object({
  widgetName: z.string().min(1),
  category: z.string().min(1),
  dimension: z.string().min(1),
  splitBy: z.string().default("None"),
  chartType: z.enum(["pie", "donut", "bar", "line", "area", "funnel", "table"]).default("pie")
});

dashboardsRouter.post(
  "/:id/widgets",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = addWidgetSchema.parse(req.body);

    const validDimensions = CATEGORY_MAP[body.category] ? Object.keys(CATEGORY_MAP[body.category]) : [];
    const holidayMonthOk = body.category === "Holiday" && body.dimension === "Month";
    if (!validDimensions.includes(body.dimension) && !holidayMonthOk) {
      throw new HttpError(400, `Unknown category/dimension combination: ${body.category} / ${body.dimension}`);
    }

    const dashboard = await DashboardModel.findOne({ _id: req.params.id, tenantSlug });
    if (!dashboard) throw new HttpError(404, "Dashboard not found");

    if (dashboard.widgets.length >= DASHBOARD_MAX_WIDGETS) {
      throw new HttpError(400, `A dashboard can hold at most ${DASHBOARD_MAX_WIDGETS} widgets`);
    }

    dashboard.widgets.push(body as any);
    await dashboard.save();

    await audit("DASHBOARD_WIDGET_ADDED", "dashboard", String(dashboard._id), { tenantSlug, widget: body });
    res.status(201).json({ data: serializeDocument(dashboard) });
  })
);

dashboardsRouter.delete(
  "/:id/widgets/:widgetIndex",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const index = Number(req.params.widgetIndex);

    const dashboard = await DashboardModel.findOne({ _id: req.params.id, tenantSlug });
    if (!dashboard) throw new HttpError(404, "Dashboard not found");
    if (!Number.isInteger(index) || index < 0 || index >= dashboard.widgets.length) {
      throw new HttpError(404, "Widget not found");
    }

    dashboard.widgets.splice(index, 1);
    await dashboard.save();

    await audit("DASHBOARD_WIDGET_REMOVED", "dashboard", String(dashboard._id), { tenantSlug, index });
    res.json({ data: serializeDocument(dashboard) });
  })
);
