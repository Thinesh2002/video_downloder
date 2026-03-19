"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
const logger = require("../../utils/logger");

const TEMP_DIR = path.join(__dirname, "../../downloads");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Resolve yt-dlp (reuse from service) ─────────────────────────────────────
function resolveYtDlp() {
  const candidates = ["/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp", "yt-dlp"];
  for (const c of candidates) {
    try { execSync(`${c} --version`, { stdio: "ignore", timeout: 5000 }); return c; } catch {}
  }
  return "yt-dlp";
}
const YTDLP = resolveYtDlp();

function resolveFfmpeg() {
  const candidates = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"];
  for (const c of candidates) {
    try { execSync(`${c} -version`, { stdio: "ignore", timeout: 5000 }); return c; } catch {}
  }
  return null;
}
const FFMPEG = resolveFfmpeg();

const FORMAT_MAP = {
  best: "best[ext=mp4]/best",
  high: "best[height<=1080][ext=mp4]/best[height<=1080]/best",
  medium: "best[height<=720][ext=mp4]/best[height<=720]/best",
  low: "best[height<=480][ext=mp4]/best[height<=480]/best",
  audio: "bestaudio[ext=m4a]/bestaudio",
};

function generateFileName(ext = "mp4") {
  return `preview_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
}

/**
 * Download via yt-dlp spawn with progress logging.
 * Returns the filepath.
 */
function downloadFile(url, format, filepath, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const args = [
      "-f", format,
      "--no-playlist",
      "--no-warnings",
      "--retries", "3",
      "--socket-timeout", "20",
      "-o", filepath,
      url,
    ];

    if (FFMPEG) args.push("--ffmpeg-location", FFMPEG);

    const proc = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("yt-dlp preview timeout"));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(filepath);
      const msg = stderr.split("\n").filter(Boolean).pop() || "Download failed";
      const err = new Error(msg);
      if (msg.includes("private")) err.statusCode = 403;
      else if (msg.includes("Unsupported")) err.statusCode = 422;
      else if (msg.includes("not available")) err.statusCode = 404;
      else err.statusCode = 500;
      reject(err);
    });

    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Spawn error: ${e.message}`));
    });
  });
}

// ─── POST /api/video/preview ──────────────────────────────────────────────────
exports.previewVideo = async (req, res) => {
  const url = req.validatedUrl;
  const quality = req.validatedQuality || "medium";
  const isAudio = quality === "audio";
  const ext = isAudio ? "mp3" : "mp4";
  const filename = generateFileName(ext);
  const filepath = path.join(TEMP_DIR, filename);

  let downloaded = false;

  const cleanup = () => {
    if (downloaded) return; // let stream close handle it
    fs.unlink(filepath, () => {});
  };

  try {
    logger.info({ event: "preview_start", url, quality, ip: req.ip, requestId: req.id });

    let format = FORMAT_MAP[quality] || FORMAT_MAP.medium;

    // First attempt with requested format; fallback to "best"
    try {
      await downloadFile(url, format, filepath);
    } catch {
      logger.warn({ event: "preview_fallback", requestId: req.id });
      await downloadFile(url, "best", filepath);
    }

    if (!fs.existsSync(filepath)) {
      return res.status(500).json({ success: false, error: "PREVIEW_FAILED", message: "File not produced after download" });
    }

    downloaded = true;
    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = isAudio ? "audio/mpeg" : "video/mp4";

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("X-Request-ID", req.id);
    res.setHeader("Cache-Control", "no-store");

    let stream;

    if (range) {
      // ── Partial content (seekable video player) ──────────────────────────
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10) || 0;
      const end = endStr ? Math.min(parseInt(endStr, 10), fileSize - 1) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return res.status(416).set("Content-Range", `bytes */${fileSize}`).end();
      }

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", end - start + 1);

      stream = fs.createReadStream(filepath, { start, end });
    } else {
      res.status(200);
      res.setHeader("Content-Length", fileSize);
      stream = fs.createReadStream(filepath);
    }

    stream.on("error", (e) => {
      logger.error({ event: "preview_stream_error", err: e.message, requestId: req.id });
      if (!res.headersSent) res.status(500).json({ success: false, error: "STREAM_ERROR", message: "Stream failed" });
    });

    stream.on("close", () => {
      fs.unlink(filepath, () => {});
      logger.info({ event: "preview_complete", requestId: req.id });
    });

    // Client disconnect → free resources immediately
    req.on("close", () => {
      stream.destroy();
      fs.unlink(filepath, () => {});
    });

    stream.pipe(res);
  } catch (err) {
    cleanup();
    logger.error({ event: "preview_error", message: err.message, requestId: req.id });

    if (res.headersSent) return;
    res.status(err.statusCode || 500).json({
      success: false,
      error: "PREVIEW_FAILED",
      message: err.message,
      requestId: req.id,
    });
  }
};
