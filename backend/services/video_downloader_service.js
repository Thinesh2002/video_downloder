"use strict";
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

// ─── Platform detection ───────────────────────────────────────────────────────
const PLATFORMS = {
  youtube:   /youtube\.com|youtu\.be/,
  instagram: /instagram\.com/,
  tiktok:    /tiktok\.com/,
  pinterest: /pinterest\.com|pin\.it/,
  twitter:   /twitter\.com|x\.com/,
  facebook:  /facebook\.com|fb\.watch/,
  reddit:    /reddit\.com/,
  vimeo:     /vimeo\.com/,
  dailymotion: /dailymotion\.com/,
  twitch:    /twitch\.tv/,
  soundcloud: /soundcloud\.com/,
};

function detectPlatform(url) {
  for (const [platform, pattern] of Object.entries(PLATFORMS)) {
    if (pattern.test(url)) return platform;
  }
  return "generic";
}

// ─── Format maps ──────────────────────────────────────────────────────────────
const FORMAT_MAP = {
  best:   "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
  high:   "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
  medium: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
  low:    "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best",
  audio:  "bestaudio[ext=m4a]/bestaudio",
};

// ─── Resolve yt-dlp binary (Linux VPS priority) ───────────────────────────────
function resolveYtDlp() {
  // On Hostinger VPS (Linux), yt-dlp is installed globally via pip or binary
  const candidates = [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    path.join(process.env.HOME || "/root", ".local/bin/yt-dlp"),
    "yt-dlp", // PATH fallback
  ];

  for (const candidate of candidates) {
    try {
      execSync(`${candidate} --version`, { stdio: "ignore", timeout: 5000 });
      logger.info(`yt-dlp resolved: ${candidate}`);
      return candidate;
    } catch {}
  }
  throw new Error("yt-dlp not found. Install: pip install yt-dlp");
}

let YTDLP;
try {
  YTDLP = resolveYtDlp();
} catch (err) {
  logger.error(err.message);
  YTDLP = "yt-dlp"; // let it fail at runtime with a clear message
}

// ─── Resolve ffmpeg (Hostinger VPS) ──────────────────────────────────────────
function resolveFfmpeg() {
  const candidates = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ];
  for (const c of candidates) {
    try {
      execSync(`${c} -version`, { stdio: "ignore", timeout: 5000 });
      return c;
    } catch {}
  }
  return null; // optional — yt-dlp can sometimes work without it
}

const FFMPEG = resolveFfmpeg();
if (FFMPEG) logger.info(`ffmpeg resolved: ${FFMPEG}`);

// ─── Core yt-dlp runner ───────────────────────────────────────────────────────
/**
 * @param {string[]} args
 * @param {object}  opts
 * @param {number}  opts.timeout   ms
 * @param {boolean} opts.captureStdout
 * @returns {Promise<string>} stdout
 */
function runYtDlp(args, { timeout = 60_000, captureStdout = true } = {}) {
  return new Promise((resolve, reject) => {
    const fullArgs = [
      ...args,
      "--no-warnings",
      "--no-color",
      // Retry on transient errors (great for VPS with shared bandwidth)
      "--retries", "3",
      "--fragment-retries", "3",
      "--socket-timeout", "20",
    ];

    if (FFMPEG) fullArgs.push("--ffmpeg-location", FFMPEG);

    logger.debug({ event: "yt-dlp spawn", args: fullArgs });

    const proc = spawn(YTDLP, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`yt-dlp timed out after ${timeout / 1000}s`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(captureStdout ? stdout : "");

      // Map common yt-dlp error phrases to better messages
      const msg = stderr || "yt-dlp failed";
      if (msg.includes("Private video")) return reject(Object.assign(new Error("Video is private"), { code: "PRIVATE_VIDEO", statusCode: 403 }));
      if (msg.includes("not available")) return reject(Object.assign(new Error("Video not available in this region"), { code: "NOT_AVAILABLE", statusCode: 404 }));
      if (msg.includes("Unsupported URL")) return reject(Object.assign(new Error("Unsupported URL / platform"), { code: "UNSUPPORTED", statusCode: 422 }));
      if (msg.includes("Sign in")) return reject(Object.assign(new Error("Video requires authentication"), { code: "AUTH_REQUIRED", statusCode: 403 }));
      reject(new Error(msg.split("\n").filter(Boolean).pop() || msg));
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch video metadata.
 */
exports.getVideoInfo = async (url) => {
  const raw = await runYtDlp(["--dump-json", "--no-playlist", url], { timeout: 30_000 });

  let info;
  try {
    info = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse video metadata");
  }

  const formats = (info.formats || [])
    .filter((f) => f.vcodec !== "none" && f.ext !== "mhtml" && f.url)
    .map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      resolution: f.resolution || `${f.width || "?"}x${f.height || "?"}`,
      filesize: f.filesize || f.filesize_approx || null,
      fps: f.fps || null,
      vcodec: f.vcodec || null,
      acodec: f.acodec || null,
      tbr: f.tbr || null,
    }))
    .slice(-15);

  return {
    platform: detectPlatform(url),
    title: info.title || "Untitled",
    duration: info.duration || 0,
    duration_string: info.duration_string || null,
    thumbnail: info.thumbnail || null,
    uploader: info.uploader || info.channel || null,
    upload_date: info.upload_date || null,
    view_count: info.view_count || null,
    like_count: info.like_count || null,
    description: (info.description || "").slice(0, 500),
    formats,
    available_qualities: Object.keys(FORMAT_MAP),
  };
};

/**
 * Get direct stream URL(s) without downloading.
 */
exports.getVideoUrl = async (url, quality = "best") => {
  const platform = detectPlatform(url);
  const format = FORMAT_MAP[quality] || FORMAT_MAP.best;

  const raw = await runYtDlp(
    ["-f", format, "--get-url", "--no-playlist", url],
    { timeout: 30_000 }
  );

  const urls = raw.trim().split("\n").filter(Boolean);

  return {
    platform,
    quality,
    video_url: urls[0] || null,
    audio_url: urls[1] || null,
    requires_merge: urls.length > 1,
    expires_hint: "Direct URLs expire quickly — use immediately",
  };
};

/**
 * Download video to server disk, return file metadata.
 */
exports.downloadToServer = async (url, quality = "best", outputDir = "./downloads") => {
  const platform = detectPlatform(url);
  const format = FORMAT_MAP[quality] || FORMAT_MAP.best;
  const timestamp = Date.now();

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputTemplate = path.join(outputDir, `${platform}_${timestamp}.%(ext)s`);

  await runYtDlp(
    [
      "-f", format,
      "--merge-output-format", "mp4",
      "--no-playlist",
      "-o", outputTemplate,
      url,
    ],
    { timeout: 180_000, captureStdout: false }
  );

  const files = fs
    .readdirSync(outputDir)
    .filter((f) => f.startsWith(`${platform}_${timestamp}`));

  if (!files.length) throw new Error("Downloaded file not found on disk");

  const filename = files[0];
  const filepath = path.join(outputDir, filename);
  const stats = fs.statSync(filepath);

  return { platform, quality, filename, filepath, filesize: stats.size };
};

/**
 * Remove files older than maxAgeMs from downloads dir.
 */
exports.cleanOldFiles = (outputDir = "./downloads", maxAgeMs = 30 * 60 * 1000) => {
  if (!fs.existsSync(outputDir)) return { removed: 0 };

  const now = Date.now();
  let removed = 0;

  fs.readdirSync(outputDir).forEach((file) => {
    const filepath = path.join(outputDir, file);
    try {
      const stat = fs.statSync(filepath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filepath);
        removed++;
        logger.debug(`Cleaned: ${file}`);
      }
    } catch {}
  });

  return { removed };
};

exports.detectPlatform = detectPlatform;
exports.FORMAT_MAP = FORMAT_MAP;
