"use strict"

const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs")
const { promisify } = require("util")
const crypto = require("crypto")
const EventEmitter = require("events")

const stat = promisify(fs.stat)
const readdir = promisify(fs.readdir)
const unlink = promisify(fs.unlink)

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT     = 30_000
const DOWNLOAD_TIMEOUT    = 180_000
const MAX_RETRIES         = 3
const RETRY_DELAY_MS      = 1_500
const CACHE_TTL_MS        = 5 * 60 * 1_000   // 5 min info cache
const MAX_CONCURRENT      = 4
const CLEAN_AGE_MS        = 30 * 60 * 1_000  // 30 min

const PLATFORMS = {
  youtube:   /youtube\.com|youtu\.be/,
  instagram: /instagram\.com/,
  tiktok:    /tiktok\.com/,
  pinterest: /pinterest\.com|pin\.it/,
  twitter:   /twitter\.com|x\.com/,
  facebook:  /facebook\.com|fb\.watch/,
  reddit:    /reddit\.com/,
  vimeo:     /vimeo\.com/,
  dailymotion: /dailymotion\.com|dai\.ly/,
  twitch:    /twitch\.tv/,
  soundcloud:/soundcloud\.com/,
}

const FORMAT_MAP = {
  best:   "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
  high:   "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
  medium: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
  low:    "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best",
  audio:  "bestaudio[ext=m4a]/bestaudio",
  "4k":   "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best",
  "360":  "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best",
}

// ─── In-memory LRU Cache ───────────────────────────────────────────────────────

class TTLCache {
  constructor(maxSize = 100) {
    this._store   = new Map()
    this._maxSize = maxSize
  }

  set(key, value, ttl = CACHE_TTL_MS) {
    if (this._store.size >= this._maxSize) {
      // evict oldest
      const firstKey = this._store.keys().next().value
      this._store.delete(firstKey)
    }
    this._store.set(key, { value, expiresAt: Date.now() + ttl })
  }

  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return null }
    return entry.value
  }

  delete(key) { this._store.delete(key) }
  clear()     { this._store.clear() }
}

// ─── Concurrency Limiter ──────────────────────────────────────────────────────

class Semaphore {
  constructor(max) {
    this._max     = max
    this._current = 0
    this._queue   = []
  }

  acquire() {
    if (this._current < this._max) {
      this._current++
      return Promise.resolve()
    }
    return new Promise(resolve => this._queue.push(resolve))
  }

  release() {
    this._current--
    if (this._queue.length) {
      this._current++
      this._queue.shift()()
    }
  }
}

// ─── Globals ──────────────────────────────────────────────────────────────────

const infoCache  = new TTLCache(200)
const semaphore  = new Semaphore(MAX_CONCURRENT)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPlatform(url) {
  for (const [platform, pattern] of Object.entries(PLATFORMS)) {
    if (pattern.test(url)) return platform
  }
  return "unknown"
}

function validateUrl(url) {
  try {
    const u = new URL(url)
    if (!["http:", "https:"].includes(u.protocol)) throw new Error("Invalid protocol")
    return u.href
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
}

function sanitizeFilename(name = "") {
  return name.replace(/[^\w\s\-_.()]/g, "").trim().slice(0, 200) || "download"
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cacheKey(url, ...parts) {
  return crypto.createHash("md5").update(url + parts.join(":")).digest("hex")
}

// ─── Core: run yt-dlp with retries ───────────────────────────────────────────

/**
 * @param {string[]} args
 * @param {object}  [opts]
 * @param {number}  [opts.timeout]
 * @param {number}  [opts.retries]
 * @param {EventEmitter} [opts.emitter]  – for progress events
 */
function runYtDlp(args, { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES, emitter } = {}) {

  const attempt = (triesLeft) => new Promise((resolve, reject) => {

    const proc = spawn("python3", ["-m", "yt_dlp", ...args], {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    })

    let stdout = ""
    let stderr = ""

    const timer = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error(`yt-dlp timed out after ${timeout}ms`))
    }, timeout)

    proc.stdout.on("data", chunk => {
      const text = chunk.toString()
      stdout += text

      // Emit progress lines (e.g. "[download]  45.3% …")
      if (emitter) {
        const progressMatch = text.match(/\[download\]\s+([\d.]+)%/)
        if (progressMatch) {
          emitter.emit("progress", parseFloat(progressMatch[1]))
        }
      }
    })

    proc.stderr.on("data", chunk => { stderr += chunk.toString() })

    proc.on("error", err => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`))
    })

    proc.on("close", code => {
      clearTimeout(timer)
      if (code === 0) return resolve(stdout)

      const msg = stderr.trim() || `yt-dlp exited with code ${code}`

      // Decide if retryable
      const retryable = /network|timeout|429|503|temporarily/i.test(msg)
      if (retryable && triesLeft > 0) {
        const delay = RETRY_DELAY_MS * (MAX_RETRIES - triesLeft + 1)
        return sleep(delay).then(() => attempt(triesLeft - 1)).then(resolve, reject)
      }

      // Surface clean error messages
      const friendly = parseYtDlpError(msg)
      reject(new Error(friendly))
    })
  })

  return attempt(retries)
}

function parseYtDlpError(raw) {
  if (/private video/i.test(raw))            return "This video is private."
  if (/copyright/i.test(raw))                return "Video unavailable due to copyright."
  if (/not available in your country/i.test(raw)) return "Video is geo-restricted."
  if (/sign in/i.test(raw))                  return "This content requires authentication."
  if (/429|Too Many Requests/i.test(raw))    return "Rate limited by platform. Try again later."
  if (/No video formats/i.test(raw))         return "No downloadable formats found."
  if (/Unable to extract/i.test(raw))        return "Could not extract video information."
  return raw.split("\n").filter(Boolean).slice(-3).join(" ") // last 3 lines
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch video metadata. Results are cached for CACHE_TTL_MS.
 */
async function getVideoInfo(url, { bypassCache = false } = {}) {
  url = validateUrl(url)
  const key = cacheKey(url, "info")

  if (!bypassCache) {
    const cached = infoCache.get(key)
    if (cached) return { ...cached, _cached: true }
  }

  await semaphore.acquire()
  try {
    const output = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout", "15",
      url,
    ])

    const info = JSON.parse(output)

    const result = {
      platform:    detectPlatform(url),
      title:       info.title || "Untitled",
      description: info.description?.slice(0, 500) || null,
      duration:    info.duration || 0,
      thumbnail:   info.thumbnail || null,
      uploader:    info.uploader || info.channel || null,
      upload_date: info.upload_date || null,   // YYYYMMDD
      view_count:  info.view_count ?? null,
      like_count:  info.like_count ?? null,
      webpage_url: info.webpage_url || url,
      is_live:     info.is_live || false,
      formats: (info.formats || [])
        .filter(f => f.vcodec !== "none" && f.ext !== "mhtml")
        .map(f => ({
          format_id:  f.format_id,
          ext:        f.ext,
          resolution: f.resolution || `${f.width ?? "?"}x${f.height ?? "?"}`,
          height:     f.height || null,
          fps:        f.fps || null,
          vcodec:     f.vcodec || null,
          acodec:     f.acodec || null,
          filesize:   f.filesize || f.filesize_approx || null,
          tbr:        f.tbr || null,  // total bitrate kbps
        }))
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .slice(0, 15),
    }

    infoCache.set(key, result)
    return result

  } finally {
    semaphore.release()
  }
}

/**
 * Resolve direct streaming URL(s) without downloading to disk.
 */
async function getVideoUrl(url, quality = "best") {
  url = validateUrl(url)

  const platform = detectPlatform(url)
  if (platform === "unknown") throw new Error("Unsupported platform")

  const key = cacheKey(url, "streamurl", quality)
  const cached = infoCache.get(key)
  if (cached) return { ...cached, _cached: true }

  const format = FORMAT_MAP[quality] || FORMAT_MAP.best

  await semaphore.acquire()
  try {
    const output = await runYtDlp([
      "-f", format,
      "--get-url",
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout", "15",
      url,
    ])

    const urls = output.trim().split("\n").filter(Boolean)
    const result = {
      platform,
      quality,
      video_url:      urls[0] || null,
      audio_url:      urls[1] || null,
      requires_merge: urls.length > 1,
    }

    infoCache.set(key, result, 2 * 60 * 1_000) // stream URLs expire sooner
    return result

  } finally {
    semaphore.release()
  }
}

/**
 * Download video to server disk.
 *
 * @param {string}  url
 * @param {object}  [opts]
 * @param {string}  [opts.quality]
 * @param {string}  [opts.outputDir]
 * @param {string}  [opts.filename]       – custom base filename (no ext)
 * @param {boolean} [opts.embedThumbnail]
 * @param {boolean} [opts.embedMetadata]
 * @param {boolean} [opts.audioOnly]
 * @param {string}  [opts.subtitleLang]   – e.g. "en"
 * @param {EventEmitter} [opts.emitter]   – progress events
 * @returns {Promise<DownloadResult>}
 */
async function downloadToServer(url, {
  quality        = "best",
  outputDir      = "./downloads",
  filename,
  embedThumbnail = false,
  embedMetadata  = true,
  audioOnly      = false,
  subtitleLang   = null,
  emitter        = null,
} = {}) {

  url = validateUrl(url)
  const platform = detectPlatform(url)
  if (platform === "unknown") throw new Error("Unsupported platform")

  fs.mkdirSync(outputDir, { recursive: true })

  const format   = audioOnly ? FORMAT_MAP.audio : (FORMAT_MAP[quality] || FORMAT_MAP.best)
  const timestamp = Date.now()
  const baseName  = sanitizeFilename(filename) || `${platform}_${timestamp}`
  const outTemplate = path.join(outputDir, `${baseName}.%(ext)s`)

  const args = [
    "-f",  format,
    "--merge-output-format", "mp4",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "20",
    "--retries",        "3",
    "--fragment-retries", "3",
    "--buffer-size",    "1M",
    "-o",  outTemplate,
  ]

  if (embedMetadata)  args.push("--embed-metadata")
  if (embedThumbnail) args.push("--embed-thumbnail")
  if (subtitleLang) {
    args.push("--write-subs", "--sub-lang", subtitleLang, "--embed-subs")
  }
  if (audioOnly) {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0")
  }

  args.push(url)

  await semaphore.acquire()
  try {
    await runYtDlp(args, { timeout: DOWNLOAD_TIMEOUT, retries: 2, emitter })
  } finally {
    semaphore.release()
  }

  // Find the resulting file
  const files = fs.readdirSync(outputDir)
    .filter(f => f.startsWith(baseName))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(outputDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)

  if (!files.length) throw new Error("Downloaded file not found on disk")

  const fname    = files[0].name
  const fpath    = path.join(outputDir, fname)
  const fstat    = fs.statSync(fpath)

  return {
    platform,
    quality,
    filename:  fname,
    filepath:  fpath,
    filesize:  fstat.size,
    ext:       path.extname(fname).slice(1),
    timestamp,
  }
}

/**
 * Batch download multiple URLs with concurrency control.
 *
 * @param {Array<{url:string, opts?:object}>} items
 * @param {object} [globalOpts] – default opts for each item
 * @returns {Promise<Array<{url, result?, error?}>>}
 */
async function batchDownload(items, globalOpts = {}) {
  return Promise.all(
    items.map(({ url, opts = {} }) =>
      downloadToServer(url, { ...globalOpts, ...opts })
        .then(result => ({ url, result }))
        .catch(error => ({ url, error: error.message }))
    )
  )
}

/**
 * Remove files older than maxAgeMs from outputDir.
 * Returns list of deleted filenames.
 */
async function cleanOldFiles(outputDir = "./downloads", maxAgeMs = CLEAN_AGE_MS) {
  if (!fs.existsSync(outputDir)) return []

  const now   = Date.now()
  const files = await readdir(outputDir)
  const deleted = []

  await Promise.all(
    files.map(async file => {
      const fpath = path.join(outputDir, file)
      try {
        const s = await stat(fpath)
        if (now - s.mtimeMs > maxAgeMs) {
          await unlink(fpath)
          deleted.push(file)
        }
      } catch { /* skip locked / missing files */ }
    })
  )

  return deleted
}

/**
 * Returns total size (bytes) and count of files in a directory.
 */
async function getDirStats(outputDir = "./downloads") {
  if (!fs.existsSync(outputDir)) return { count: 0, totalSize: 0 }

  const files = await readdir(outputDir)
  let totalSize = 0

  await Promise.all(
    files.map(async f => {
      try {
        const s = await stat(path.join(outputDir, f))
        totalSize += s.size
      } catch { /* ignore */ }
    })
  )

  return { count: files.length, totalSize }
}

/** Invalidate cached info for a URL. */
function invalidateCache(url) {
  infoCache.delete(cacheKey(url, "info"))
  infoCache.delete(cacheKey(url, "streamurl", "best"))
}

/** Clear entire info cache. */
function clearCache() { infoCache.clear() }

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Core
  getVideoInfo,
  getVideoUrl,
  downloadToServer,
  batchDownload,

  // Utilities
  cleanOldFiles,
  getDirStats,
  detectPlatform,
  invalidateCache,
  clearCache,

  // Internals (for testing / extension)
  _runYtDlp:   runYtDlp,
  _formatMap:  FORMAT_MAP,
  _platforms:  PLATFORMS,
}