// src/models/survey-question.model.ts
// Activity Reports > Survey round -- real backing collection for the
// legacy sanpharma.info "Create - Question" screen
// (Survey_Ques_Creation.aspx). A question bank entry: a control type (one
// of the 4 legacy types) plus type-specific config (maxLength for the two
// Enterable types, a fixed option-label list for the two Selectable
// types), independent of any particular Survey -- Surveys reference these
// by id (see survey.model.ts).

import mongoose, { Schema } from "mongoose";

const surveyQuestionSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    questionText: { type: String, required: true, trim: true },
    controlType: {
      type: String,
      required: true,
      enum: ["Enterable - Text", "Enterable - Numeric", "Selectable - Single", "Selectable- Multiple"]
    },
    // Only set for the two Enterable control types.
    maxLength: { type: Number, default: null },
    // Only set for the two Selectable control types -- the option labels
    // the admin typed into the dynamically-generated numbered boxes.
    options: { type: [String], default: undefined },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

surveyQuestionSchema.index({ tenantSlug: 1, status: 1, createdAt: -1 });

export const SurveyQuestionModel = mongoose.model("SurveyQuestion", surveyQuestionSchema, "surveyQuestions");
