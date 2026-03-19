"use strict";
const logger = require("../utils/logger");

// ─── AppError class ───────────────────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode, code = "APP_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 404 Handler ─────────────────────────────────────────────────────────────
const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.id,
  });
};

// ─── Global Error Handler ─────────────────────────────────────────────────────
const globalErrorHandler = (err, req, res, _next) => {
  // Default values
  let { statusCode = 500, message = "Internal server error", code = "SERVER_ERROR" } = err;

  // CORS error
  if (err.message && err.message.startsWith("CORS:")) {
    statusCode = 403;
    code = "CORS_BLOCKED";
    message = err.message;
  }

  // JSON parse error
  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Request body contains invalid JSON";
  }

  // Payload too large
  if (err.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body exceeds allowed size";
  }

  // Log
  if (statusCode >= 500) {
    logger.error({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      statusCode,
      code,
      message,
      stack: err.stack,
    });
  } else {
    logger.warn({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code,
      message,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: code,
    message,
    requestId: req.id,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

module.exports = { AppError, notFoundHandler, globalErrorHandler };
