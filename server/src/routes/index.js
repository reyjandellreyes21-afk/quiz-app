import { Router } from "express";
import { attemptRouter } from "./attemptRoutes.js";
import { authRouter } from "./authRoutes.js";
import { quizRouter } from "./quizRoutes.js";
import { userRouter } from "./userRoutes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/quizzes", quizRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/attempts", attemptRouter);

export { apiRouter };
