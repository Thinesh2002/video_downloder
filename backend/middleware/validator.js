"use strict";
const { AppError } = require("./errorHandler");

const VALID_QUALITIES = ["best", "high", "medium", "low", "audio"];

const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * Validates and sanitises a video URL.
 * Attaches `req.validatedUrl` on success.
 */
const validateUrl = (source = "body") => (req, _res, next) => {
  const raw = source === "query" ? req.query.url : req.body.url;

  if (!raw || typeof raw !== "string") {
    return next(new AppError("url is required", 400, "MISSING_URL"));
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return next(new AppError("Invalid URL format", 400, "INVALID_URL"));
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return next(new AppError("Only http/https URLs are allowed", 400, "INVALID_PROTOCOL"));
  }

  // Block localhost / private IPs (SSRF protection)
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname === "::1"
  ) {
    return next(new AppError("Private/internal URLs are not allowed", 403, "SSRF_BLOCKED"));
  }

  req.validatedUrl = parsed.toString();
  next();
};

/**
 * Validates quality param from body.
 * Attaches `req.validatedQuality` on success.
 */
const validateQuality = (req, _res, next) => {
  const quality = req.body.quality || "best";

  if (!VALID_QUALITIES.includes(quality)) {
    return next(
      new AppError(
        `Invalid quality. Choose from: ${VALID_QUALITIES.join(", ")}`,
        400,
        "INVALID_QUALITY"
      )
    );
  }

  req.validatedQuality = quality;
  next();
};

module.exports = { validateUrl, validateQuality, VALID_QUALITIES };
