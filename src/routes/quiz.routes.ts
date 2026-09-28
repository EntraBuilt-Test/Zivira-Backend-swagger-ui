import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { QuizModel } from "../models/quiz.model.js";
import { QuizAttemptModel } from "../models/quiz-attempt.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { audit } from "../utils/audit.js";
import { serializeDocument } from "../utils/serialize.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeHeader(h: string) {
  return String(h).trim().toLowerCase().replace(/[\s_.-]+/g, "");
}

function pickField(row: Record<string, unknown>, ...aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const v = row[normalizeHeader(alias)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

// Parses an uploaded "questions" workbook (sanpharma's Quiz Title Creation /
// Upload Questions file) into the same shape quizQuestionSchema expects.
// Expected columns (any of these aliases, case/spacing-insensitive):
// Question, Option1..Option4 (or OptionA..OptionD), Correct Option (1-based
// number, or a letter A-D, or text matching one of the options), Points.
function parseQuestionsWorkbook(buffer: Buffer): { questionText: string; options: string[]; correctOptionIndex: number; points: number }[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });

  const questions: { questionText: string; options: string[]; correctOptionIndex: number; points: number }[] = [];
  for (const raw of rawRows) {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) row[normalizeHeader(k)] = typeof v === "string" ? v.trim() : v;

    const questionText = pickField(row, "question", "questiontext", "quizquestion");
    if (!questionText) continue;

    const options = [
      pickField(row, "option1", "optiona", "option a"),
      pickField(row, "option2", "optionb", "option b"),
      pickField(row, "option3", "optionc", "option c"),
      pickField(row, "option4", "optiond", "option d")
    ].filter((o): o is string => Boolean(o));
    if (options.length < 2) continue;

    const answerRaw = pickField(row, "correctoption", "answer", "correctanswer") ?? "1";
    let correctOptionIndex = 0;
    const asLetter = answerRaw.trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(asLetter)) {
      correctOptionIndex = asLetter.charCodeAt(0) - "A".charCodeAt(0);
    } else if (/^\d+$/.test(answerRaw.trim())) {
      correctOptionIndex = Number(answerRaw.trim()) - 1;
    } else {
      const matchIndex = options.findIndex((o) => o.toLowerCase() === answerRaw.trim().toLowerCase());
      correctOptionIndex = matchIndex >= 0 ? matchIndex : 0;
    }
    correctOptionIndex = Math.min(Math.max(correctOptionIndex, 0), options.length - 1);

    const pointsRaw = pickField(row, "points", "point", "marks");
    const points = pointsRaw ? Number(pointsRaw) || 1 : 1;

    questions.push({ questionText, options, correctOptionIndex, points });
  }
  return questions;
}

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
  questions: z.array(questionSchema).default([]),
  category: z.string().trim().optional().nullable(),
  effectiveDate: z.string().trim().optional().nullable(),
  month: z.string().trim().optional().nullable(),
  year: z.string().trim().optional().nullable()
});

const updateQuizSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  questions: z.array(questionSchema).optional(),
  category: z.string().trim().optional().nullable(),
  effectiveDate: z.string().trim().optional().nullable(),
  month: z.string().trim().optional().nullable(),
  year: z.string().trim().optional().nullable(),
  processFromDate: z.string().trim().optional().nullable(),
  processToDate: z.string().trim().optional().nullable(),
  processed: z.boolean().optional()
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
  // uploadedFileData is the full base64 questions workbook — fine to keep on
  // disk, but never worth shipping in every list/get response; the
  // dedicated download route serves it on demand instead.
  const { uploadedFileData: _uploadedFileData, ...rest } = serialized;
  return {
    ...rest,
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

// POST /company/quiz — sanpharma's "Online Quiz - Title Creation": Quiz
// Title, Quiz Category, Effective Date, Month, Year, and an optional
// questions workbook (multipart "file" field). When a file is supplied its
// rows become the quiz's real, scoreable questions right away — matching
// "if i click upload and click the ok/save button, then it must add the
// data on the [Quiz List] table". Submitting without a file (or as plain
// JSON, for the existing MCQ-authoring flow) still works — `questions`
// defaults to an empty array either way.
quizRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const isMultipart = Boolean(req.file) || typeof req.body?.title === "string";
    const rawBody = isMultipart
      ? {
          title: req.body.title,
          description: req.body.description ?? "",
          category: req.body.category || null,
          effectiveDate: req.body.effectiveDate || null,
          month: req.body.month || null,
          year: req.body.year || null,
          questions: []
        }
      : req.body;
    const body = createQuizSchema.parse(rawBody);

    let questions = body.questions;
    let uploadedFileName: string | null = null;
    let uploadedFileData: string | null = null;
    let uploadedMimeType: string | null = null;
    if (req.file) {
      try {
        const parsed = parseQuestionsWorkbook(req.file.buffer);
        if (parsed.length > 0) questions = parsed;
      } catch {
        // an unparsable file still lets the quiz title get created — the
        // admin can add questions afterwards via Create Questions / Upload
        // Questions rather than losing the whole Save.
      }
      uploadedFileName = req.file.originalname;
      uploadedFileData = req.file.buffer.toString("base64");
      uploadedMimeType = req.file.mimetype || "application/octet-stream";
    }

    const effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : null;

    const created = await QuizModel.create({
      tenantSlug,
      title: body.title,
      description: body.description,
      isActive: body.isActive,
      questions,
      category: body.category ?? null,
      effectiveDate,
      month: body.month ?? null,
      year: body.year ?? null,
      processFromDate: effectiveDate,
      processToDate: effectiveDate,
      uploadedFileName,
      uploadedFileData,
      uploadedMimeType,
      processed: false
    });
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
    if (body.category !== undefined) quiz.set("category", body.category);
    if (body.effectiveDate !== undefined) quiz.set("effectiveDate", body.effectiveDate ? new Date(body.effectiveDate) : null);
    if (body.month !== undefined) quiz.set("month", body.month);
    if (body.year !== undefined) quiz.set("year", body.year);
    if (body.processFromDate !== undefined) quiz.set("processFromDate", body.processFromDate ? new Date(body.processFromDate) : null);
    if (body.processToDate !== undefined) quiz.set("processToDate", body.processToDate ? new Date(body.processToDate) : null);
    if (body.processed !== undefined) quiz.set("processed", body.processed);

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

// POST /company/quiz/:id/questions/upload — sanpharma's per-row "Upload
// Questions" action: replaces this quiz's real questions with whatever the
// uploaded workbook parses to, and keeps the file itself so "Uploaded File"
// in the list can hand it back via the download route below.
quizRouter.post(
  "/:id/questions/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const quiz = await loadQuizOr404(tenantSlug, req.params.id);
    if (!req.file) throw new HttpError(400, "No file uploaded (expected multipart field \"file\")");

    const questions = parseQuestionsWorkbook(req.file.buffer);
    if (questions.length === 0) throw new HttpError(400, "Could not find any valid questions in that file");

    quiz.set("questions", questions);
    quiz.set("uploadedFileName", req.file.originalname);
    quiz.set("uploadedFileData", req.file.buffer.toString("base64"));
    quiz.set("uploadedMimeType", req.file.mimetype || "application/octet-stream");
    await quiz.save();

    await audit("QUIZ_QUESTIONS_UPLOADED", "quiz", String(quiz._id), { tenantSlug, count: questions.length });

    res.json({ data: shapeQuiz(quiz.toObject(), true) });
  })
);

// GET /company/quiz/:id/download — hands back the last uploaded questions
// workbook for this quiz, matching the "Uploaded File" column's file link.
quizRouter.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const quiz = await loadQuizOr404(tenantSlug, req.params.id);
    if (!quiz.get("uploadedFileData")) throw new HttpError(404, "No uploaded file for this quiz");
    const buffer = Buffer.from(quiz.get("uploadedFileData") as string, "base64");
    res.setHeader("Content-Type", (quiz.get("uploadedMimeType") as string) || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(String(quiz.get("uploadedFileName") ?? "questions.xlsx"))}"`);
    res.send(buffer);
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
