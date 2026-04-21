import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const seedHash = bcrypt.hashSync("password123", 10);
const seedUserId = uuidv4();

export const db = {
  users: [
    {
      id: seedUserId,
      name: "Demo User",
      email: "demo@quiz.app",
      passwordHash: seedHash,
      createdAt: new Date().toISOString(),
    },
  ],
  quizzes: [
    {
      id: "js-basics",
      title: "JavaScript Basics",
      category: "Programming",
      description: "Core JS concepts and syntax.",
      createdBy: seedUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: [
        {
          id: "q-js-1",
          text: "Which keyword declares a block-scoped variable?",
          options: ["var", "let", "define", "static"],
          correctAnswer: "let",
        },
        {
          id: "q-js-2",
          text: "What does strict equality compare?",
          options: ["Only value", "Only type", "Type and value", "Object shape"],
          correctAnswer: "Type and value",
        },
      ],
    },
  ],
  submissions: [],
};
