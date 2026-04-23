import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";
import { config } from "./config/config.js";
import { clearMyHistory } from "./controllers/historyController.js";
import { assignRequestId } from "./middleware/requestId.js";
import { requireAuth } from "./middleware/auth.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandlers.js";

const app = express();

const apiV1DbGate = (req, res, next) => {
  if (config.skipDatabaseConnect) {
    return res.status(503).json({
      error: {
        message:
          "API needs MongoDB: remove SKIP_DATABASE from server/.env (or set false), then allow your IP in MongoDB Atlas Network Access and restart the server.",
        code: "DATABASE_DISABLED",
      },
    });
  }
  next();
};

app.use(cors());
app.use(express.json());
app.use(assignRequestId);
app.use(morgan("dev"));

/**
 * Express 5: register this on `app` with the full path *before* `app.use("/api/v1", apiRouter)`.
 * A nested Router made `POST .../users/me/history/clear` miss (404). Without a Bearer token this returns 401.
 */
app.post("/api/v1/users/me/history/clear", apiV1DbGate, requireAuth, clearMyHistory);

app.get("/health", (_req, res) => {
  const skipped = config.skipDatabaseConnect;
  const connected = mongoose.connection.readyState === 1;
  res.json({
    status: "ok",
    database: skipped ? "skipped_no_auth" : connected ? "connected" : "not_connected",
    mongoReadyState: skipped ? undefined : mongoose.connection.readyState,
    clearHistoryPostPath: "/api/v1/users/me/history/clear",
  });
});

app.use("/api/v1", apiV1DbGate);
app.use("/api/v1", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
