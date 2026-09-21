// src/utils/notify.ts
// Lightweight notification helper. Every notification below is best-effort
// and non-blocking for the caller — a notify failure must never fail the
// action that triggered it (approving a DCR still succeeds even if the
// email send throws).
//
// Two channels:
//  1. In-app: a targeted (or broadcast) Notice document each portal polls
//     via its own GET .../notices endpoint (field.routes.ts,
//     manager.routes.ts, company.routes.ts).
//  2. Email — tried in this order:
//       a) SendGrid (HTTPS API) if SENDGRID_API_KEY + SENDGRID_FROM_EMAIL
//          are configured — this is now the primary channel. Only needs a
//          verified *single sender* (no DNS/domain needed) and works from
//          Render's free tier since it's a plain HTTPS call, not SMTP.
//       b) Resend (HTTPS API) if RESEND_API_KEY is configured — kept as a
//          fallback, though Resend's unverified resend.dev domain can only
//          deliver to the Resend account's own email until a real domain
//          is verified there.
//       c) Gmail SMTP (nodemailer) if GMAIL_USER + GMAIL_APP_PASSWORD are
//          configured — tried LAST on purpose. Render's free web services
//          block outbound SMTP ports, so this will reliably time out
//          (ETIMEDOUT) rather than fail fast; it's kept only in case this
//          ever runs somewhere SMTP isn't blocked. Trying it last avoids
//          adding that timeout delay in front of a channel that actually
//          works.
//     If nothing is configured, this just logs, so callers can always
//     await sendEmail() without special-casing "email isn't set up" in
//     every route.

import nodemailer from "nodemailer";
import { NoticeModel } from "../models/notice.model.js";

// New request item 2 — the HR portal's public login URL, sent in the
// personal-email onboarding link below. Overridable via env so a staging
// deploy can point at its own URL without a code change.
const ZIVIRA_HR_PORTAL_URL = process.env.ZIVIRA_HR_PORTAL_URL || "https://zivira-hr.vercel.app/";

let gmailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getGmailTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  // Cache the transporter — nodemailer pools SMTP connections internally,
  // creating a fresh one per email would be wasteful under any real volume.
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass }
    });
  }
  return gmailTransporter;
}

// Core email sender shared by every notify* helper below. Tries SendGrid,
// then Resend, then Gmail SMTP last (see the comment block above for why),
// then just logs.
async function sendEmail(params: { to: string; toName?: string | null; subject: string; text: string }) {
  const { to, toName, subject, text } = params;
  const fromName = process.env.EMAIL_FROM_NAME ?? "Zivira Labs";

  const sendGridKey = process.env.SENDGRID_API_KEY;
  const sendGridFrom = process.env.SENDGRID_FROM_EMAIL;
  if (sendGridKey && sendGridFrom) {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${sendGridKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to, name: toName ?? undefined }] }],
          from: { email: sendGridFrom, name: fromName },
          subject,
          content: [{ type: "text/plain", value: text }]
        })
      });
      if (response.ok) return;
      console.error("[Notify] SendGrid email failed:", response.status, await response.text());
      // Fall through to Resend/Gmail rather than silently dropping the
      // email — e.g. a not-yet-verified sender shouldn't lose the message
      // if another channel is available.
    } catch (err) {
      console.error("[Notify] SendGrid email error:", err);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "noreply@zivira-labs.com", to, subject, text })
      });
      if (response.ok) return;
      console.error("[Notify] Resend email failed:", response.status, await response.text());
    } catch (err) {
      console.error("[Notify] Resend email error:", err);
    }
  }

  const gmail = getGmailTransporter();
  if (gmail) {
    try {
      await gmail.sendMail({
        from: `"${fromName}" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text
      });
      return;
    } catch (err) {
      console.error("[Notify] Gmail SMTP send failed:", err);
    }
  }

  console.log(`[Notify] (email skipped — no SENDGRID_API_KEY/SENDGRID_FROM_EMAIL, GMAIL_USER/GMAIL_APP_PASSWORD, or RESEND_API_KEY configured) → ${toName ?? ""} <${to}>: ${subject} — ${text}`);
}

// Item 3 — generic cross-portal broadcast. Used wherever ONE change should
// be visible to a whole audience rather than one targeted person (e.g. every
// masters.routes.ts write — "if the admin changes some things, it must send
// a notification for the respected manager, hr, field repo"). audience
// "ALL" is picked up by both GET /field/notices and GET /manager/notices;
// HR shares the Admin portal's own login (COMPANY_ADMIN), so it already
// sees these via the pre-existing GET /company/activity audit feed and
// needs no separate broadcast here.
export async function broadcastNotice(params: {
  tenantSlug: string;
  audience: "ALL" | "MR" | "MANAGER" | "ADMIN";
  title: string;
  message: string;
  priority?: "NORMAL" | "URGENT";
}) {
  const { tenantSlug, audience, title, message, priority } = params;
  try {
    await NoticeModel.create({
      tenantSlug,
      title,
      message,
      audience,
      priority: priority ?? "NORMAL",
      postedBy: "system"
    });
  } catch (err) {
    console.error("[Notify] Failed to broadcast notice:", err);
  }
}

// Plain best-effort email to an employee (onboarding document
// approved/rejected, credentials, etc.) — same channel as notifyManager
// below, without the in-app Notice side-effect (the Notice model's audience
// enum is field-force specific and doesn't include a per-employee HR
// audience).
export async function notifyEmployeeEmail(params: {
  toEmail?: string | null;
  toName?: string | null;
  subject: string;
  message: string;
}) {
  const { toEmail, toName, subject, message } = params;
  if (!toEmail) {
    console.log(`[Notify] (no email on file) → ${toName ?? "employee"}: ${subject}`);
    return;
  }

  await sendEmail({
    to: toEmail,
    toName,
    subject: `[Zivira HR] ${subject}`,
    text: `Hi ${toName ?? "there"},\n\n${message}\n\nLogin to the Zivira HR portal to view details.\n\nZivira Labs`
  });
}

// Item 2 — "once we click the trigger onboarding on the hr portal it must
// send an email for the respected gmail, the hr add while creating the add
// new employee." Sends the new EMPLOYEE-portal login credentials directly to
// the employee's own email on file (Employee Master's `email` field, set by
// HR when they created the employee) rather than requiring HR to relay them
// manually — see the trigger-mail route in company.routes.ts.
export async function notifyOnboardingCredentials(params: {
  toEmail?: string | null;
  toName?: string | null;
  username: string;
  tempPassword: string;
}) {
  const { toEmail, toName, username, tempPassword } = params;
  if (!toEmail) {
    console.log(`[Notify] (no email on file — cannot send onboarding mail) → ${toName ?? username}`);
    return;
  }

  await sendEmail({
    to: toEmail,
    toName,
    subject: "[Zivira HR] Welcome — complete your onboarding",
    text:
      `Hi ${toName ?? "there"},\n\n` +
      `HR has generated your onboarding on the Zivira Employee portal. Use the credentials below to log in and complete your onboarding form:\n\n` +
      `Username: ${username}\n` +
      `Temporary Password: ${tempPassword}\n\n` +
      `You'll be asked to set your own password on first login. Please complete your onboarding at the earliest.\n\n` +
      `Zivira Labs`
  });
}

// New request item 2 — "on the hr portal create a new text tab with the
// name of personal email. once the hr saved and click the trigger
// onboarding, then immediately the personal email must be send with the
// link: https://zivira-hr.vercel.app/, and the new employee code + temp
// password." A SEPARATE send, alongside notifyOnboardingCredentials above
// (which still goes to the official `email` field) — this one targets the
// employee's personal address on file (`personalEmail`) and always
// includes the portal link + the human-readable employee code, matching
// the exact wording HR asked for. Additive only: trigger-mail keeps
// sending the existing official-email message unchanged; this fires only
// when a personalEmail is on file.
export async function notifyPersonalOnboardingLink(params: {
  toEmail?: string | null;
  toName?: string | null;
  employeeCode: string;
  tempPassword: string;
}) {
  const { toEmail, toName, employeeCode, tempPassword } = params;
  if (!toEmail) {
    console.log(`[Notify] (no personal email on file — skipping personal onboarding mail) → ${toName ?? employeeCode}`);
    return;
  }

  await sendEmail({
    to: toEmail,
    toName,
    subject: "[Zivira HR] Welcome — your Zivira HR portal login",
    text:
      `Hi ${toName ?? "there"},\n\n` +
      `HR has generated your onboarding on the Zivira Employee portal. Log in here:\n\n` +
      `${ZIVIRA_HR_PORTAL_URL}\n\n` +
      `Employee Code: ${employeeCode}\n` +
      `Temporary Password: ${tempPassword}\n\n` +
      `You'll be asked to set your own password on first login. Please complete your onboarding at the earliest.\n\n` +
      `Zivira Labs`
  });
}

// Item 1 (field-force notification system) — used by manager.routes.ts
// whenever a manager takes an action that affects one specific field rep's
// own record (DCR approve/reject, Tour Plan approve/reject/void/reassign,
// Expense Claim approve/reject). Mirrors notifyManager's shape: an in-app
// Notice the field rep's portal can poll (GET /field/notices), targeted via
// audience "MR" + targetEmployeeCode, plus the same best-effort email
// channel already used for onboarding document notices.
export async function notifyFieldRep(params: {
  tenantSlug: string;
  employeeCode: string;
  employeeEmail?: string | null;
  employeeName?: string | null;
  title: string;
  message: string;
}) {
  const { tenantSlug, employeeCode, employeeEmail, employeeName, title, message } = params;

  try {
    await NoticeModel.create({
      tenantSlug,
      title,
      message,
      audience: "MR",
      priority: "NORMAL",
      postedBy: "system",
      targetEmployeeCode: employeeCode
    });
  } catch (err) {
    console.error("[Notify] Failed to create in-app notice for field rep:", err);
  }

  await notifyEmployeeEmail({ toEmail: employeeEmail, toName: employeeName, subject: title, message });
}

export async function notifyManager(params: {
  tenantSlug: string;
  managerEmployeeCode: string;
  managerEmail?: string | null;
  managerName?: string | null;
  title: string;
  message: string;
}) {
  const { tenantSlug, managerEmployeeCode, managerEmail, managerName, title, message } = params;

  try {
    await NoticeModel.create({
      tenantSlug,
      title,
      message,
      audience: "MANAGER",
      priority: "URGENT",
      postedBy: "system",
      targetEmployeeCode: managerEmployeeCode
    });
  } catch (err) {
    console.error("[Notify] Failed to create in-app notice:", err);
  }

  if (!managerEmail) return;

  await sendEmail({
    to: managerEmail,
    toName: managerName,
    subject: `[Zivira] ${title}`,
    text: `Hi ${managerName ?? managerEmployeeCode},\n\n${message}\n\nLogin at your Manager portal to view details.\n\nZivira Labs`
  });
}
