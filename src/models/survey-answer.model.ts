// src/models/survey-answer.model.ts
// Round 36 Item 2 -- real survey-answer submission pipeline. Before this,
// SurveyModel/SurveyQuestionModel existed (Create - Survey / Create -
// Question) but no field rep had any way to actually answer a survey
// anywhere in the app, and Survey > View's "Answer Wise" mode rendered
// the same placeholder "-" cells as "Question Wise" as a result. One row
// per (survey, question, employee) -- a rep can revisit and update their
// own answer, so submission upserts rather than appending duplicates.
import mongoose, { Schema } from "mongoose";

const surveyAnswerSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    surveyId: { type: String, required: true, trim: true, index: true },
    questionId: { type: String, required: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    // Exactly one of these three is populated, matching the question's
    // real controlType (SurveyQuestionModel.controlType) at answer time.
    answerText: { type: String, trim: true, default: null }, // Enterable - Text
    answerNumeric: { type: Number, default: null }, // Enterable - Numeric
    selectedOptions: { type: [String], default: undefined }, // Selectable - Single / Selectable- Multiple
    submittedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

surveyAnswerSchema.index({ tenantSlug: 1, surveyId: 1, questionId: 1, employeeCode: 1 }, { unique: true });

export const SurveyAnswerModel = mongoose.model("SurveyAnswer", surveyAnswerSchema, "survey_answers");

