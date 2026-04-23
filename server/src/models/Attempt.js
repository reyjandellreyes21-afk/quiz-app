import mongoose from "mongoose";

const breakdownSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    submittedAnswer: { type: String, default: null },
    correctAnswer: { type: String, required: true },
    isCorrect: { type: Boolean, required: true },
  },
  { _id: false },
);

const attemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    quizTitle: { type: String, required: true },
    scorePercent: { type: Number, required: true },
    correctCount: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    durationSec: { type: Number, default: 0 },
    breakdown: [breakdownSchema],
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

attemptSchema.index({ userId: 1, submittedAt: -1 });
attemptSchema.index({ quizId: 1, submittedAt: -1 });

export const Attempt = mongoose.model("Attempt", attemptSchema);
