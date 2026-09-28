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
    questions: { type: [quizQuestionSchema], default: [] },

    // sanpharma.info's "Online Quiz - Title Creation" fields, kept alongside
    // the real MCQ authoring above so the "Quiz List" table can match
    // sanpharma's exact columns (Quiz Title/Created On/Process From-To
    // Date/No Of Questions/Uploaded File/Status/Processed) while still
    // being backed by real, scoreable questions rather than a headers-only
    // log row.
    category: { type: String, trim: true, default: null }, // matches a Quiz Category master (quizCategoryList) entry
    effectiveDate: { type: Date, default: null },
    month: { type: String, trim: true, default: null },
    year: { type: String, trim: true, default: null },
    processFromDate: { type: Date, default: null },
    processToDate: { type: Date, default: null },
    uploadedFileName: { type: String, trim: true, default: null },
    uploadedFileData: { type: String, default: null }, // base64 of the last uploaded questions workbook
    uploadedMimeType: { type: String, trim: true, default: null },
    processed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

quizSchema.index({ tenantSlug: 1, title: 1 });

export const QuizModel = mongoose.model("Quiz", quizSchema, "quizzes");
