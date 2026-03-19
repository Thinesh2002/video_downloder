"use strict";
const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

const onLimitReached = (req, _res, options) => {
  logger.warn({
    event: "RATE_LIMIT_HIT",
    ip: req.ip,
    url: req.originalUrl,
    limit: options.max,
  });
};

// ─── Global rate limit (all routes) ─────────────────────────────────────────
const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 120,                    // 120 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "TOO_MANY_REQUESTS", message: "Too many requests, please slow down." },
  handler: (req, res, _next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── Strict limit for heavy endpoints (download/preview) ────────────────────
const downloadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.DOWNLOAD_RATE_LIMIT, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { success: false, error: "DOWNLOAD_RATE_LIMIT", message: "Download limit reached. Please wait 1 minute." },
  handler: (req, res, _next, options) => {
    onLimitReached(req, res, options);
    res.status(429).json(options.message);
  },
});

// ─── Info endpoint (more lenient) ────────────────────────────────────────────
const infoRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "INFO_RATE_LIMIT", message: "Too many info requests. Please wait." },
});

module.exports = { globalRateLimit, downloadRateLimit, infoRateLimit };
