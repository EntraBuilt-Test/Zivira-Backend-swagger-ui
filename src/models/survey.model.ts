// src/models/survey.model.ts
// Activity Reports > Survey round -- real backing collection for the
// legacy sanpharma.info "Create - Survey" / "Update - Survey" screens
// (Survey_Creation.aspx / Survey_Ques_Process.aspx). A Survey is a title +
// a process date range + a set of question references, each carrying its
// own per-question "Process Type" flags (which real-world entity kind --
// Doctor / Chemist / Hospital / Stockist / Product -- that question
// applies to when surveying, matching legacy's Drs./Chm./Hos./Stk./Prd.
// checkboxes exactly).

import mongoose, { Schema } from "mongoose";

const surveyQuestionRefSchema = new Schema(
  {
    questionId: { type: String, required: true },
    drs: { type: Boolean, default: false },
    chm: { type: Boolean, default: false },
    hos: { type: Boolean, default: false },
    stk: { type: Boolean, default: false },
    prd: { type: Boolean, default: false }
  },
  { _id: false }
);

const surveySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    processFromDate: { type: String, required: true }, // 'YYYY-MM-DD'
    processToDate: { type: String, required: true },
    questions: { type: [surveyQuestionRefSchema], default: [] },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    processed: { type: Boolean, default: false },
    processedAt: { type: Date, default: null },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

surveySchema.index({ tenantSlug: 1, createdAt: -1 });

export const SurveyModel = mongoose.model("Survey", surveySchema, "surveys");
