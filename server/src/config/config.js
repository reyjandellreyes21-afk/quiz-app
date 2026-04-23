import { getSkipDatabaseRequested } from "../../load-env.js";

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || "dev_quiz_secret_change_me",
  jwtExpiresIn: "7d",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/quiz_app",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  /** Dev only: start HTTP server without MongoDB (quiz/auth routes will error until Atlas/local DB works). */
  get skipDatabaseConnect() {
    return getSkipDatabaseRequested();
  },
};
