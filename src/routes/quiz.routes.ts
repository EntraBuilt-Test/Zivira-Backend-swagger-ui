import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { QuizModel } from "../models/quiz.model.js";
import { QuizAttemptModel } from "../models/quiz-attempt.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { audit } from "../utils/audit.js";
import { serializeDocument } from "../utils/serialize.js";

// Real quiz-authoring + scoring system backing the "Quiz List" Options
// screen (previously a headers-only generic-master log — quizTitle/date/
// noOfQuestions rows with no actual question content, no way to take a
// quiz, and no scoring). Mounted at /company/quiz (see company.routes.ts),
// same requireAuth+requireCompanyAdmin gate as every other Admin route —
// every query below is scoped to req.auth.tenantSlug, same as mail.routes.ts
// and masters-actions.routes.ts.
export const quizRouter = Router();

const questionSchema = z
  .object({
    questionText: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correctOptionIndex: z.number().int().min(0),
    points: z.number().min(0).default(1)
  })
  .refine((q) => q.correctOptionIndex < q.options.length, {
    message: "correctOptionIndex must be a valid index into options"
  });

const createQuizSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  isActive: z.boolean().default(true),
  questions: z.array(questionSchema).default([])
});

const updateQuizSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  questions: z.array(questionSchema).optional()
});

const submitAttemptSchema = z.object({
  employeeCode: z.string().min(1),
  answers: z.array(
    z.object({
      questionIndex: z.number().int().min(0),
      selectedOptionIndex: z.number().int().min(0)
    })
  )
});

// Shapes a Quiz document for a response. `includeAnswers: true` (the admin
// view — GET one/list, and what the create/update endpoints echo back) keeps
// each question's correctOptionIndex; `includeAnswers: false` strips it,
// leaving only questionText/options/points. Nothing rep-facing is wired up
// yet (see quiz-authoring-panel.tsx's header comment / the session report),
// but every place that will eventually serve a field rep taking the quiz
// should call this with includeAnswers: false rather than re-deriving its
// own shape.
function shapeQuiz(quiz: Record<string, unknown>, includeAnswers: boolean) {
  const serialized = serializeDocument(quiz as never) as Record<string, unknown>;
  const questions = Array.isArray(serialized.questions) ? (serialized.questions as Record<string, unknown>[]) : [];
  return {
    ...serialized,
    questions: questions.map((q) =>
      includeAnswers
        ? q
        : {
            questionText: q.questionText,
            options: q.options,
            points: q.points
          }
    )
  };
}

async function loadQuizOr404(tenantSlug: string, id: string) {
  const quiz = await QuizModel.findOne({ _id: id, tenantSlug });
  if (!quiz) throw new HttpError(404, "Quiz not found");
  return quiz;
}

// POST /company/quiz — admin authors a new quiz.
quizRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = createQuizSchema.parse(req.body);

    const created = await QuizModel.create({ ...body, tenantSlug });
    await audit("QUIZ_CREATED", "quiz", String(created._id), { tenantSlug, title: created.title });

    res.status(201).json({ data: shapeQuiz(created.toObject(), true) });
  })
);

// GET /company/quiz — list this tenant's quizzes (admin view).
quizRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const quizzes = await QuizModel.find({ tenantSlug }).sort({ createdAt: -1 });
    res.json({ data: quizzes.map((q) => shapeQuiz(q.toObject(), true)) });
  })
);

// GET /company/quiz/:id — one quiz WITH correct answers (admin view).
quizRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const quiz = await loadQuizOr404(tenantSlug, req.params.id);
    res.json({ data: shapeQuiz(quiz.toObject(), true) });
  })
);

// PUT /company/quiz/:id — update a quiz's questions/metadata.
quizRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = updateQuizSchema.parse(req.body);
    const quiz = await loadQuizOr404(tenantSlug, req.params.id);

    if (body.title !== undefined) quiz.title = body.title;
    if (body.description !== undefined) quiz.description = body.description;
    if (body.isActive !== undefined) quiz.isActive = body.isActive;
    if (body.questions !== undefined) quiz.set("questions", body.questions);

    await quiz.save();
    await audit("QUIZ_UPDATED", "quiz", String(quiz._id), { tenantSlug });

    res.json({ data: shapeQuiz(quiz.toObject(), true) });
  })
);

// DELETE /company/quiz/:id — delete a quiz (and its attempts, so results
// don't outlive the quiz they scored against).
quizRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const quiz = await loadQuizOr404(tenantSlug, req.params.id);

    await QuizModel.deleteOne({ _id: quiz._id, tenantSlug });
    await QuizAttemptModel.deleteMany({ tenantSlug, quizId: String(quiz._id) });
    await audit("QUIZ_DELETED", "quiz", String(quiz._id), { tenantSlug });

    res.json({ data: { success: true } });
  })
);

// POST /company/quiz/:id/attempts — submit an attempt. The score is always
// computed here, server-side, from the quiz's own stored correctOptionIndex
// values — a client can send whatever `answers` it likes, but it can never
// hand up its own score.
quizRouter.post(
  "/:id/attempts",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = submitAttemptSchema.parse(req.body);
    const quiz = await loadQuizOr404(tenantSlug, req.params.id);

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode }).lean();
    if (!employee) throw new HttpError(404, "Employee not found");

    const questions = quiz.questions as unknown as Array<{ correctOptionIndex: number; points: number }>;
    const totalPossible = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);

    let score = 0;
    for (const answer of body.answers) {
      const question = questions[answer.questionIndex];
      if (!question) continue;
      if (answer.selectedOptionIndex === question.correctOptionIndex) {
        score += question.points ?? 0;
      }
    }

    const attempt = await QuizAttemptModel.create({
      tenantSlug,
      quizId: String(quiz._id),
      employeeCode: body.employeeCode,
      answers: body.answers,
      score,
      totalPossible,
      submittedAt: new Date()
    });

    await audit("QUIZ_ATTEMPT_SUBMITTED", "quizAttempt", String(attempt._id), {
      tenantSlug,
      quizId: String(quiz._id),
      employeeCode: body.employeeCode,
      score,
      totalPossible
    });

    res.status(201).json({ data: serializeDocument(attempt) });
  })
);

// GET /company/quiz/:id/attempts — list attempts + scores for a quiz, for
// the admin results view.
quizRouter.get(
  "/:id/attempts",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    await loadQuizOr404(tenantSlug, req.params.id);

    const attempts = await QuizAttemptModel.find({ tenantSlug, quizId: req.params.id }).sort({ submittedAt: -1 });
    res.json({ data: attempts.map((a) => serializeDocument(a)) });
  })
);
