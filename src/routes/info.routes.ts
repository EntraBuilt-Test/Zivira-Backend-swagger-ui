// Round 48 Part D -- Information Upload endpoints.
//   admin:    /api/company/info/*          (items CRUD, audience options, Talk to Us inbox)
//   delivery: /api/field/info-center/* and /api/manager/info-center/*  (feed + Talk to Us for the signed-in user)
import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { UserModel } from "../models/user.model.js";
import { EmployeeModel } from "../models/employee.model.js";
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
// Who is asking. The profile routes (/field/*, /manager/*) resolve the employee from the USERNAME (username upper-cased = employee code); the token only carries
// employeeCode when the user record has that field filled in. Requiring the token claim made every user without it get a 403 here, which the portals swallow,
// so Flash News / notices / quote never showed for them. Same resolution as the profile routes now: token claim, user.employeeCode, then username.
async function resolveWho(req: any, strict: boolean) {
  const tenant = req.auth?.tenantSlug as string;
  if (!tenant) throw new HttpError(403, "Employee login required");
  let user: any = null;
  try { user = await UserModel.findById(req.auth?.sub).select("username employeeCode").lean(); } catch { /* unknown user */ }
  const cands = [req.auth?.employeeCode, user?.employeeCode, user?.username ? String(user.username).toUpperCase() : "", user?.username].map((c) => String(c ?? "").trim()).filter(Boolean);
  for (const code of [...new Set(cands)]) {
    const e = (await EmployeeModel.findOne({ tenantSlug: tenant, employeeCode: code }).select("employeeCode").lean()) as any;
    if (e) return { tenant, code: String(e.employeeCode) };
  }
  if (strict) throw new HttpError(403, "Employee login required");
  return { tenant, code: "" };      // no employee record: the feed still returns the items that are for everyone
}
infoDeliveryRouter.get("/feed", asyncHandler(async (req, res) => { const w = await resolveWho(req, false); res.setHeader("Cache-Control", "no-store"); res.json({ data: await feedFor(w.tenant, w.code) }); }));
infoDeliveryRouter.get("/talk", asyncHandler(async (req, res) => { const w = await resolveWho(req, true); res.json({ data: await myTickets(w.tenant, w.code) }); }));
infoDeliveryRouter.post("/talk", asyncHandler(async (req, res) => { const w = await resolveWho(req, true); res.status(201).json({ data: await createTicket(w.tenant, w.code, req.body?.subject, req.body?.message) }); }));
infoDeliveryRouter.post("/talk/:id/reply", asyncHandler(async (req, res) => { const w = await resolveWho(req, true); res.json({ data: await addReply(w.tenant, req.params.id, "EMPLOYEE", "", req.body?.message, w.code) }); }));

// Legacy shape used by the home panels (/field/announcements, /manager/announcements): derived from the same feed so every screen shows the same items.
export async function announcementsFor(req: any) {
  const w = await resolveWho(req, false);
  const f = await feedFor(w.tenant, w.code);
  const texts = f.notices.map((n) => [n.title, n.body].filter(Boolean).join(": "));
  return {
    flashNews: f.flash.length ? { content: f.flash.map((x) => x.body).join("   |   ") } : null,
    noticeBoard: texts.length ? { content1: texts[0] || "", content2: texts[1] || "", content3: texts[2] || "" } : null,
    quoteOfTheWeek: f.quote ? { quote: f.quote.body } : null,
    talkToUs: f.talkInfo ? { content: f.talkInfo } : null
  };
}
