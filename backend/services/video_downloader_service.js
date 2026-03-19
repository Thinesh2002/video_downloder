const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs")

const PLATFORMS = {
  youtube: /youtube\.com|youtu\.be/,
  instagram: /instagram\.com/,
  tiktok: /tiktok\.com/,
  pinterest: /pinterest\.com|pin\.it/,
  twitter: /twitter\.com|x\.com/,
  facebook: /facebook\.com|fb\.watch/,
  reddit: /reddit\.com/,
  vimeo: /vimeo\.com/,
}

function detectPlatform(url) {
  for (const [platform, pattern] of Object.entries(PLATFORMS)) {
    if (pattern.test(url)) return platform
  }
  return "unknown"
}

function runYtDlp(args, timeout = 30000) {
  return new Promise((resolve, reject) => {

const defaultArgs = [
  "--no-playlist",
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "--add-header",
  "Accept-Language:en-US,en;q=0.9",
  "--add-header",
  "Referer:https://www.google.com/",
]

const proc = spawn("/usr/bin/yt-dlp", [...defaultArgs, ...args])

    let stdout = ""
    let stderr = ""

    const timer = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error("Process timeout"))
    }, timeout)

    proc.stdout.on("data", data => {
      stdout += data.toString()
    })

    proc.stderr.on("data", data => {
      stderr += data.toString()
    })

    proc.on("close", code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || "yt-dlp failed"))
    })

  })
}

exports.getVideoInfo = async (url) => {

  const output = await runYtDlp(["--dump-json", "--no-playlist", url])
  const info = JSON.parse(output)

  return {
    platform: detectPlatform(url),
    title: info.title || "Untitled",
    duration: info.duration || 0,
    thumbnail: info.thumbnail || null,
    uploader: info.uploader || info.channel || null,
    view_count: info.view_count || null,
    formats: (info.formats || [])
      .filter(f => f.vcodec !== "none" && f.ext !== "mhtml")
      .map(f => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution || `${f.width || "?"}x${f.height || "?"}`,
        filesize: f.filesize || f.filesize_approx || null,
        fps: f.fps || null,
      }))
      .slice(-10),
  }
}

exports.getVideoUrl = async (url, quality = "best") => {

  const platform = detectPlatform(url)

  if (platform === "unknown") {
    throw new Error("Unsupported platform")
  }

  const formatMap = {
    best: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    high: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
    medium: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
    low: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best",
    audio: "bestaudio[ext=m4a]/bestaudio",
  }

  const format = formatMap[quality] || formatMap.best

  const output = await runYtDlp([
    "-f",
    format,
    "--get-url",
    "--no-playlist",
    url
  ])

  const urls = output.trim().split("\n").filter(Boolean)

  return {
    platform,
    quality,
    video_url: urls[0] || null,
    audio_url: urls[1] || null,
    requires_merge: urls.length > 1,
  }
}

exports.downloadToServer = async (url, quality = "best", outputDir = "./downloads") => {

  const platform = detectPlatform(url)

  if (platform === "unknown") {
    throw new Error("Unsupported platform")
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const formatMap = {
    best: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    high: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
    medium: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
    low: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best",
    audio: "bestaudio[ext=m4a]/bestaudio",
  }

  const format = formatMap[quality] || formatMap.best
  const timestamp = Date.now()

  const outputTemplate = path.join(outputDir, `${platform}_${timestamp}.%(ext)s`)

  await runYtDlp([
    "-f",
    format,
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "-o",
    outputTemplate,
    url
  ], 120000)

  const files = fs
    .readdirSync(outputDir)
    .filter(f => f.startsWith(`${platform}_${timestamp}`))

  if (!files.length) throw new Error("Downloaded file not found")

  const filename = files[0]
  const filepath = path.join(outputDir, filename)
  const stats = fs.statSync(filepath)

  return {
    platform,
    quality,
    filename,
    filepath,
    filesize: stats.size,
  }
}

exports.cleanOldFiles = (outputDir = "./downloads", maxAgeMs = 30 * 60 * 1000) => {

  if (!fs.existsSync(outputDir)) return

  const now = Date.now()
  const files = fs.readdirSync(outputDir)

  files.forEach(file => {
    const filepath = path.join(outputDir, file)
    const stat = fs.statSync(filepath)

    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filepath)
    }
  })
}