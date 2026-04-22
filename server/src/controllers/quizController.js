import { AppError } from "../errors/AppError.js";
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
