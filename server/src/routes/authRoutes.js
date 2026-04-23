import { Router } from "express";
import { body } from "express-validator";
import { getMe, googleAuth, login, register, updateMe } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const authRouter = Router();

authRouter.post(
  "/register",
  [
    body("username").trim().isLength({ min: 3 }),
    body("country").trim().notEmpty(),
    body("age").isInt({ min: 13, max: 120 }),
    body("acceptedTerms").isBoolean().custom((value) => value === true),
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
authRouter.patch("/me", requireAuth, updateMe);

export { authRouter };
