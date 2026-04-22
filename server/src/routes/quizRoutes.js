import { Router } from "express";
import { body } from "express-validator";
import {
  createQuestion,
  createQuiz,
  createQuizWithQuestions,
  deleteQuestion,
  deleteQuiz,
  generateQuizQuestions,
  getQuizByIdForPlay,
  listQuizQuestions,
  listQuizzes,
  updateQuestion,
  updateQuiz,
} from "../controllers/quizController.js";
import { submitQuizAnswers } from "../controllers/submissionController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const questionValidators = [
  body("text").trim().isLength({ min: 5 }).withMessage("Question text must be at least 5 characters."),
  body("kind").optional().isIn(["mcq", "tf", "fill"]).withMessage("Question type must be multiple choice, true/false, or fill in the blank."),
  body("correctAnswer").isString().trim().notEmpty().withMessage("Correct answer is required."),
  body().custom((_value, { req }) => {
    const kind = req.body.kind === "fill" ? "fill" : req.body.kind === "tf" ? "tf" : "mcq";
    if (kind === "fill") return true;
    if (!Array.isArray(req.body.options) || req.body.options.length < 2) {
      throw new Error("Please provide at least 2 options.");
    }
    if (!req.body.options.every((o) => typeof o === "string" && o.trim().length >= 1)) {
      throw new Error("Options cannot be empty.");
    }
    return true;
  }),
  validate,
];

const quizRouter = Router();

quizRouter.get("/", listQuizzes);
quizRouter.get("/:quizId", getQuizByIdForPlay);
quizRouter.get("/:quizId/questions/manage", requireAuth, listQuizQuestions);
quizRouter.get("/:quizId/questions", listQuizQuestions);
quizRouter.post(
  "/",
  requireAuth,
  [
    body("title").trim().isLength({ min: 3 }).withMessage("Quiz title must be at least 3 characters."),
    body("category").trim().isLength({ min: 2 }).withMessage("Category must be at least 2 characters."),
    validate,
  ],
  createQuiz,
);
quizRouter.post(
  "/generate",
  requireAuth,
  [
    body("title").trim().isLength({ min: 3 }).withMessage("Quiz title must be at least 3 characters."),
    body("category").trim().isLength({ min: 2 }).withMessage("Category must be at least 2 characters."),
    body("description").optional().isString(),
    body("questionCount")
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage("Question count must be between 1 and 20."),
    validate,
  ],
  generateQuizQuestions,
);
quizRouter.post(
  "/with-questions",
  requireAuth,
  [
    body("title").trim().isLength({ min: 3 }).withMessage("Quiz title must be at least 3 characters."),
    body("category").trim().isLength({ min: 2 }).withMessage("Category must be at least 2 characters."),
    body("questions").isArray({ min: 1 }).withMessage("Add at least 1 question."),
    body("questions.*.text").trim().isLength({ min: 5 }).withMessage("Each question text must be at least 5 characters."),
    body("questions.*.kind")
      .optional()
      .isIn(["mcq", "tf", "fill"])
      .withMessage("Question type must be multiple choice, true/false, or fill in the blank."),
    body("questions.*.correctAnswer").isString().trim().notEmpty().withMessage("Each question needs a correct answer."),
    body("questions").custom((questions) => {
      if (!Array.isArray(questions)) return false;
      for (const q of questions) {
        const kind = q.kind === "fill" ? "fill" : q.kind === "tf" ? "tf" : "mcq";
        if (kind === "fill") continue;
        if (!Array.isArray(q.options) || q.options.length < 2) return false;
        if (!q.options.every((o) => typeof o === "string" && o.trim().length >= 1)) return false;
      }
      return true;
    }).withMessage("Multiple-choice and true/false questions need at least two non-empty options."),
    validate,
  ],
  createQuizWithQuestions,
);
quizRouter.put("/:quizId", requireAuth, updateQuiz);
quizRouter.delete("/:quizId", requireAuth, deleteQuiz);

quizRouter.post("/:quizId/questions", requireAuth, questionValidators, createQuestion);
quizRouter.put(
  "/:quizId/questions/:questionId",
  requireAuth,
  [
    body("text").optional().trim().isLength({ min: 5 }).withMessage("Question text must be at least 5 characters."),
    body("kind").optional().isIn(["mcq", "tf", "fill"]).withMessage("Question type must be multiple choice, true/false, or fill in the blank."),
    body("correctAnswer").optional().isString().trim().notEmpty().withMessage("Correct answer is required."),
    body().custom((_value, { req }) => {
      if (req.body.options === undefined && req.body.kind === undefined) return true;
      const kind = req.body.kind === "fill" ? "fill" : req.body.kind === "tf" ? "tf" : "mcq";
      if (kind === "fill") return true;
      if (req.body.options === undefined) return true;
      if (!Array.isArray(req.body.options) || req.body.options.length < 2) {
        throw new Error("Please provide at least 2 options.");
      }
      if (!req.body.options.every((o) => typeof o === "string" && o.trim().length >= 1)) {
        throw new Error("Options cannot be empty.");
      }
      return true;
    }),
    validate,
  ],
  updateQuestion,
);
quizRouter.delete("/:quizId/questions/:questionId", requireAuth, deleteQuestion);

quizRouter.post(
  "/:quizId/submissions",
  requireAuth,
  [body("answers").isObject().withMessage("Answers payload must be an object."), validate],
  submitQuizAnswers,
);

export { quizRouter };
