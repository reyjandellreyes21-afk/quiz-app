import { Router } from "express";
import { body } from "express-validator";
import { getMe, googleAuth, login, register } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const authRouter = Router();

authRouter.post(
  "/register",
  [
    body("name").trim().isLength({ min: 2 }),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }),
    validate,
  ],
  register,
);

authRouter.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").isLength({ min: 8 }), validate],
  login,
);

authRouter.post("/google", [body("credential").isString().notEmpty(), validate], googleAuth);
authRouter.get("/me", requireAuth, getMe);

export { authRouter };
