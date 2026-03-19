"use strict";
const express = require("express");
const router = express.Router();

const { videoInfo, getUrl, downloadVideo, cleanup, getFormats } = require("../../controllers/video_downloader/video_downloader");
const { previewVideo } = require("../../controllers/video_downloader/proxy_controller");
const { downloadRateLimit, infoRateLimit } = require("../../middleware/rateLimiter");
const { validateUrl, validateQuality } = require("../../middleware/validator");

// ── GET /api/video/info?url=...
// Fetch metadata without downloading
router.get(
  "/info",
  infoRateLimit,
  validateUrl("query"),
  videoInfo
);

// ── GET /api/video/formats
// List supported platforms and quality options
router.get("/formats", getFormats);

// ── POST /api/video/url
// Get direct stream URL (no download to server)
router.post(
  "/url",
  infoRateLimit,
  validateUrl("body"),
  validateQuality,
  getUrl
);

// ── POST /api/video/download
// Download to server, stream back to client
router.post(
  "/download",
  downloadRateLimit,
  validateUrl("body"),
  validateQuality,
  downloadVideo
);

// ── POST /api/video/preview
// Download + stream with byte-range support (seekable player)
router.post(
  "/preview",
  downloadRateLimit,
  validateUrl("body"),
  validateQuality,
  previewVideo
);

// ── DELETE /api/video/cleanup
// Remove old temp files (?maxAge=ms optional)
router.delete("/cleanup", cleanup);

module.exports = router;
