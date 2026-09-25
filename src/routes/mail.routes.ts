import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { InternalMailModel } from "../models/internal-mail.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { audit } from "../utils/audit.js";
import { serializeDocument } from "../utils/serialize.js";

// Real internal-mail system backing the "Mail Box", "Mail Box - Delete" and
// "Mail Folder Creation" Options screens. Mounted at /company/mail (see
// company.routes.ts) — same requireAuth+requireCompanyAdmin gate as every
// other Admin-portal route.
export const mailRouter = Router();

const SYSTEM_FOLDERS = ["Inbox", "Sent Mails", "Viewed Mails"];

async function activeCustomFolders(tenantSlug: string): Promise<string[]> {
  const FolderModel = getMasterModel("mailFolderCreation");
  const rows = await FolderModel.find({ tenantSlug, status: { $ne: "Inactive" } }).lean<Record<string, unknown>[]>();
  return rows.map((r) => String(r.mailFolderName)).filter(Boolean);
}

async function validFolder(tenantSlug: string, folder: string) {
  if (SYSTEM_FOLDERS.includes(folder)) return true;
  const custom = await activeCustomFolders(tenantSlug);
  return custom.includes(folder);
}

async function refreshFolderCount(tenantSlug: string, folder: string) {
  if (SYSTEM_FOLDERS.includes(folder)) return;
  const FolderModel = getMasterModel("mailFolderCreation");
  const count = await InternalMailModel.countDocuments({ tenantSlug, folder });
  await FolderModel.updateOne({ tenantSlug, mailFolderName: folder }, { $set: { mailCount: count } });
}

const sendMailSchema = z.object({
  toEmployeeCode: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().default(""),
  folder: z.string().default("Inbox")
});

mailRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = sendMailSchema.parse(req.body);

    if (!(await validFolder(tenantSlug, body.folder))) {
      throw new HttpError(400, `Unknown folder "${body.folder}" — create it first under Mail Folder Creation`);
    }

    const recipient = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.toEmployeeCode }).lean();
    if (!recipient) throw new HttpError(404, "Recipient employee not found");

    const recipientCopy = await InternalMailModel.create({
      tenantSlug,
      fromEmployeeCode: "ADMIN",
      fromName: "Admin",
      toEmployeeCode: recipient.employeeCode,
      toName: recipient.name,
      subject: body.subject,
      body: body.body,
      folder: body.folder,
      sentAt: new Date()
    });

    await InternalMailModel.create({
      tenantSlug,
      fromEmployeeCode: "ADMIN",
      fromName: "Admin",
      toEmployeeCode: recipient.employeeCode,
      toName: recipient.name,
      subject: body.subject,
      body: body.body,
      folder: "Sent Mails",
      sentAt: new Date(),
      readAt: new Date()
    });

    await refreshFolderCount(tenantSlug, body.folder);
    await audit("MAIL_SENT", "internalMail", String(recipientCopy._id), { tenantSlug, toEmployeeCode: recipient.employeeCode });

    res.status(201).json({ data: serializeDocument(recipientCopy) });
  })
);

mailRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const filter: Record<string, unknown> = { tenantSlug };

    if (typeof req.query.folder === "string" && req.query.folder.trim()) filter.folder = req.query.folder.trim();
    // Admin "Update/Delete > Mail Delete" screen filters by Field Force
    // Name — a mail's real owner is whichever side of it is the employee
    // (recipient in Inbox/Viewed Mails, sender's own Sent Mails copy has
    // toEmployeeCode set to the same employee too, since sendMail() writes
    // both copies with toEmployeeCode = the employee), so matching on
    // toEmployeeCode alone covers every system folder.
    if (typeof req.query.toEmployeeCode === "string" && req.query.toEmployeeCode.trim()) {
      filter.toEmployeeCode = req.query.toEmployeeCode.trim();
    }
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.subject = new RegExp(escaped, "i");
    }
    if (typeof req.query.month === "string" && req.query.month.trim() && typeof req.query.year === "string" && req.query.year.trim()) {
      const month = parseInt(req.query.month, 10);
      const year = parseInt(req.query.year, 10);
      if (Number.isFinite(month) && Number.isFinite(year)) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        filter.sentAt = { $gte: start, $lt: end };
      }
    }

    const mail = await InternalMailModel.find(filter).sort({ sentAt: -1 }).limit(500);
    res.json({
      data: mail.map((m) => ({
        ...serializeDocument(m),
        status: m.readAt ? "Read" : "Unread"
      }))
    });
  })
);

mailRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const mail = await InternalMailModel.findOne({ _id: req.params.id, tenantSlug });
    if (!mail) throw new HttpError(404, "Mail not found");

    mail.readAt = mail.readAt ?? new Date();
    const previousFolder = mail.folder;
    if (mail.folder === "Inbox") mail.folder = "Viewed Mails";
    await mail.save();

    await refreshFolderCount(tenantSlug, previousFolder);
    await refreshFolderCount(tenantSlug, mail.folder);

    res.json({ data: serializeDocument(mail) });
  })
);

const moveSchema = z.object({ folder: z.string().min(1) });
mailRouter.patch(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = moveSchema.parse(req.body);
    if (!(await validFolder(tenantSlug, body.folder))) {
      throw new HttpError(400, `Unknown folder "${body.folder}" — create it first under Mail Folder Creation`);
    }

    const mail = await InternalMailModel.findOne({ _id: req.params.id, tenantSlug });
    if (!mail) throw new HttpError(404, "Mail not found");

    const previousFolder = mail.folder;
    mail.folder = body.folder;
    await mail.save();

    await refreshFolderCount(tenantSlug, previousFolder);
    await refreshFolderCount(tenantSlug, mail.folder);

    res.json({ data: serializeDocument(mail) });
  })
);

mailRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const mail = await InternalMailModel.findOneAndDelete({ _id: req.params.id, tenantSlug });
    if (!mail) throw new HttpError(404, "Mail not found");

    await refreshFolderCount(tenantSlug, mail.folder);
    await audit("MAIL_DELETED", "internalMail", String(mail._id), { tenantSlug });

    res.json({ data: { success: true } });
  })
);

// Backs the "Mail Folder Creation" screen's Transfer Mail Folder flow
// (sanpharma.info's Mail_Folder_Trans.aspx): preview how many mails sit in
// the "from" folder before transferring, then bulk-move them all to the
// "to" folder in one call, optionally deleting the now-empty "from"
// folder's own mailFolderCreation record afterwards.
mailRouter.get(
  "/transfer-preview",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    if (!from) throw new HttpError(400, "Missing 'from' folder");
    const count = await InternalMailModel.countDocuments({ tenantSlug, folder: from });
    res.json({ data: { count } });
  })
);

const transferSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  deleteAfterTransfer: z.boolean().optional().default(false)
});
mailRouter.post(
  "/transfer",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = transferSchema.parse(req.body);
    if (body.from === body.to) throw new HttpError(400, "From and To folder must differ");
    if (!(await validFolder(tenantSlug, body.to))) {
      throw new HttpError(400, `Unknown folder "${body.to}" — create it first under Mail Folder Creation`);
    }

    const result = await InternalMailModel.updateMany(
      { tenantSlug, folder: body.from },
      { $set: { folder: body.to } }
    );

    await refreshFolderCount(tenantSlug, body.from);
    await refreshFolderCount(tenantSlug, body.to);

    if (body.deleteAfterTransfer && !SYSTEM_FOLDERS.includes(body.from)) {
      const FolderModel = getMasterModel("mailFolderCreation");
      await FolderModel.deleteOne({ tenantSlug, mailFolderName: body.from });
    }

    await audit("MAIL_FOLDER_TRANSFERRED", "internalMail", body.from, {
      tenantSlug,
      to: body.to,
      moved: result.modifiedCount ?? 0
    });

    res.json({ data: { moved: result.modifiedCount ?? 0 } });
  })
);
