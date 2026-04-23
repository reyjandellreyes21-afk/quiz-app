import { AppError } from "../errors/AppError.js";

export const notFoundHandler = (_req, _res, next) => {
  next(new AppError(404, "Route not found.", null, "NOT_FOUND"));
};

export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error.";
  if (statusCode === 500 && /buffering timed out/i.test(message)) {
    // eslint-disable-next-line no-console
    console.error(err);
    statusCode = 503;
    message =
      "MongoDB is not connected — sign-up/login need a live database. Remove SKIP_DATABASE from server/.env (if set), whitelist your IP in MongoDB Atlas, restart the API, then GET /health should show database connected.";
  }
  const payload = {
    success: false,
    error: {
      code: err.code || "INTERNAL_ERROR",
      message,
      requestId: _req.requestId,
    },
  };
  if (err.details) payload.error.details = err.details;

  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(statusCode).json(payload);
};
