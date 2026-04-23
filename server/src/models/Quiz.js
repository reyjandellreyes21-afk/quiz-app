import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["mcq", "tf", "fill"], default: "mcq" },
    options: [{ type: String, required: true }],
    correctAnswer: { type: String, required: true },
  },
  { _id: true },
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    questions: [questionSchema],
  },
  { timestamps: true },
);

export const Quiz = mongoose.model("Quiz", quizSchema);
