"use strict"

const { execSync, spawn } = require("child_process")
const fs   = require("fs")
const path = require("path")
const crypto = require("crypto")

// ─── Config ───────────────────────────────────────────────────────────────────

const TEMP_DIR      = path.join(__dirname, "../downloads")
const MAX_FILESIZE  = 500 * 1024 * 1024   // 500 MB guard
const DL_TIMEOUT_MS = 120_000             // 2 min download cap
const MAX_RETRIES   = 2
const RETRY_DELAY   = 1_500

const FORMAT_MAP = {
  best:   "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
  high:   "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
  medium: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best",
  low:    "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best",
  audio:  "bestaudio[ext=m4a]/bestaudio",
}

const CONTENT_TYPE = {
  mp4:  "video/mp4",
  m4a:  "audio/mp4",
  webm: "video/webm",
  mp3:  "audio/mpeg",
}

// ─── Init ─────────────────────────────────────────────────────────────────────

fs.mkdirSync(TEMP_DIR, { recursive: true })

// ─── Resolve yt-dlp binary (once at startup) ──────────────────────────────────

function getYtDlpPath() {
  const candidates = [
    "yt-dlp",
    "yt-dlp.exe",
    "C:\\yt-dlp\\yt-dlp.exe",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "yt-dlp", "yt-dlp.exe"),
    path.join(process.env.USERPROFILE  || "", "AppData", "Local", "Programs", "yt-dlp", "yt-dlp.exe"),
    path.join(process.env.USERPROFILE  || "", "scoop", "shims", "yt-dlp.exe"),
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ]

  for (const c of candidates) {
    try {
      if (c === "yt-dlp" || c === "yt-dlp.exe") {
        execSync(`${c} --version`, { stdio: "ignore" })
        return c
      }
      if (fs.existsSync(c)) return `"${c}"`
    } catch { /* try next */ }
  }

  throw new Error(
    "yt-dlp not found. Install via: https://github.com/yt-dlp/yt-dlp/releases\n" +
    "Then place yt-dlp.exe in C:\\yt-dlp\\ and add it to your system PATH."
  )
}

const YTDLP = getYtDlpPath()
console.log(`[yt-dlp] resolved: ${YTDLP}`)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateUrl(url) {
  try {
    const u = new URL(url)
    if (!["http:", "https:"].includes(u.protocol)) throw new Error()
    return u.href
  } catch {
    throw Object.assign(new Error("Invalid or unsafe URL"), { statusCode: 400 })
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function safeUnlink(fp) {
  try { fs.unlinkSync(fp) } catch { /* already gone */ }
}

function parseYtDlpError(msg = "") {
  if (/private/i.test(msg))               return "This video is private."
  if (/copyright/i.test(msg))             return "Blocked due to copyright."
  if (/not available in your country/i.test(msg)) return "Video is geo-restricted."
  if (/sign in/i.test(msg))               return "Authentication required."
  if (/429|Too Many Requests/i.test(msg)) return "Rate limited. Try again shortly."
  if (/No video formats/i.test(msg))      return "No downloadable formats found."
  return msg.split("\n").filter(Boolean).slice(-2).join(" ")
}

// ─── yt-dlp downloader (spawn, with retries) ─────────────────────────────────

function downloadWithYtDlp(args, retriesLeft = MAX_RETRIES) {
  return new Promise((resolve, reject) => {

    // Strip wrapping quotes for spawn (it handles args natively)
    const bin  = YTDLP.replace(/^"|"$/g, "")
    const proc = spawn(bin, args, { env: { ...process.env, PYTHONUNBUFFERED: "1" } })

    let stderr = ""
    const timer = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error(`Download timed out after ${DL_TIMEOUT_MS / 1000}s`))
    }, DL_TIMEOUT_MS)

    proc.stderr.on("data", d => { stderr += d.toString() })

    proc.on("error", err => {
      clearTimeout(timer)
      reject(new Error(`Spawn error: ${err.message}`))
    })

    proc.on("close", code => {
      clearTimeout(timer)
      if (code === 0) return resolve()

      const friendly = parseYtDlpError(stderr)
      const retryable = /network|timeout|429|503|temporarily/i.test(stderr)

      if (retryable && retriesLeft > 0) {
        const delay = RETRY_DELAY * (MAX_RETRIES - retriesLeft + 1)
        return sleep(delay)
          .then(() => downloadWithYtDlp(args, retriesLeft - 1))
          .then(resolve, reject)
      }

      const err = new Error(friendly)
      err.statusCode = /private|copyright|geo|auth/i.test(friendly) ? 403 : 502
      reject(err)
    })
  })
}

// ─── Stream file to response (with range support) ────────────────────────────

function streamFile(filepath, req, res) {
  const stat     = fs.statSync(filepath)
  const fileSize = stat.size
  const ext      = path.extname(filepath).slice(1).toLowerCase()
  const mimeType = CONTENT_TYPE[ext] || "video/mp4"

  res.setHeader("Content-Type",    mimeType)
  res.setHeader("Accept-Ranges",   "bytes")
  res.setHeader("Cache-Control",   "no-store")
  res.setHeader("Access-Control-Allow-Origin", "*")

  const rangeHeader = req.headers.range

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-")
    const start = parseInt(startStr, 10)
    const end   = Math.min(endStr ? parseInt(endStr, 10) : fileSize - 1, fileSize - 1)

    if (isNaN(start) || start > end || start < 0) {
      res.setHeader("Content-Range", `bytes */${fileSize}`)
      return res.status(416).json({ error: "Range Not Satisfiable" })
    }

    const chunkSize = end - start + 1
    res.setHeader("Content-Range",  `bytes ${start}-${end}/${fileSize}`)
    res.setHeader("Content-Length", chunkSize)
    res.status(206)

    const stream = fs.createReadStream(filepath, { start, end })
    stream.pipe(res)
    stream.on("close", () => safeUnlink(filepath))
    stream.on("error", () => safeUnlink(filepath))

  } else {
    if (fileSize > MAX_FILESIZE) {
      safeUnlink(filepath)
      const err = new Error("File exceeds 500 MB preview limit. Use a lower quality.")
      err.statusCode = 413
      throw err
    }

    res.setHeader("Content-Length", fileSize)
    res.status(200)

    const stream = fs.createReadStream(filepath)
    stream.pipe(res)
    stream.on("close", () => safeUnlink(filepath))
    stream.on("error", () => safeUnlink(filepath))
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/video/preview
 * Body: { url: string, quality?: "best"|"high"|"medium"|"low"|"audio" }
 *
 * Downloads the video server-side, streams it back with range/seek support,
 * then deletes the temp file. Avoids CORS / signed-URL issues on the client.
 */
exports.previewVideo = async (req, res) => {

  // ── Validate input ──────────────────────────────────────────────────────────
  let url
  try {
    url = validateUrl(req.body?.url)
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message })
  }

  const quality  = FORMAT_MAP[req.body?.quality] ? req.body.quality : "medium"
  const format   = FORMAT_MAP[quality]

  // Unique temp filename — avoids collisions under concurrent requests
  const uid      = crypto.randomBytes(8).toString("hex")
  const filepath = path.join(TEMP_DIR, `preview_${uid}.mp4`)

  // ── Download ────────────────────────────────────────────────────────────────
  const dlArgs = [
    "-f",  format,
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "15",
    "--retries",        "3",
    "--fragment-retries", "3",
    "--buffer-size",    "1M",
    "-o",  filepath,
    url,
  ]

  try {
    await downloadWithYtDlp(dlArgs)
  } catch (err) {
    safeUnlink(filepath)
    console.error("[preview] download failed:", err.message)
    return res.status(err.statusCode || 500).json({ error: err.message })
  }

  // ── Sanity-check output file ────────────────────────────────────────────────
  if (!fs.existsSync(filepath)) {
    return res.status(500).json({ error: "Download produced no file." })
  }

  // ── Stream to client ────────────────────────────────────────────────────────
  try {
    streamFile(filepath, req, res)
  } catch (err) {
    safeUnlink(filepath)
    console.error("[preview] stream failed:", err.message)
    const code = err.statusCode || 500
    if (!res.headersSent) res.status(code).json({ error: err.message })
  }
}


/**
 * OPTIONS /api/video/preview
 * Pre-flight handler for CORS.
 */
exports.previewOptions = (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range")
  res.sendStatus(204)
}