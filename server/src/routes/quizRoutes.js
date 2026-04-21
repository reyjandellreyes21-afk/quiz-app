import { Router } from "express";
import { body } from "express-validator";
import {
  createQuestion,
  createQuiz,
  createQuizWithQuestions,
  deleteQuestion,
  deleteQuiz,
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
  body("text").trim().isLength({ min: 5 }),
  body("options").isArray({ min: 2 }),
  body("correctAnswer").isString().trim().notEmpty(),
  validate,
];

const quizRouter = Router();

quizRouter.get("/", listQuizzes);
quizRouter.get("/:quizId", getQuizByIdForPlay);
quizRouter.get("/:quizId/questions", listQuizQuestions);
quizRouter.post(
  "/",
  requireAuth,
  [body("title").trim().isLength({ min: 3 }), body("category").trim().isLength({ min: 2 }), validate],
  createQuiz,
);
quizRouter.post(
  "/with-questions",
  requireAuth,
  [
    body("title").trim().isLength({ min: 3 }),
    body("category").trim().isLength({ min: 2 }),
    body("questions").isArray({ min: 1 }),
    body("questions.*.text").trim().isLength({ min: 5 }),
    body("questions.*.options").isArray({ min: 2 }),
    body("questions.*.correctAnswer").isString().trim().notEmpty(),
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
    body("text").optional().trim().isLength({ min: 5 }),
    body("options").optional().isArray({ min: 2 }),
    body("correctAnswer").optional().isString().trim().notEmpty(),
    validate,
  ],
  updateQuestion,
);
quizRouter.delete("/:quizId/questions/:questionId", requireAuth, deleteQuestion);

quizRouter.post("/:quizId/submissions", requireAuth, [body("answers").isObject(), validate], submitQuizAnswers);

export { quizRouter };
