// src/routes/erp.routes.ts
// Phase 2 ERP (ENT-ZVR-2026-P2) -- Secondary Sales.
// Mounted at /api/company/erp (company admin only, see company.routes.ts).
//
// The admin portal reads each distributor's statement (PDF / Excel) in the
// browser, shows a preview, and posts the confirmed lines here. The
// compilation endpoint returns the same grid as Zivira's "Secondary Sales
// Compilation" sheet: one row per stockist x product, eight columns per month.
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { SalesProductModel, SalesStockistModel, StockistStatementModel } from "../models/erp-sales.model.js";
import { audit } from "../utils/audit.js";
import { serializeDocument } from "../utils/serialize.js";

export const erpRouter = Router();

// Built from the Nov 2026 sample statements. PTS only where Zivira's
// compilation sheet gave it; the rest is entered in ERP > Products & PTS.
const DEFAULT_PRODUCTS: { name: string; pack: string; pts: number | null }[] = [
  { name: "BEPIREX", pack: "5ML", pts: 166.18 }, { name: "BRINZIA", pack: "5ML", pts: null },
  { name: "BRITIVIN", pack: "5ML", pts: 243.96 }, { name: "DEXNOVA", pack: "10ML", pts: null },
  { name: "DUCIDROP", pack: "5ML", pts: 108.64 }, { name: "DUCIRA GEL", pack: "10GM", pts: 289.93 },
  { name: "ENVISA", pack: "1X10 TAB", pts: null }, { name: "FOMIRA", pack: "10ML", pts: null },
  { name: "HYNIZA", pack: "1X10", pts: null }, { name: "LATOBEST", pack: "2.5ML", pts: null },
  { name: "LOTIVIZ", pack: "5ML", pts: null }, { name: "MACUMER", pack: "1X10 TAB", pts: null },
  { name: "NEPAWEL", pack: "5ML", pts: null }, { name: "PATVIRA", pack: "2.5ML", pts: null },
  { name: "PREDIRA", pack: "10ML", pts: null }, { name: "STRIOS MAX", pack: "1X14", pts: null },
  { name: "STRIOS LID WIPES", pack: "1X24", pts: null }, { name: "TIMOBEST", pack: "5ML", pts: null },
  { name: "TIZTA LIQUIGEL", pack: "10ML", pts: null }, { name: "TIZTA 10ML", pack: "10ML", pts: null },
  { name: "TIZTA 5ML", pack: "5ML", pts: null }, { name: "TOBRAWIN LP", pack: "5ML", pts: null },
  { name: "TOBRAWIN", pack: "5ML", pts: null }, { name: "VITTLES D3", pack: "1X40", pts: null },
  { name: "VITTLES JELLY 18%", pack: "1X30", pts: null }, { name: "VITTLES JELLY", pack: "1X12", pts: null },
  { name: "XIATRA", pack: "3ML", pts: null }, { name: "ZIVIFRESH GEL", pack: "10ML", pts: null },
  { name: "ZIVIFRESH", pack: "10ML", pts: null }, { name: "ZIVIMOX LP", pack: "5ML", pts: null },
  { name: "ZIVIMOX D", pack: "5ML", pts: null }, { name: "ZIVIMOX", pack: "5ML", pts: null },
  { name: "ZIVIPRED", pack: "10ML", pts: null }
];

async function ensureProducts(tenantSlug: string) {
  const count = await SalesProductModel.countDocuments({ tenantSlug });
  if (count > 0) return;
  await SalesProductModel.insertMany(DEFAULT_PRODUCTS.map((p) => ({ ...p, tenantSlug })), { ordered: false }).catch(() => undefined);
}

// ── Products & PTS ──────────────────────────────────────────────────────
erpRouter.get("/products", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  await ensureProducts(tenantSlug);
  const rows = await SalesProductModel.find({ tenantSlug }).sort({ name: 1 }).lean();
  res.json({ data: rows.map((r) => serializeDocument(r as typeof r & { _id: unknown })) });
}));

const productSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pack: z.string().max(40).optional(),
  division: z.string().max(40).optional(),
  pts: z.number().nonnegative().nullable().optional(),
  aliases: z.array(z.string().max(120)).max(50).optional(),
  active: z.boolean().optional()
});

erpRouter.post("/products", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productSchema.parse(req.body);
  const name = body.name.toUpperCase();
  if (await SalesProductModel.exists({ tenantSlug, name })) throw new HttpError(409, "This product already exists");
  const row = await SalesProductModel.create({ ...body, name, tenantSlug });
  await audit("ERP_PRODUCT_CREATED", "SalesProduct", String(row._id), { tenantSlug, name });
  res.status(201).json({ data: serializeDocument(row) });
}));

erpRouter.put("/products/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productSchema.partial().parse(req.body);
  const update: Record<string, unknown> = { ...body };
  if (body.name) update.name = body.name.toUpperCase();
  const row = await SalesProductModel.findOneAndUpdate({ tenantSlug, _id: req.params.id }, { $set: update }, { new: true });
  if (!row) throw new HttpError(404, "Product not found");
  await audit("ERP_PRODUCT_UPDATED", "SalesProduct", String(row._id), { tenantSlug, name: row.name });
  res.json({ data: serializeDocument(row) });
}));

// ── Stockists ───────────────────────────────────────────────────────────
erpRouter.get("/stockists", asyncHandler(async (req, res) => {
  const rows = await SalesStockistModel.find({ tenantSlug: req.auth!.tenantSlug! }).sort({ name: 1 }).lean();
  res.json({ data: rows.map((r) => serializeDocument(r as typeof r & { _id: unknown })) });
}));

const stockistSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gstin: z.string().max(20).optional(),
  state: z.string().max(40).optional(),
  hq: z.string().max(60).optional(),
  place: z.string().max(60).optional(),
  division: z.string().max(40).optional(),
  active: z.boolean().optional()
});

erpRouter.put("/stockists/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = stockistSchema.partial().parse(req.body);
  const row = await SalesStockistModel.findOneAndUpdate({ tenantSlug, _id: req.params.id }, { $set: body }, { new: true });
  if (!row) throw new HttpError(404, "Stockist not found");
  res.json({ data: serializeDocument(row) });
}));

// ── Statements ──────────────────────────────────────────────────────────
const n = z.number().finite();
const lineSchema = z.object({
  product: z.string().trim().min(1).max(80),
  rawName: z.string().max(160).optional(),
  pack: z.string().max(60).optional(),
  opening: n, primary: n, primaryFree: n, purchaseReturn: n,
  secondary: n, secondaryFree: n, salesReturn: n, closing: n,
  secondaryValue: n.nullable().optional()
});
const statementSchema = z.object({
  stockist: stockistSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  periodFrom: z.string().max(10).optional(),
  periodTo: z.string().max(10).optional(),
  sourceFile: z.string().max(200).optional(),
  format: z.string().max(20).optional(),
  lines: z.array(lineSchema).min(1).max(500)
});

type Line = z.infer<typeof lineSchema>;

erpRouter.post("/statements", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = statementSchema.parse(req.body);
  const stockistName = body.stockist.name.toUpperCase();

  await SalesStockistModel.findOneAndUpdate(
    { tenantSlug, name: stockistName },
    { $set: { ...body.stockist, name: stockistName, tenantSlug } },
    { upsert: true, new: true }
  );

  // A statement can list the same product twice (e.g. two batches); add them up.
  const byProduct = new Map<string, Line>();
  for (const l of body.lines) {
    const key = l.product.toUpperCase();
    const prev = byProduct.get(key);
    if (!prev) { byProduct.set(key, { ...l, product: key }); continue; }
    for (const f of ["opening", "primary", "primaryFree", "purchaseReturn", "secondary", "secondaryFree", "salesReturn", "closing"] as const) prev[f] += l[f];
    if (l.secondaryValue != null) prev.secondaryValue = (prev.secondaryValue ?? 0) + l.secondaryValue;
  }

  const doc = await StockistStatementModel.findOneAndUpdate(
    { tenantSlug, stockistName, month: body.month },
    { $set: {
      tenantSlug, stockistName, month: body.month,
      periodFrom: body.periodFrom ?? "", periodTo: body.periodTo ?? "",
      sourceFile: body.sourceFile ?? "", format: body.format ?? "",
      uploadedBy: req.auth!.sub, lines: [...byProduct.values()]
    } },
    { upsert: true, new: true }
  );
  if (!doc) throw new HttpError(500, "Statement could not be saved");
  await audit("ERP_STATEMENT_SAVED", "StockistStatement", String(doc._id), { tenantSlug, stockistName, month: body.month, lines: byProduct.size });
  res.status(201).json({ data: serializeDocument(doc) });
}));

erpRouter.get("/statements", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const filter: Record<string, unknown> = { tenantSlug };
  if (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)) filter.month = req.query.month;
  const rows = await StockistStatementModel.find(filter).sort({ month: -1, stockistName: 1 }).lean();
  res.json({
    data: rows.map((r) => {
      const lines = (r.lines ?? []) as unknown as Line[];
      return {
        id: String(r._id), stockistName: r.stockistName, month: r.month, sourceFile: r.sourceFile, format: r.format,
        updatedAt: (r as { updatedAt?: Date }).updatedAt, lineCount: lines.length,
        primary: lines.reduce((s, l) => s + (l.primary || 0), 0),
        secondary: lines.reduce((s, l) => s + (l.secondary || 0), 0)
      };
    })
  });
}));

erpRouter.get("/statements/:id", asyncHandler(async (req, res) => {
  const row = await StockistStatementModel.findOne({ tenantSlug: req.auth!.tenantSlug!, _id: req.params.id }).lean();
  if (!row) throw new HttpError(404, "Statement not found");
  res.json({ data: serializeDocument(row as typeof row & { _id: unknown }) });
}));

erpRouter.delete("/statements/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await StockistStatementModel.findOneAndDelete({ tenantSlug, _id: req.params.id });
  if (!row) throw new HttpError(404, "Statement not found");
  await audit("ERP_STATEMENT_DELETED", "StockistStatement", String(row._id), { tenantSlug, stockistName: row.stockistName, month: row.month });
  res.json({ data: { id: String(row._id), deleted: true } });
}));

// ── Compilation (Zivira's "Secondary Sales Compilation" grid) ───────────
// Financial year April..March. Per month:
//   PRIMARY = stockist's receipt/purchase, PRIMARY FREE, RET = purchase return,
//   N.PRIMARY = PRIMARY - RET, SECONDARY = stockist's sale/issue,
//   N.SECONDARY = SECONDARY - sales return, N.SECONDARY VAL = N.SECONDARY x PTS,
//   CLOSING = closing stock.
erpRouter.get("/compilation", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const fyStart = Number(req.query.fy) || (now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = (3 + i) % 12, y = fyStart + (3 + i >= 12 ? 1 : 0);
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  await ensureProducts(tenantSlug);
  const [statements, products, stockists] = await Promise.all([
    StockistStatementModel.find({ tenantSlug, month: { $in: months } }).lean(),
    SalesProductModel.find({ tenantSlug }).lean(),
    SalesStockistModel.find({ tenantSlug }).lean()
  ]);
  type P = { name: string; pts?: number | null; division?: string; active?: boolean };
  type S = { name: string; state?: string; hq?: string; place?: string; division?: string };
  const prodList = products as unknown as P[];
  const pts = new Map<string, number | null>(prodList.map((p) => [p.name, p.pts ?? null]));
  const prodDivision = new Map<string, string>(prodList.map((p) => [p.name, p.division ?? ""]));
  const stk = new Map<string, S>((stockists as unknown as S[]).map((s) => [s.name, s]));

  type Cell = { primary: number; primaryFree: number; ret: number; nPrimary: number; secondary: number; nSecondary: number; nSecondaryVal: number | null; closing: number };
  const rows = new Map<string, { state: string; hq: string; place: string; customer: string; division: string; product: string; batch: string; pts: number | null; months: Record<string, Cell> }>();
  for (const st of statements as unknown as { stockistName: string; month: string; lines?: unknown }[]) {
    const s = stk.get(st.stockistName);
    for (const l of (st.lines ?? []) as unknown as Line[]) {
      const key = `${st.stockistName}|${l.product}`;
      let row = rows.get(key);
      if (!row) {
        row = { state: s?.state ?? "", hq: s?.hq ?? "", place: s?.place ?? "", customer: st.stockistName,
          division: s?.division || prodDivision.get(l.product) || "", product: l.product, batch: "", pts: pts.get(l.product) ?? null, months: {} };
        rows.set(key, row);
      }
      const nSecondary = l.secondary - l.salesReturn;
      const p = row.pts;
      row.months[st.month] = {
        primary: l.primary, primaryFree: l.primaryFree, ret: l.purchaseReturn, nPrimary: l.primary - l.purchaseReturn,
        secondary: l.secondary, nSecondary,
        nSecondaryVal: p != null ? Math.round(nSecondary * p * 100) / 100 : (l.secondaryValue ?? null),
        closing: l.closing
      };
    }
  }
  const data = [...rows.values()].sort((a, b) => a.state.localeCompare(b.state) || a.hq.localeCompare(b.hq) || a.customer.localeCompare(b.customer) || a.product.localeCompare(b.product));
  res.json({ data, months, fy: fyStart, missingPts: prodList.filter((p) => p.pts == null && p.active !== false).map((p) => p.name) });
}));
