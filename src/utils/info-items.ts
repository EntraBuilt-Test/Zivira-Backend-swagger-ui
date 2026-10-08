// Round 48 Part D -- Information Upload logic (audience, windows, feed, Talk to Us tickets).
import { InfoItemModel } from "../models/info-item.model.js";
import { TalkTicketModel } from "../models/talk-ticket.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import mongoose from "mongoose";
import { HttpError } from "../http/errors.js";
const assertId = (id: string) => { if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "Not found"); };

export type InfoKind = "FLASH" | "NOTICE" | "QUOTE";
const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : []);

export type Viewer = { designation: string; division: string; hq: string };
export const audienceMatches = (it: { designations?: string[]; divisions?: string[]; hqs?: string[] }, v: Viewer) =>
  (!it.designations?.length || it.designations.some((d) => lc(d) === lc(v.designation))) &&
  (!it.divisions?.length || it.divisions.some((d) => lc(d) === lc(v.division))) &&
  (!it.hqs?.length || it.hqs.some((d) => lc(d) === lc(v.hq)));
export const inWindow = (it: { startDate?: string | null; endDate?: string | null }, today: string) =>
  (!it.startDate || it.startDate <= today) && (!it.endDate || it.endDate >= today);
// The calendar day for the COMPANY, not for the server clock: new Date().toISOString() is UTC, so between midnight and 05:30 IST an item
// starting "today" was not visible yet and one ending "yesterday" was still showing.
export const todayIso = (now = new Date(), tz = "Asia/Kolkata") => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
};

export function shape(it: any) {
  return {
    id: String(it._id), kind: it.kind as InfoKind, title: it.title || "", body: it.body, author: it.author || "", priority: it.priority, pinned: !!it.pinned,
    designations: it.designations || [], divisions: it.divisions || [], hqs: it.hqs || [], startDate: it.startDate || null, endDate: it.endDate || null, active: it.active !== false,
    attachmentUrl: it.attachmentUrl || "", attachmentName: it.attachmentName || "", version: it.version || 1, createdBy: it.createdBy || "", createdAt: it.createdAt, updatedAt: it.updatedAt
  };
}

function clean(body: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => { out[k] = v; };
  if (!partial || body.body !== undefined) { const b = String(body.body ?? "").trim(); if (!b) throw new HttpError(400, "Content is required"); set("body", b); }
  if (body.title !== undefined) set("title", String(body.title).trim());
  if (body.author !== undefined) set("author", String(body.author).trim());
  if (body.priority !== undefined) { if (!["NORMAL", "HIGH", "URGENT"].includes(body.priority)) throw new HttpError(400, "priority must be NORMAL, HIGH or URGENT"); set("priority", body.priority); }
  if (body.pinned !== undefined) set("pinned", !!body.pinned);
  if (body.active !== undefined) set("active", !!body.active);
  for (const k of ["designations", "divisions", "hqs"]) if (body[k] !== undefined) set(k, list(body[k]));
  for (const k of ["startDate", "endDate"]) if (body[k] !== undefined) { const v = body[k] ? String(body[k]) : null; if (v && !DATE_RE.test(v)) throw new HttpError(400, `${k} must be YYYY-MM-DD`); set(k, v); }
  if (body.attachmentUrl !== undefined) { const u = String(body.attachmentUrl).trim(); if (u && !/^https?:\/\//i.test(u) && !u.startsWith("/")) throw new HttpError(400, "Attachment must be an http(s) URL or a stored file path"); set("attachmentUrl", u); }
  if (body.attachmentName !== undefined) set("attachmentName", String(body.attachmentName).trim());
  return out;
}

export async function listItems(tenant: string, kind?: string) {
  const f: Record<string, unknown> = { tenantSlug: tenant }; if (kind) f.kind = kind;
  return ((await InfoItemModel.find(f).sort({ createdAt: -1 }).lean()) as any[]).map(shape);
}
export async function createItem(tenant: string, kind: InfoKind, body: any, by: string) {
  if (!["FLASH", "NOTICE", "QUOTE"].includes(kind)) throw new HttpError(400, "Unknown kind");
  const data: any = clean(body, false);
  if (data.startDate && data.endDate && data.endDate < data.startDate) throw new HttpError(400, "End date is before start date");
  const [doc] = await InfoItemModel.create([{ tenantSlug: tenant, kind, version: 1, active: true, priority: "NORMAL", createdBy: by, ...data }]);
  return shape(doc);
}
export async function updateItem(tenant: string, id: string, body: any) {
  assertId(id);
  const cur = (await InfoItemModel.findOne({ _id: id, tenantSlug: tenant }).lean()) as any;
  if (!cur) throw new HttpError(404, "Item not found");
  const data: any = clean(body, true);
  const s = data.startDate !== undefined ? data.startDate : cur.startDate, e = data.endDate !== undefined ? data.endDate : cur.endDate;
  if (s && e && e < s) throw new HttpError(400, "End date is before start date");
  await InfoItemModel.updateOne({ _id: cur._id }, { $set: { ...data, version: (cur.version || 1) + 1 } });
  return shape({ ...cur, ...data, version: (cur.version || 1) + 1 });
}
export async function deleteItem(tenant: string, id: string) {
  assertId(id);
  const cur = (await InfoItemModel.findOne({ _id: id, tenantSlug: tenant }).lean()) as any;
  if (!cur) throw new HttpError(404, "Item not found");
  await InfoItemModel.deleteOne({ _id: cur._id });
}

export async function audienceOptions(tenant: string) {
  const emps = (await EmployeeModel.find({ tenantSlug: tenant, status: "ACTIVE" }).select("designation division territory").lean()) as any[];
  const uniq = (k: string) => [...new Set(emps.map((e) => String(e[k] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { designations: uniq("designation"), divisions: uniq("division"), hqs: uniq("territory") };
}

// Real content already saved through the older single-document admin settings keeps showing
// until the new Information Upload is used for that kind.
async function legacy(tenant: string, key: string): Promise<any | null> {
  try {
    const { getConfigValue } = await import("../models/company-config.model.js");
    return (await getConfigValue(tenant, `adminSettings:${key}`)) ?? null;
  } catch { return null; }
}

export async function feedFor(tenant: string, employeeCode: string, now = new Date()) {
  const emp = (await EmployeeModel.findOne({ tenantSlug: tenant, employeeCode }).lean()) as any;
  const viewer: Viewer = { designation: emp?.designation || "", division: emp?.division || "", hq: emp?.territory || "" };
  let tz = "Asia/Kolkata"; try { const { getCompanyTimezone } = await import("./settings.js"); tz = await getCompanyTimezone(tenant); } catch { /* default */ }
  const today = todayIso(now, tz);
  const items = ((await InfoItemModel.find({ tenantSlug: tenant, active: true }).lean()) as any[]).filter((i) => inWindow(i, today) && audienceMatches(i, viewer)).map(shape);
  const rank = (a: any, b: any) => (+b.pinned - +a.pinned) || (["URGENT", "HIGH", "NORMAL"].indexOf(a.priority) - ["URGENT", "HIGH", "NORMAL"].indexOf(b.priority)) || (+new Date(b.updatedAt || 0) - +new Date(a.updatedAt || 0));
  const of = (k: InfoKind) => items.filter((i) => i.kind === k).sort(rank);
  const flash = of("FLASH"), notices = of("NOTICE"), quotes = of("QUOTE");
  // No fallback to the old single-document settings (adminSettings:flashNews / noticeBoard / quoteOfTheWeek): the admin screens no longer edit or delete them,
  // so a value left there could never be removed and kept showing as a ghost item. What the Information Upload screens list is exactly what is delivered.
  const talk = await legacy(tenant, "talkToUs");
  return { flash, notices, quote: quotes[0] ?? null, talkInfo: typeof talk?.content === "string" ? talk.content : "" };
}

// ── Talk to Us ────────────────────────────────────────────────────────────
const tshape = (t: any) => ({ id: String(t._id), employeeCode: t.employeeCode, employeeName: t.employeeName, designation: t.designation, hq: t.hq, subject: t.subject, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, replies: (t.replies || []).map((r: any) => ({ by: r.by, name: r.name, message: r.message, at: r.at })) });
export async function createTicket(tenant: string, employeeCode: string, subject: unknown, message: unknown) {
  const s = String(subject ?? "").trim(), m = String(message ?? "").trim();
  if (!s) throw new HttpError(400, "Subject is required");
  if (!m) throw new HttpError(400, "Message is required");
  const emp = (await EmployeeModel.findOne({ tenantSlug: tenant, employeeCode }).lean()) as any;
  const [t] = await TalkTicketModel.create([{ tenantSlug: tenant, employeeCode, employeeName: emp?.name || "", designation: emp?.designation || "", hq: emp?.territory || "", subject: s, status: "OPEN", replies: [{ by: "EMPLOYEE", name: emp?.name || employeeCode, message: m, at: new Date() }] }]);
  return tshape(t);
}
export async function myTickets(tenant: string, employeeCode: string) {
  return ((await TalkTicketModel.find({ tenantSlug: tenant, employeeCode }).sort({ updatedAt: -1 }).lean()) as any[]).map(tshape);
}
export async function allTickets(tenant: string, status?: string) {
  const f: Record<string, unknown> = { tenantSlug: tenant }; if (status) f.status = status;
  return ((await TalkTicketModel.find(f).sort({ updatedAt: -1 }).lean()) as any[]).map(tshape);
}
export async function addReply(tenant: string, id: string, by: "EMPLOYEE" | "ADMIN", name: string, message: unknown, employeeCode?: string) {
  assertId(id);
  const m = String(message ?? "").trim();
  if (!m) throw new HttpError(400, "Message is required");
  const f: Record<string, unknown> = { _id: id, tenantSlug: tenant }; if (employeeCode) f.employeeCode = employeeCode;
  const cur = (await TalkTicketModel.findOne(f).lean()) as any;
  if (!cur) throw new HttpError(404, "Ticket not found");
  if (cur.status === "CLOSED" && by === "EMPLOYEE") throw new HttpError(409, "This ticket is closed. Start a new one.");
  const replies = [...(cur.replies || []), { by, name: by === "EMPLOYEE" ? cur.employeeName || name : name, message: m, at: new Date() }];
  await TalkTicketModel.updateOne({ _id: cur._id }, { $set: { replies, status: by === "ADMIN" ? "ANSWERED" : "OPEN" } });
  return tshape({ ...cur, replies, status: by === "ADMIN" ? "ANSWERED" : "OPEN" });
}
export async function setTicketStatus(tenant: string, id: string, status: string) {
  assertId(id);
  if (!["OPEN", "ANSWERED", "CLOSED"].includes(status)) throw new HttpError(400, "Bad status");
  const cur = (await TalkTicketModel.findOne({ _id: id, tenantSlug: tenant }).lean()) as any;
  if (!cur) throw new HttpError(404, "Ticket not found");
  await TalkTicketModel.updateOne({ _id: cur._id }, { $set: { status } });
  return tshape({ ...cur, status });
}
