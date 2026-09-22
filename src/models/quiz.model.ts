import mongoose, { Schema } from "mongoose";

// Real quiz-authoring data model backing the "Quiz List" Options screen
// (previously a headers-only generic-master log with a quizTitle/date/
// noOfQuestions row and no actual question content). An admin authors a
// quiz here as a real set of multiple-choice questions with a correct
// answer and a point value per question; QuizAttemptModel (see
// quiz-attempt.model.ts) stores what a field rep submitted and the score
// computed from it. See quiz.routes.ts for the CRUD + scoring endpoints.
const quizQuestionSchema = new Schema(
  {
    questionText: { type: String, required: true, trim: true },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length >= 2,
        message: "Each question needs at least 2 options"
      }
    },
    correctOptionIndex: { type: Number, required: true, min: 0 },
    points: { type: Number, required: true, min: 0, default: 1 }
  },
  { _id: false }
);

const quizSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    questions: { type: [quizQuestionSchema], default: [] }
  },
  { timestamps: true }
);

quizSchema.index({ tenantSlug: 1, title: 1 });

export const QuizModel = mongoose.model("Quiz", quizSchema, "quizzes");
