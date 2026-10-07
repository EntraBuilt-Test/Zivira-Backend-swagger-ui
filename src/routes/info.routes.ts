// Round 48 Part D -- Information Upload endpoints.
//   admin:    /api/company/info/*          (items CRUD, audience options, Talk to Us inbox)
//   delivery: /api/field/info-center/* and /api/manager/info-center/*  (feed + Talk to Us for the signed-in user)
import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { UserModel } from "../models/user.model.js";
import { listItems, createItem, updateItem, deleteItem, audienceOptions, feedFor, createTicket, myTickets, allTickets, addReply, setTicketStatus } from "../utils/info-items.js";

async function adminName(req: any): Promise<string> {
  try { const u = (await UserModel.findById(req.auth?.sub).select("username").lean()) as any; return u?.username || "Admin"; } catch { return "Admin"; }
}

export const infoAdminRouter = Router();
infoAdminRouter.get("/items", asyncHandler(async (req, res) => { res.json({ data: await listItems(req.auth!.tenantSlug!, typeof req.query.kind === "string" ? req.query.kind : undefined) }); }));
infoAdminRouter.post("/items", asyncHandler(async (req, res) => { res.status(201).json({ data: await createItem(req.auth!.tenantSlug!, String(req.body?.kind) as any, req.body, await adminName(req)) }); }));
infoAdminRouter.patch("/items/:id", asyncHandler(async (req, res) => { res.json({ data: await updateItem(req.auth!.tenantSlug!, req.params.id, req.body ?? {}) }); }));
infoAdminRouter.delete("/items/:id", asyncHandler(async (req, res) => { await deleteItem(req.auth!.tenantSlug!, req.params.id); res.json({ data: { deleted: true } }); }));
infoAdminRouter.get("/audience-options", asyncHandler(async (req, res) => { res.json({ data: await audienceOptions(req.auth!.tenantSlug!) }); }));
infoAdminRouter.get("/tickets", asyncHandler(async (req, res) => { res.json({ data: await allTickets(req.auth!.tenantSlug!, typeof req.query.status === "string" && req.query.status ? req.query.status : undefined) }); }));
infoAdminRouter.post("/tickets/:id/reply", asyncHandler(async (req, res) => { res.json({ data: await addReply(req.auth!.tenantSlug!, req.params.id, "ADMIN", await adminName(req), req.body?.message) }); }));
infoAdminRouter.patch("/tickets/:id/status", asyncHandler(async (req, res) => { res.json({ data: await setTicketStatus(req.auth!.tenantSlug!, req.params.id, String(req.body?.status)) }); }));

export const infoDeliveryRouter = Router();
const who = (req: any) => { const code = req.auth?.employeeCode; if (!code) throw new HttpError(403, "Employee login required"); return { tenant: req.auth.tenantSlug as string, code: code as string }; };
infoDeliveryRouter.get("/feed", asyncHandler(async (req, res) => { const w = who(req); res.json({ data: await feedFor(w.tenant, w.code) }); }));
infoDeliveryRouter.get("/talk", asyncHandler(async (req, res) => { const w = who(req); res.json({ data: await myTickets(w.tenant, w.code) }); }));
infoDeliveryRouter.post("/talk", asyncHandler(async (req, res) => { const w = who(req); res.status(201).json({ data: await createTicket(w.tenant, w.code, req.body?.subject, req.body?.message) }); }));
infoDeliveryRouter.post("/talk/:id/reply", asyncHandler(async (req, res) => { const w = who(req); res.json({ data: await addReply(w.tenant, req.params.id, "EMPLOYEE", "", req.body?.message, w.code) }); }));
