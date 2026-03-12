"use strict"

const {
  getVideoInfo,
  getVideoUrl,
  downloadToServer,
  cleanOldFiles,
  getDirStats,
  invalidateCache,
} = require("../../services/video_downloader_service")

const path = require("path")
const fs   = require("fs")

// ─── Config ───────────────────────────────────────────────────────────────────

const DOWNLOADS_DIR   = path.join(__dirname, "../downloads")
const VALID_QUALITIES = ["best", "4k", "high", "medium", "low", "360", "audio"]

const MIME_TYPES = {
  mp4:  "video/mp4",
  webm: "video/webm",
  m4a:  "audio/mp4",
  mp3:  "audio/mpeg",
  ogg:  "audio/ogg",
}

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeUnlink(fp) {
  fs.unlink(fp, () => {})
}

function validateUrl(raw) {
  if (!raw || typeof raw !== "string") {
    const e = new Error("url is required")
    e.statusCode = 400
    throw e
  }
  try {
    const u = new URL(raw)
    if (!["http:", "https:"].includes(u.protocol)) throw new Error()
    return u.href
  } catch {
    const e = new Error("Invalid URL format")
    e.statusCode = 400
    throw e
  }
}

function validateQuality(q) {
  if (q && !VALID_QUALITIES.includes(q)) {
    const e = new Error(`Invalid quality. Choose from: ${VALID_QUALITIES.join(", ")}`)
    e.statusCode = 400
    throw e
  }
  return q || "best"
}

function errorStatus(msg = "") {
  if (/unsupported platform/i.test(msg))   return 422
  if (/private/i.test(msg))                return 403
  if (/copyright/i.test(msg))              return 403
  if (/geo.restrict|not available in/i.test(msg)) return 451
  if (/not available|not found/i.test(msg)) return 404
  if (/rate.limit|429/i.test(msg))         return 429
  if (/invalid url/i.test(msg))            return 400
  return 500
}

function mimeFor(filepath) {
  const ext = path.extname(filepath).slice(1).toLowerCase()
  return MIME_TYPES[ext] || "application/octet-stream"
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/video/info?url=...&bypass_cache=1
 * Returns metadata: title, duration, formats, thumbnail, etc.
 */
exports.videoInfo = async (req, res) => {
  let url
  try {
    url = validateUrl(req.query.url)
  } catch (err) {
    return res.status(err.statusCode).json({ success: false, message: err.message })
  }

  const bypassCache = req.query.bypass_cache === "1" || req.query.bypass_cache === "true"

  try {
    const info = await getVideoInfo(url, { bypassCache })
    return res.json({ success: true, data: info })
  } catch (err) {
    const status = errorStatus(err.message)
    return res.status(status).json({
      success: false,
      error:   "INFO_FAILED",
      message: err.message,
    })
  }
}

/**
 * POST /api/video/url
 * Body: { url, quality? }
 * Returns direct streaming URLs (no server download).
 */
exports.getUrl = async (req, res) => {
  let url, quality
  try {
    url     = validateUrl(req.body?.url)
    quality = validateQuality(req.body?.quality)
  } catch (err) {
    return res.status(err.statusCode).json({ success: false, message: err.message })
  }

  try {
    const data = await getVideoUrl(url, quality)
    return res.json({ success: true, data })
  } catch (err) {
    const status = errorStatus(err.message)
    return res.status(status).json({
      success: false,
      error:   "URL_EXTRACTION_FAILED",
      message: err.message,
    })
  }
}

/**
 * POST /api/video/download
 * Body: { url, quality?, filename?, embedThumbnail?, subtitleLang? }
 *
 * Downloads video server-side, streams to client with range support,
 * then deletes temp file.
 */
exports.downloadVideo = async (req, res) => {
  let url, quality
  try {
    url     = validateUrl(req.body?.url)
    quality = validateQuality(req.body?.quality)
  } catch (err) {
    return res.status(err.statusCode).json({ success: false, message: err.message })
  }

  const opts = {
    quality,
    outputDir:      DOWNLOADS_DIR,
    filename:       req.body?.filename       || undefined,
    embedThumbnail: req.body?.embedThumbnail === true,
    subtitleLang:   req.body?.subtitleLang   || null,
    audioOnly:      quality === "audio",
  }

  let result
  try {
    result = await downloadToServer(url, opts)
  } catch (err) {
    return res.status(errorStatus(err.message)).json({
      success: false,
      error:   "DOWNLOAD_FAILED",
      message: err.message,
    })
  }

  const { filepath, filename, filesize } = result
  const mimeType  = mimeFor(filepath)
  const rangeHeader = req.headers.range

  res.setHeader("Content-Type",        mimeType)
  res.setHeader("Accept-Ranges",       "bytes")
  res.setHeader("Cache-Control",       "no-store")
  res.setHeader("X-Platform",          result.platform)
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(filename)}"`
  )

  // ── Range / seek support ─────────────────────────────────────────────────
  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-")
    const start = parseInt(startStr, 10)
    const end   = Math.min(endStr ? parseInt(endStr, 10) : filesize - 1, filesize - 1)

    if (isNaN(start) || start > end || start < 0) {
      res.setHeader("Content-Range", `bytes */${filesize}`)
      safeUnlink(filepath)
      return res.status(416).json({ success: false, message: "Range Not Satisfiable" })
    }

    res.setHeader("Content-Range",  `bytes ${start}-${end}/${filesize}`)
    res.setHeader("Content-Length", end - start + 1)
    res.status(206)

    const stream = fs.createReadStream(filepath, { start, end })
    stream.pipe(res)
    stream.on("close", () => safeUnlink(filepath))
    stream.on("error", err => {
      safeUnlink(filepath)
      if (!res.headersSent) res.status(500).json({ success: false, message: "Stream error" })
    })

  } else {
    // ── Full file ──────────────────────────────────────────────────────────
    res.setHeader("Content-Length", filesize)
    res.status(200)

    const stream = fs.createReadStream(filepath)
    stream.pipe(res)
    stream.on("close", () => safeUnlink(filepath))
    stream.on("error", err => {
      safeUnlink(filepath)
      if (!res.headersSent) res.status(500).json({ success: false, message: "Stream error" })
    })
  }
}

/**
 * DELETE /api/video/cleanup?max_age_minutes=30
 * Removes temp files older than max_age_minutes. Returns count + freed bytes.
 */
exports.cleanup = async (req, res) => {
  const maxAgeMin = parseInt(req.query.max_age_minutes, 10) || 30
  const maxAgeMs  = maxAgeMin * 60 * 1_000

  try {
    const deleted = await cleanOldFiles(DOWNLOADS_DIR, maxAgeMs)
    const { count, totalSize } = await getDirStats(DOWNLOADS_DIR)

    return res.json({
      success:       true,
      deleted_count: deleted.length,
      deleted_files: deleted,
      remaining:     { count, totalSize },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

/**
 * DELETE /api/video/cache?url=...
 * Invalidates cached info for a specific URL (or clears all if no url given).
 */
exports.invalidateCache = (req, res) => {
  const { url } = req.query
  try {
    if (url) {
      validateUrl(url)
      invalidateCache(url)
      return res.json({ success: true, message: "Cache invalidated for URL" })
    }
    // Clear all if no specific URL given
    const { clearCache } = require("../../services/video_downloader_service")
    clearCache()
    return res.json({ success: true, message: "Full cache cleared" })
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/video/stats
 * Returns download directory stats (file count, total size).
 */
exports.dirStats = async (_req, res) => {
  try {
    const stats = await getDirStats(DOWNLOADS_DIR)
    return res.json({ success: true, data: stats })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}