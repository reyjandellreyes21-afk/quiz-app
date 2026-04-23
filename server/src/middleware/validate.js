import { validationResult } from "express-validator";
import { AppError } from "../errors/AppError.js";

export const validate = (req, _res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  return next(new AppError(422, "Validation failed.", errors.array(), "VALIDATION_ERROR"));
};
