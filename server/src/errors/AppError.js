export class AppError extends Error {
  constructor(statusCode, message, details = null, code = "APP_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }
}
