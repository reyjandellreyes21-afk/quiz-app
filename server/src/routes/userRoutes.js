import { Router } from "express";
import { clearMyHistory, getMyDashboard, getMyHistory } from "../controllers/historyController.js";
import { listUsers } from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";

const userRouter = Router();

/* Register /me/* before GET "/" so paths are unambiguous. */
userRouter.get("/me/history", requireAuth, getMyHistory);
userRouter.delete("/me/history", requireAuth, clearMyHistory);
userRouter.get("/me/dashboard", requireAuth, getMyDashboard);
userRouter.get("/", requireAuth, listUsers);

export { userRouter };
