export class AppError extends Error {
  constructor(message, statusCode, code=null) {
    super(message);

    this.statusCode = statusCode;
    this.name = "AppError";
    this.code = code;
  }
}