const {
  getVideoInfo,
  getVideoUrl,
  downloadToServer,
  cleanOldFiles,
} = require("../../services/video_downloader_service")

const path = require("path")
const fs = require("fs")

const DOWNLOADS_DIR = path.join(__dirname, "../downloads")

const validateUrl = (url) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

const rateLimitMap = new Map()
const LIMIT = 15
const WINDOW = 60 * 1000

const checkRateLimit = (ip) => {
  const now = Date.now()
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, [])
  }

  const requests = rateLimitMap.get(ip).filter(t => now - t < WINDOW)

  if (requests.length >= LIMIT) return false

  requests.push(now)
  rateLimitMap.set(ip, requests)
  return true
}

exports.videoInfo = async (req, res) => {
  const { url } = req.query
  const ip = req.ip

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: "Too many requests" })
  }

  if (!url) {
    return res.status(400).json({ success: false, message: "url query param required" })
  }

  if (!validateUrl(url)) {
    return res.status(400).json({ success: false, message: "Invalid URL format" })
  }

  try {
    const info = await getVideoInfo(url)

    res.json({
      success: true,
      data: info,
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "INFO_FAILED",
      message: err.message,
    })
  }
}

exports.getUrl = async (req, res) => {
  const { url, quality = "best", format = "mp4" } = req.body
  const ip = req.ip

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: "Too many requests" })
  }

  if (!url) {
    return res.status(400).json({ success: false, message: "url is required" })
  }

  if (!validateUrl(url)) {
    return res.status(400).json({ success: false, message: "Invalid URL format" })
  }

  const validQualities = ["best", "high", "medium", "low", "audio"]
  const validFormats = ["mp4", "mp3"]

  if (!validQualities.includes(quality)) {
    return res.status(400).json({
      success: false,
      message: `Invalid quality. Choose from: ${validQualities.join(", ")}`,
    })
  }

  if (!validFormats.includes(format)) {
    return res.status(400).json({
      success: false,
      message: `Invalid format. Choose from: ${validFormats.join(", ")}`,
    })
  }

  try {
    const data = await getVideoUrl(url, quality, format)

    res.json({
      success: true,
      quality,
      format,
      data,
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "URL_EXTRACTION_FAILED",
      message: err.message,
    })
  }
}

exports.downloadVideo = async (req, res) => {
  const { url, quality = "best", format = "mp4" } = req.body
  const ip = req.ip

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, message: "Too many requests" })
  }

  if (!url) {
    return res.status(400).json({ success: false, message: "url is required" })
  }

  if (!validateUrl(url)) {
    return res.status(400).json({ success: false, message: "Invalid URL format" })
  }

  try {
    const result = await downloadToServer(url, quality, DOWNLOADS_DIR, format)

    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`)
    res.setHeader("Content-Type", format === "mp3" ? "audio/mpeg" : "video/mp4")
    res.setHeader("Content-Length", result.filesize)

    const stream = fs.createReadStream(result.filepath)

    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "File stream error" })
      }
    })

    stream.on("close", () => {
      fs.unlink(result.filepath, () => {})
    })

    stream.pipe(res)

  } catch (err) {
    const status =
      err.message.includes("Unsupported") ? 422 :
      err.message.includes("private") ? 403 :
      err.message.includes("not available") ? 404 : 500

    res.status(status).json({
      success: false,
      error: "DOWNLOAD_FAILED",
      message: err.message,
    })
  }
}

exports.cleanup = (req, res) => {
  try {
    cleanOldFiles(DOWNLOADS_DIR)
    res.json({ success: true, message: "Old files cleaned" })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}