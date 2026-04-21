import { AppError } from "../errors/AppError.js";
import { Attempt } from "../models/Attempt.js";
import { Quiz } from "../models/Quiz.js";

const normalizeAnswer = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

export const submitQuizAnswers = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) throw new AppError(404, "Quiz not found.");
    if (quiz.questions.length === 0) throw new AppError(400, "Quiz has no questions.");

    const rawAnswers = req.body.answers || {};
    const answerMap = Array.isArray(rawAnswers)
      ? rawAnswers.reduce((acc, item) => {
          if (item?.questionId) acc[item.questionId] = item.selectedOption;
          return acc;
        }, {})
      : rawAnswers;
    const breakdown = quiz.questions.map((question) => {
      const submittedAnswer = answerMap[question.id.toString()];
      const isCorrect = normalizeAnswer(submittedAnswer) === normalizeAnswer(question.correctAnswer);
      return {
        questionId: question.id.toString(),
        submittedAnswer: submittedAnswer || null,
        correctAnswer: question.correctAnswer,
        isCorrect,
      };
    });

    const total = quiz.questions.length;
    const correctCount = breakdown.filter((entry) => entry.isCorrect).length;
    const scorePercent = Math.round((correctCount / total) * 100);

    const submission = await Attempt.create({
      userId: req.user.id,
      quizId: quiz.id.toString(),
      quizTitle: quiz.title,
      scorePercent,
      correctCount,
      totalQuestions: total,
      durationSec: Number(req.body.durationSec) || 0,
      breakdown,
      submittedAt: new Date(),
    });
    res.status(201).json({
      id: submission.id,
      userId: submission.userId,
      quizId: submission.quizId,
      quizTitle: submission.quizTitle,
      scorePercent: submission.scorePercent,
      correctCount: submission.correctCount,
      totalQuestions: submission.totalQuestions,
      breakdown: submission.breakdown,
      submittedAt: submission.submittedAt,
    });
  } catch (error) {
    next(error);
  }
};
