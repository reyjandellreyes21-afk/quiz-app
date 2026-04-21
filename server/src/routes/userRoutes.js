import { Router } from "express";
import { getMyDashboard, getMyHistory } from "../controllers/historyController.js";
import { requireAuth } from "../middleware/auth.js";

const userRouter = Router();

userRouter.get("/me/history", requireAuth, getMyHistory);
userRouter.get("/me/dashboard", requireAuth, getMyDashboard);

export { userRouter };
