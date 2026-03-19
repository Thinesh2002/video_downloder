"use strict";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rfs = require("rotating-file-stream");
const fs = require("fs");
const crypto = require("crypto"); // ✅ FIX ADDED

const videoDownloaderRoutes = require("./routes/video_downloader/video_downloader");
const { globalErrorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { globalRateLimit } = require("./middleware/rateLimiter");
const logger = require("./utils/logger");

const app = express();

// ─── Trust Proxy ─────────────────────────────────────────
app.set("trust proxy", 1);

// ─── Security Headers ────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

// ─── Compression ─────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));

// ─── CORS (localhost enabled) ────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const defaultOrigins = ["http://localhost:5173"];
const origins = [...new Set([...defaultOrigins, ...ALLOWED_ORIGINS])];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: ${origin} not allowed`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
    maxAge: 86400,
  })
);

// ─── Logs ────────────────────────────────────────────────
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const accessLog = rfs.createStream("access.log", {
  interval: "1d",
  path: logsDir,
  maxFiles: 7,
  compress: "gzip",
});

app.use(morgan("combined", { stream: accessLog }));
app.use(morgan("dev"));

// ─── Body Parser ─────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Request ID ──────────────────────────────────────────
app.use((req, _res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  next();
});

// ─── Rate Limit ──────────────────────────────────────────
app.use(globalRateLimit);

// ─── Static Files ────────────────────────────────────────
app.use(
  "/downloads",
  express.static(path.join(__dirname, "downloads"), {
    maxAge: "5m",
    setHeaders: (res) => {
      res.set("X-Content-Type-Options", "nosniff");
    },
  })
);

// ─── Routes ──────────────────────────────────────────────
app.use("/api/video", videoDownloaderRoutes);

// ─── Health Check ────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.json({ message: "Video Downloader API Running", version: "2.0.0" });
});

// ─── Error Handling ──────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ─── Start Server ────────────────────────────────────────
const PORT = 4001;
const HOST = "localhost"; // ✅ force localhost

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running → http://${HOST}:${PORT}`);
});

// ─── Shutdown ────────────────────────────────────────────
const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = app;