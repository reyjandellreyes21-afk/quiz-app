import { Router } from "express";
import { param } from "express-validator";
import { getAttemptById } from "../controllers/historyController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const attemptRouter = Router();

attemptRouter.get("/:attemptId", requireAuth, [param("attemptId").isMongoId(), validate], getAttemptById);

export { attemptRouter };
