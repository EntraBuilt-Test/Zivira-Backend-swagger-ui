import mongoose, { Schema } from "mongoose";

// Round 48 Part D -- "Talk to Us": a field/manager user raises a ticket, admin replies from the inbox.
const replySchema = new Schema(
  { by: { type: String, enum: ["EMPLOYEE", "ADMIN"], required: true }, name: { type: String, default: "" }, message: { type: String, required: true, trim: true }, at: { type: Date, default: Date.now } },
  { _id: false }
);
const talkTicketSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, default: "" },
    designation: { type: String, default: "" },
    hq: { type: String, default: "" },
    subject: { type: String, required: true, trim: true },
    status: { type: String, enum: ["OPEN", "ANSWERED", "CLOSED"], default: "OPEN", index: true },
    replies: { type: [replySchema], default: [] }
  },
  { timestamps: true }
);
talkTicketSchema.index({ tenantSlug: 1, status: 1, updatedAt: -1 });

export const TalkTicketModel = mongoose.model("TalkTicket", talkTicketSchema, "talk_tickets");
