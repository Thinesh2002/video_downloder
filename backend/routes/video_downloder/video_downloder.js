"use strict"

const express = require("express")
const router  = express.Router()

const {
  videoInfo,
  getUrl,
  downloadVideo,
  cleanup,
  invalidateCache,
  dirStats,
} = require("../../controllers/video_downloer/video_downloader")

const {
  previewVideo,
  previewOptions,
} = require("../../controllers/video_downloer/proxy_controller")

// ─── Lightweight rate limiter (no extra deps) ─────────────────────────────────

function rateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map()

  // Sweep expired entries every window
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key)
    }
  }, windowMs).unref()

  return (req, res, next) => {
    const key = req.ip || "unknown"
    const now = Date.now()

    if (!hits.has(key) || now > hits.get(key).resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    const entry = hits.get(key)
    entry.count++

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      res.setHeader("Retry-After", retryAfter)
      return res.status(429).json({
        success: false,
        error:   "RATE_LIMITED",
        message: `Too many requests. Retry after ${retryAfter}s.`,
      })
    }

    next()
  }
}

// ─── Input sanitiser middleware ───────────────────────────────────────────────

function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === "object") {
    for (const [k, v] of Object.entries(req.body)) {
      if (typeof v === "string") req.body[k] = v.trim()
    }
  }
  next()
}

// ─── Rate limit tiers ─────────────────────────────────────────────────────────

const infoLimit     = rateLimiter({ windowMs: 60_000,  max: 60  })  // 60/min
const urlLimit      = rateLimiter({ windowMs: 60_000,  max: 30  })  // 30/min
const downloadLimit = rateLimiter({ windowMs: 60_000,  max: 10  })  // 10/min — heavy
const previewLimit  = rateLimiter({ windowMs: 60_000,  max: 10  })  // 10/min — heavy
const cleanupLimit  = rateLimiter({ windowMs: 300_000, max: 5   })  // 5 per 5 min

// ─── Routes ───────────────────────────────────────────────────────────────────

// Metadata
router.get(    "/info",            infoLimit,     videoInfo)

// Direct URL extraction (no server download)
router.post(   "/url",             urlLimit,      sanitizeBody, getUrl)

// Server-side download → stream to client
router.post(   "/download",        downloadLimit, sanitizeBody, downloadVideo)

// Server-side download → stream back for in-browser preview (with range/seek)
router.options("/preview",                        previewOptions)
router.post(   "/preview",         previewLimit,  sanitizeBody, previewVideo)

// Cache management
router.delete( "/cache",           infoLimit,     invalidateCache)

// Downloads directory stats
router.get(    "/stats",           infoLimit,     dirStats)

// Cleanup old temp files
router.delete( "/cleanup",         cleanupLimit,  cleanup)

module.exports = router