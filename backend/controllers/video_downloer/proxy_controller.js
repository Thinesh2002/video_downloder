const { exec, execSync } = require("child_process");
const { promisify } = require("util");
const fs   = require("fs");
const path = require("path");

const execAsync = promisify(exec);
const TEMP_DIR  = path.join(__dirname, "../downloads");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Resolve yt-dlp binary — checks PATH first, then common Windows install locations
function getYtDlpPath() {
  const candidates = [
    "yt-dlp",                          // in PATH
    "yt-dlp.exe",                      // in PATH (Windows)
    "C:\\yt-dlp\\yt-dlp.exe",          // manual install
    path.join(process.env.LOCALAPPDATA || "", "Programs", "yt-dlp", "yt-dlp.exe"),
    path.join(process.env.USERPROFILE  || "", "AppData", "Local", "Programs", "yt-dlp", "yt-dlp.exe"),
    path.join(process.env.USERPROFILE  || "", "scoop", "shims", "yt-dlp.exe"),
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

  throw new Error(
    "yt-dlp not found. Download yt-dlp.exe from https://github.com/yt-dlp/yt-dlp/releases " +
    "and place it in C:\\yt-dlp\\yt-dlp.exe, then add C:\\yt-dlp to your system PATH."
  );
}

const YTDLP = getYtDlpPath();
console.log(`[yt-dlp] using: ${YTDLP}`);

/**
 * POST /api/video/preview
 * Body: { url, quality }
 *
 * Downloads video to server via yt-dlp, streams it back.
 * File is deleted after streaming. Solves CORS + signed-URL issues.
 */
exports.previewVideo = async (req, res) => {
  const { url, quality = "medium" } = req.body;

  if (!url) return res.status(400).json({ error: "url required" });

  const formatMap = {
    best:   "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
    high:   "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
    medium: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[ext=mp4]/best",
    low:    "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[ext=mp4]/best",
    audio:  "bestaudio[ext=m4a]/bestaudio",
  };

  const format   = formatMap[quality] || formatMap.medium;
  const filename = `preview_${Date.now()}.mp4`;
  const filepath = path.join(TEMP_DIR, filename);

  try {
    await execAsync(
      `${YTDLP} -f "${format}" --merge-output-format mp4 --no-playlist -o "${filepath}" "${url}"`,
      { timeout: 90000 }
    );

    if (!fs.existsSync(filepath)) {
      return res.status(500).json({ error: "Download produced no file" });
    }

    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
      // Support seeking
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range",  `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunkSize);

      const stream = fs.createReadStream(filepath, { start, end });
      stream.pipe(res);
      stream.on("end", () => { try { fs.unlinkSync(filepath); } catch {} });
    } else {
      res.setHeader("Content-Length", fileSize);
      res.status(200);
      const stream = fs.createReadStream(filepath);
      stream.pipe(res);
      stream.on("end", () => { try { fs.unlinkSync(filepath); } catch {} });
    }

  } catch (err) {
    try { fs.unlinkSync(filepath); } catch {}
    console.error("[preview]", err.message);
    res.status(500).json({ error: "Preview failed: " + err.message });
  }
};