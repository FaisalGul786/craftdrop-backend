import { AppError } from "../error-handlers/error.class.js";

export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.details && err.details.length > 0 && { errors: err.details })
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}