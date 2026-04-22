import { AppError } from "../errors/AppError.js";
import { config } from "../config/config.js";
import { sanitizeQuizForList, sanitizeQuizForPlayer } from "../utils/sanitize.js";
import { Quiz } from "../models/Quiz.js";

const getQuizById = async (id) => {
  const quiz = await Quiz.findById(id);
  if (!quiz) throw new AppError(404, "Quiz not found.");
  return quiz;
};

export const listQuizzes = async (req, res, next) => {
  try {
  const { category } = req.query;
  const query = category ? { category } : {};
  const quizzes = await Quiz.find(query).sort({ createdAt: -1 });
  res.json(quizzes.map((quiz) => sanitizeQuizForList(quiz.toObject())));
  } catch (error) {
    next(error);
  }
};

export const getQuizByIdForPlay = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    res.json(sanitizeQuizForPlayer(quiz.toObject()));
  } catch (error) {
    next(error);
  }
};

export const listQuizQuestions = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    const canViewAnswers = req.user && quiz.createdBy.toString() === req.user.id;
    if (canViewAnswers) {
      return res.json(quiz.questions);
    }
    return res.json(
      quiz.questions.map((question) => ({
        id: question.id,
        text: question.text,
        kind: question.kind || "mcq",
        options: question.options ?? [],
      })),
    );
  } catch (error) {
    next(error);
  }
};

export const createQuiz = async (req, res, next) => {
  try {
  const { title, category, description = "" } = req.body;
  const quiz = await Quiz.create({
    title,
    category,
    description,
    createdBy: req.user.id,
    questions: [],
  });
  const payload = sanitizeQuizForList(quiz.toObject());
  res.status(201).json({
    ...payload,
    id: payload.id || quiz._id.toString(),
    _id: payload._id || quiz._id.toString(),
  });
  } catch (error) {
    next(error);
  }
};

export const createQuizWithQuestions = async (req, res, next) => {
  try {
    const { title, category, description = "", questions = [] } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new AppError(422, "At least one question is required.");
    }

    const preparedQuestions = questions.map((question) => {
      const kind = question.kind === "fill" ? "fill" : question.kind === "tf" ? "tf" : "mcq";
      if (kind === "fill") {
        return {
          text: question.text,
          kind: "fill",
          options: [],
          correctAnswer: question.correctAnswer,
        };
      }
      return {
        text: question.text,
        kind,
        options: question.options,
        correctAnswer: question.correctAnswer,
      };
    });

    const quiz = await Quiz.create({
      title,
      category,
      description,
      createdBy: req.user.id,
      questions: preparedQuestions,
    });

    const payload = sanitizeQuizForList(quiz.toObject());
    res.status(201).json({
      ...payload,
      id: payload.id || quiz._id.toString(),
      _id: payload._id || quiz._id.toString(),
    });
  } catch (error) {
    next(error);
  }
};

const normalizeGeneratedKind = (value) => {
  if (value === "tf") return "tf";
  if (value === "fill") return "fill";
  return "mcq";
};

const cleanGeneratedQuestions = (rawQuestions = [], requestedCount = 5) => {
  const cleaned = [];
  for (const raw of rawQuestions) {
    if (cleaned.length >= requestedCount) break;
    const text = String(raw?.text || "").trim();
    if (text.length < 5) continue;
    const kind = normalizeGeneratedKind(raw?.kind);
    if (kind === "fill") {
      const correctAnswer = String(raw?.correctAnswer || "").trim();
      if (!correctAnswer) continue;
      cleaned.push({ text, kind: "fill", options: [], correctAnswer });
      continue;
    }
    let options = Array.isArray(raw?.options) ? raw.options.map((opt) => String(opt || "").trim()).filter(Boolean) : [];
    if (kind === "tf") {
      options = ["True", "False"];
    }
    if (options.length < 2) continue;
    const correctAnswer = String(raw?.correctAnswer || "").trim();
    if (!correctAnswer || !options.includes(correctAnswer)) continue;
    cleaned.push({ text, kind, options, correctAnswer });
  }
  return cleaned;
};

export const generateQuizQuestions = async (req, res, next) => {
  try {
    if (!config.geminiApiKey) {
      throw new AppError(503, "Gemini is not configured. Add GEMINI_API_KEY in server/.env and restart the API.");
    }

    const title = String(req.body.title || "").trim();
    const category = String(req.body.category || "").trim();
    const description = String(req.body.description || "").trim();
    const questionCount = Math.min(20, Math.max(1, Number(req.body.questionCount) || 5));

    const prompt = [
      "You are generating quiz questions for a learning app.",
      `Topic title: ${title}`,
      `Category: ${category}`,
      `Description: ${description || "No description provided."}`,
      `Generate exactly ${questionCount} questions.`,
      "Output strict JSON only (no markdown, no explanation) using this shape:",
      '{"questions":[{"text":"...","kind":"mcq|tf|fill","options":["..."],"correctAnswer":"..."}]}',
      "Rules:",
      "- text must be at least 5 characters.",
      "- For kind=mcq, include 4 options and correctAnswer must match one option exactly.",
      "- For kind=tf, options must be [\"True\",\"False\"], and correctAnswer must be either \"True\" or \"False\".",
      "- For kind=fill, options must be an empty array and correctAnswer must be non-empty.",
      "- Keep language clear and suitable for students.",
    ].join("\n");

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const payload = await geminiResponse.json().catch(() => null);
    if (!geminiResponse.ok) {
      const providerMessage = payload?.error?.message || `Gemini request failed (${geminiResponse.status}).`;
      throw new AppError(502, providerMessage);
    }

    const rawText = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("").trim();
    if (!rawText) {
      throw new AppError(502, "Gemini returned an empty response.");
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new AppError(502, "Gemini response could not be parsed as JSON.");
    }

    const questions = cleanGeneratedQuestions(parsed?.questions, questionCount);
    if (!questions.length) {
      throw new AppError(502, "Gemini returned no valid questions. Try a clearer topic or description.");
    }

    res.json({ questions });
  } catch (error) {
    next(error);
  }
};

export const updateQuiz = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (quiz.createdBy.toString() !== req.user.id) throw new AppError(403, "You can only edit your own quiz.");

    const { title, category, description } = req.body;
    if (title !== undefined) quiz.title = title;
    if (category !== undefined) quiz.category = category;
    if (description !== undefined) quiz.description = description;
    await quiz.save();
    res.json(sanitizeQuizForList(quiz.toObject()));
  } catch (error) {
    next(error);
  }
};

export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (quiz.createdBy.toString() !== req.user.id) throw new AppError(403, "You can only delete your own quiz.");
    await quiz.deleteOne();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const createQuestion = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (quiz.createdBy.toString() !== req.user.id) throw new AppError(403, "You can only edit your own quiz.");
    const kind = req.body.kind === "fill" ? "fill" : req.body.kind === "tf" ? "tf" : "mcq";

    const question = {
      text: req.body.text,
      kind,
      options: kind === "fill" ? [] : req.body.options,
      correctAnswer: req.body.correctAnswer,
    };
    quiz.questions.push(question);
    await quiz.save();
    res.status(201).json(quiz.questions.at(-1));
  } catch (error) {
    next(error);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (quiz.createdBy.toString() !== req.user.id) throw new AppError(403, "You can only edit your own quiz.");
    const question = quiz.questions.id(req.params.questionId);
    if (!question) throw new AppError(404, "Question not found.");

    const { text, options, correctAnswer, kind } = req.body;
    if (text !== undefined) question.text = text;
    if (kind !== undefined) question.kind = kind;
    const effectiveKind = question.kind === "fill" ? "fill" : question.kind === "tf" ? "tf" : "mcq";
    if (effectiveKind === "fill") {
      question.options = [];
    } else if (options !== undefined) {
      question.options = options;
    }
    if (correctAnswer !== undefined) question.correctAnswer = correctAnswer;
    await quiz.save();
    res.json(question);
  } catch (error) {
    next(error);
  }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const quiz = await getQuizById(req.params.quizId);
    if (quiz.createdBy.toString() !== req.user.id) throw new AppError(403, "You can only edit your own quiz.");
    const question = quiz.questions.id(req.params.questionId);
    if (!question) throw new AppError(404, "Question not found.");

    question.deleteOne();
    await quiz.save();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
