import mongoose, { Schema } from "mongoose";

// A single field rep's submitted answers for a Quiz (see quiz.model.ts) plus
// the score computed server-side at submit time in quiz.routes.ts — never
// trust a client-supplied score. `quizId` is stored as a plain string (not
// a Mongoose ref) to match how the rest of this codebase's generic-master
// records cross-reference each other by id string rather than by populate.
const quizAnswerSchema = new Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    selectedOptionIndex: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const quizAttemptSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    quizId: { type: String, required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    answers: { type: [quizAnswerSchema], default: [] },
    score: { type: Number, required: true, default: 0 },
    totalPossible: { type: Number, required: true, default: 0 },
    submittedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

quizAttemptSchema.index({ tenantSlug: 1, quizId: 1, submittedAt: -1 });

export const QuizAttemptModel = mongoose.model("QuizAttempt", quizAttemptSchema, "quiz_attempts");
