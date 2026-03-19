const { exec, execSync } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const execAsync = promisify(exec);
const TEMP_DIR = path.join(__dirname, "../downloads");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const FFMPEG_PATH = path.join(__dirname, "../ffmpeg/ffmpeg");

const rateLimitMap = new Map();
const LIMIT = 10;
const WINDOW = 60 * 1000;

const checkRateLimit = (ip) => {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const requests = rateLimitMap.get(ip).filter(t => now - t < WINDOW);
  if (requests.length >= LIMIT) return false;
  requests.push(now);
  rateLimitMap.set(ip, requests);
  return true;
};

const validateUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const generateFileName = (ext = "mp4") => {
  return `preview_${Date.now()}_${crypto.randomUUID()}.${ext}`;
};

function getYtDlpPath() {
  const candidates = [
    "yt-dlp",
    "yt-dlp.exe",
    "C:\\yt-dlp\\yt-dlp.exe",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "yt-dlp", "yt-dlp.exe"),
    path.join(process.env.USERPROFILE || "", "AppData", "Local", "Programs", "yt-dlp", "yt-dlp.exe"),
    path.join(process.env.USERPROFILE || "", "scoop", "shims", "yt-dlp.exe"),
  ];

  for (const candidate of candidates) {
    try {
      if (candidate === "yt-dlp" || candidate === "yt-dlp.exe") {
        execSync(`${candidate} --version`, { stdio: "ignore" });
        return candidate;
      } else if (fs.existsSync(candidate)) {
        return `"${candidate}"`;
      }
    } catch {}
  }

  throw new Error("yt-dlp not found");
}

const YTDLP = getYtDlpPath();

exports.previewVideo = async (req, res) => {
  const { url, quality = "medium" } = req.body;
  const ip = req.ip;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  if (!url || !validateUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const formatMap = {
    best: "best",
    high: "best",
    medium: "best",
    low: "best",
    audio: "bestaudio",
  };

  const isAudio = quality === "audio";
  const format = formatMap[quality] || "best";
  const ext = isAudio ? "mp3" : "mp4";

  const filename = generateFileName(ext);
  const filepath = path.join(TEMP_DIR, filename);

  try {
    const safeUrl = url.replace(/"/g, '\\"');

    let command = `${YTDLP} -f "${format}" --ffmpeg-location "${FFMPEG_PATH}" --no-playlist --no-warnings -o "${filepath}" "${safeUrl}"`;

    if (isAudio) {
      command += ` -x --audio-format mp3`;
    }

    try {
      await execAsync(command, { timeout: 120000 });
    } catch {
      const fallbackCommand = `${YTDLP} -f "best" --ffmpeg-location "${FFMPEG_PATH}" --no-playlist --no-warnings -o "${filepath}" "${safeUrl}"`;
      await execAsync(fallbackCommand, { timeout: 120000 });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(500).json({ error: "Download failed" });
    }

    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", isAudio ? "audio/mpeg" : "video/mp4");

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunkSize);

      const stream = fs.createReadStream(filepath, { start, end });

      stream.pipe(res);

      stream.on("close", () => {
        try { fs.unlinkSync(filepath); } catch {}
      });

    } else {
      res.setHeader("Content-Length", fileSize);
      res.status(200);

      const stream = fs.createReadStream(filepath);

      stream.pipe(res);

      stream.on("close", () => {
        try { fs.unlinkSync(filepath); } catch {}
      });
    }

  } catch (err) {
    try { fs.unlinkSync(filepath); } catch {}

    const msg = err?.stderr || err?.message || "Unknown error";

    const status =
      msg.includes("private") ? 403 :
      msg.includes("Unsupported") ? 422 :
      msg.includes("not available") ? 404 : 500;

    res.status(status).json({
      error: "Preview failed",
      message: msg,
    });
  }
};