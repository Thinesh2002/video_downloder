"use strict";
const path = require("path");
const fs = require("fs");
const { getVideoInfo, getVideoUrl, downloadToServer, cleanOldFiles } = require("../../services/video_downloader_service");
const { AppError } = require("../../middleware/errorHandler");
const logger = require("../../utils/logger");

const DOWNLOADS_DIR = path.join(__dirname, "../../downloads");

// ─── GET /api/video/info?url=... ──────────────────────────────────────────────
exports.videoInfo = async (req, res, next) => {
  try {
    const url = req.validatedUrl; // set by validateUrl middleware
    logger.info({ event: "video_info", url, ip: req.ip, requestId: req.id });

    const info = await getVideoInfo(url);

    res.json({ success: true, requestId: req.id, data: info });
  } catch (err) {
    err.statusCode = err.statusCode || 500;
    err.code = err.code || "INFO_FAILED";
    next(err);
  }
};

// ─── POST /api/video/url ──────────────────────────────────────────────────────
exports.getUrl = async (req, res, next) => {
  try {
    const url = req.validatedUrl;
    const quality = req.validatedQuality;

    logger.info({ event: "get_url", url, quality, ip: req.ip, requestId: req.id });

    const data = await getVideoUrl(url, quality);
    res.json({ success: true, requestId: req.id, data });
  } catch (err) {
    err.statusCode = err.statusCode || 500;
    err.code = err.code || "URL_EXTRACTION_FAILED";
    next(err);
  }
};

// ─── POST /api/video/download ─────────────────────────────────────────────────
exports.downloadVideo = async (req, res, next) => {
  const url = req.validatedUrl;
  const quality = req.validatedQuality;
  let filepath;

  try {
    logger.info({ event: "download_start", url, quality, ip: req.ip, requestId: req.id });

    const result = await downloadToServer(url, quality, DOWNLOADS_DIR);
    filepath = result.filepath;

    // Detect mime type
    const isAudio = quality === "audio";
    const mimeType = isAudio ? "audio/mpeg" : "video/mp4";

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", result.filesize);
    res.setHeader("X-Platform", result.platform);
    res.setHeader("X-Request-ID", req.id);
    // Allow partial requests for resumable downloads
    res.setHeader("Accept-Ranges", "bytes");

    const stream = fs.createReadStream(result.filepath);

    stream.on("error", (streamErr) => {
      logger.error({ event: "stream_error", err: streamErr.message, requestId: req.id });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "STREAM_ERROR", message: "File stream failed" });
      }
    });

    stream.on("close", () => {
      fs.unlink(result.filepath, () => {});
      logger.info({ event: "download_complete", filename: result.filename, requestId: req.id });
    });

    req.on("close", () => {
      // Client disconnected — destroy stream to free resources
      stream.destroy();
      if (filepath) fs.unlink(filepath, () => {});
    });

    stream.pipe(res);
  } catch (err) {
    // Cleanup partial file on error
    if (filepath) fs.unlink(filepath, () => {});
    err.statusCode = err.statusCode || 500;
    err.code = err.code || "DOWNLOAD_FAILED";
    next(err);
  }
};

// ─── DELETE /api/video/cleanup ────────────────────────────────────────────────
exports.cleanup = async (req, res, next) => {
  try {
    const maxAgeMs = parseInt(req.query.maxAge, 10) || 30 * 60 * 1000;
    const result = cleanOldFiles(DOWNLOADS_DIR, maxAgeMs);

    logger.info({ event: "cleanup", ...result, requestId: req.id });
    res.json({ success: true, requestId: req.id, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/video/formats ───────────────────────────────────────────────────
exports.getFormats = (_req, res) => {
  const { FORMAT_MAP } = require("../../services/video_downloader_service");
  res.json({
    success: true,
    data: {
      qualities: Object.keys(FORMAT_MAP),
      platforms: ["youtube", "instagram", "tiktok", "twitter", "facebook", "reddit", "vimeo", "pinterest", "dailymotion", "twitch", "soundcloud", "generic"],
    },
  });
};
