import { useState, useRef, useEffect, useCallback } from "react";
import API from "../../config/api";
import { Download, Link2, RefreshCcw, X, Volume2, Video, Sparkles, ChevronDown } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIRECT_PREVIEW = ["instagram", "vimeo"];

const QUALITY_OPTIONS = [
  { value: "best",   label: "Best",   sub: "Max Quality",  icon: "✦" },
  { value: "high",   label: "1080p",  sub: "Full HD",      icon: "▲" },
  { value: "medium", label: "720p",   sub: "HD",           icon: "●" },
  { value: "low",    label: "480p",   sub: "SD",           icon: "▼" },
  { value: "audio",  label: "Audio",  sub: "MP3 / M4A",    icon: "♪" },
];

const PLATFORM_LABELS = {
  youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok",
  twitter: "Twitter / X", facebook: "Facebook", reddit: "Reddit",
  vimeo: "Vimeo", pinterest: "Pinterest", dailymotion: "Dailymotion",
  twitch: "Twitch", soundcloud: "SoundCloud",
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;
}

function formatViews(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M views`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}K views`;
  return `${n} views`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value }) {
  return (
    <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function PlatformBadge({ platform }) {
  if (!platform || platform === "unknown") return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[11px] font-semibold tracking-wide uppercase">
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

function VideoMeta({ info }) {
  if (!info) return null;
  const dur   = formatDuration(info.duration);
  const views = formatViews(info.view_count);
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      <PlatformBadge platform={info.platform} />
      {dur   && <span className="text-[11px] text-stone-400 font-medium">{dur}</span>}
      {views && <span className="text-[11px] text-stone-400 font-medium">{views}</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VideoDownloader() {

  const [url,            setUrl]            = useState("");
  const [videoInfo,      setVideoInfo]      = useState(null);
  const [videoUrl,       setVideoUrl]       = useState(null);
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [quality,        setQuality]        = useState("best");
  const [loading,        setLoading]        = useState(false);
  const [downloading,    setDownloading]    = useState(false);
  const [error,          setError]          = useState("");
  const [progress,       setProgress]       = useState(0);
  const [dlProgress,     setDlProgress]     = useState(0);
  const [showFormats,    setShowFormats]    = useState(false);

  const inputRef   = useRef(null);
  const resultRef  = useRef(null);
  const progressRef = useRef(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── Fake progress ticker ────────────────────────────────────────────────────
  const startProgress = useCallback(() => {
    clearInterval(progressRef.current);
    setProgress(5);
    progressRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 88) { clearInterval(progressRef.current); return p; }
        return p + Math.random() * 10;
      });
    }, 280);
  }, []);

  const stopProgress = useCallback((final = 100) => {
    clearInterval(progressRef.current);
    setProgress(final);
    if (final === 100) setTimeout(() => setProgress(0), 800);
  }, []);

  // ── Fetch video ─────────────────────────────────────────────────────────────
  const fetchVideo = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError("Paste a video URL to get started."); return; }

    try { new URL(trimmed); }
    catch { setError("That doesn't look like a valid URL."); return; }

    setError("");
    setVideoInfo(null);
    setVideoUrl(null);
    setPreviewUrl(null);
    setShowFormats(false);
    setLoading(true);
    startProgress();

    try {
      const res  = await API.post("/video/url", { url: trimmed, quality });
      const data = res.data.data;

      stopProgress(100);
      setVideoUrl(data.video_url);
      setVideoInfo(data);

      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);

      // Preview
      if (DIRECT_PREVIEW.includes(data.platform)) {
        setPreviewUrl(data.video_url);
      } else {
        setPreviewLoading(true);
        try {
          const prev = await API.post(
            "/video/preview",
            { url: trimmed, quality: "medium" },
            { responseType: "blob" }
          );
          setPreviewUrl(URL.createObjectURL(new Blob([prev.data], { type: "video/mp4" })));
        } catch {
          setPreviewUrl(null);
        }
        setPreviewLoading(false);
      }

    } catch (err) {
      stopProgress(0);
      const msg = err?.response?.data?.message || "Could not fetch video. Check the URL and try again.";
      setError(msg);
    }

    setLoading(false);
  };

  // ── Download ────────────────────────────────────────────────────────────────
  const downloadVideo = async () => {
    if (!videoUrl || downloading) return;
    setDownloading(true);
    setDlProgress(0);
    setError("");

    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error("Fetch failed");

      const total  = Number(response.headers.get("Content-Length")) || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) setDlProgress(Math.round((received / total) * 100));
      }

      const blob    = new Blob(chunks);
      const blobUrl = URL.createObjectURL(blob);
      const ext     = quality === "audio" ? "m4a" : "mp4";
      const name    = videoInfo?.title
        ? `${videoInfo.title.slice(0, 60).replace(/[^\w\s-]/g, "")}.${ext}`
        : `video_${Date.now()}.${ext}`;

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);

    } catch {
      setError("Download failed. Try again or use a different quality.");
    }

    setDlProgress(0);
    setDownloading(false);
  };

  // ── Paste ───────────────────────────────────────────────────────────────────
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
      setError("");
    } catch {
      inputRef.current?.focus();
    }
  };

  // ── Clear ───────────────────────────────────────────────────────────────────
  const clearAll = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setUrl(""); setVideoInfo(null); setVideoUrl(null);
    setPreviewUrl(null); setError(""); setProgress(0);
    setShowFormats(false); setDlProgress(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen pb-24 font-sans"
      style={{
        background: "linear-gradient(160deg, #fafaf9 0%, #f5f0e8 50%, #faf7f2 100%)",
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* Subtle grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "180px",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-12 md:pt-20">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-10 md:mb-14">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-amber-500" />
            <span
              className="text-[11px] tracking-[0.2em] text-stone-400 uppercase font-sans font-semibold"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              Free · No signup · Instant
            </span>
          </div>

          <h1
            className="text-[2.6rem] md:text-[4rem] font-bold text-stone-900 leading-[1.05] tracking-tight"
          >
            Download any<br />
            <em className="not-italic" style={{
              background: "linear-gradient(90deg, #d97706, #ea580c)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>social video.</em>
          </h1>

          <p
            className="mt-4 text-stone-500 text-[15px] leading-relaxed max-w-sm"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            YouTube, TikTok, Instagram, Twitter, Reddit and more — paste the link below.
          </p>
        </div>

        {/* ── Input Card ──────────────────────────────────────────────────── */}
        {!videoUrl && (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_40px_rgba(0,0,0,0.07)] border border-stone-200/60 overflow-hidden">

            <div className="p-6 md:p-8">

              {/* URL field */}
              <div className="relative mb-5">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Link2 size={17} className="text-stone-400" />
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); fetchVideo(); } }}
                  placeholder="https://youtube.com/watch?v=..."
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-11 pr-20 py-4 text-stone-900 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all placeholder:text-stone-400"
                />

                <button
                  onClick={url ? () => { setUrl(""); setError(""); } : handlePaste}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-[11px] font-bold text-stone-500 font-sans transition-colors"
                >
                  {url ? <X size={13} /> : "Paste"}
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                  <p className="text-red-600 text-[13px] font-sans leading-snug">{error}</p>
                </div>
              )}

              {/* Quality */}
              <div className="grid grid-cols-5 gap-1.5 mb-6">
                {QUALITY_OPTIONS.map(q => (
                  <button
                    key={q.value}
                    onClick={() => setQuality(q.value)}
                    className={`relative p-2.5 rounded-xl border text-center transition-all font-sans ${
                      quality === q.value
                        ? "border-amber-400 bg-amber-50 shadow-sm"
                        : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    <div className="text-base mb-0.5">{q.icon}</div>
                    <div className="text-[12px] font-bold text-stone-800">{q.label}</div>
                    <div className="text-[9px] text-stone-400 leading-none">{q.sub}</div>
                    {quality === q.value && (
                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                ))}
              </div>

              {/* Progress bar */}
              {loading && (
                <div className="mb-4">
                  <ProgressBar value={progress} />
                  <p className="text-[11px] text-stone-400 mt-1.5 font-sans text-center">
                    Fetching video information…
                  </p>
                </div>
              )}

              {/* Fetch button */}
              <button
                onClick={fetchVideo}
                disabled={loading || !url.trim()}
                className="w-full py-4 rounded-2xl font-bold text-[15px] font-sans flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: loading || !url.trim()
                    ? "#d6d3d1"
                    : "linear-gradient(135deg, #1c1917 0%, #292524 100%)",
                  color: "#fff",
                  boxShadow: loading || !url.trim() ? "none" : "0 4px 24px rgba(28,25,23,0.25)",
                }}
              >
                {loading
                  ? <><RefreshCcw size={17} className="animate-spin" /> Fetching…</>
                  : "Fetch Content"}
              </button>

            </div>
          </div>
        )}

        {/* ── Result Card ──────────────────────────────────────────────────── */}
        {videoUrl && (
          <div
            ref={resultRef}
            className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_2px_40px_rgba(0,0,0,0.07)] border border-stone-200/60 overflow-hidden"
          >
            {/* Video meta header */}
            {videoInfo?.title && (
              <div className="px-6 pt-6 pb-4 border-b border-stone-100">
                <VideoMeta info={videoInfo} />
                <p className="mt-2 text-stone-800 text-[15px] font-semibold leading-snug line-clamp-2 font-sans">
                  {videoInfo.title}
                </p>
                {videoInfo.uploader && (
                  <p className="text-stone-400 text-[12px] mt-0.5 font-sans">{videoInfo.uploader}</p>
                )}
              </div>
            )}

            {/* Player */}
            <div className="relative bg-stone-950">
              {previewLoading && (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <RefreshCcw size={22} className="text-stone-500 animate-spin" />
                  <p className="text-stone-500 text-[13px] font-sans">Loading preview…</p>
                </div>
              )}

              {previewUrl && !previewLoading && (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[500px] object-contain"
                />
              )}

              {!previewUrl && !previewLoading && (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <Video size={28} className="text-stone-600" />
                  <p className="text-stone-500 text-[13px] font-sans">Preview not available</p>
                </div>
              )}
            </div>

            {/* Formats accordion */}
            {videoInfo?.formats?.length > 0 && (
              <div className="border-t border-stone-100">
                <button
                  onClick={() => setShowFormats(f => !f)}
                  className="w-full flex items-center justify-between px-6 py-3 text-[12px] text-stone-500 font-sans font-semibold hover:bg-stone-50 transition-colors"
                >
                  <span>{videoInfo.formats.length} available formats</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showFormats ? "rotate-180" : ""}`}
                  />
                </button>

                {showFormats && (
                  <div className="px-6 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {videoInfo.formats.map(f => (
                      <div
                        key={f.format_id}
                        className="px-3 py-2 bg-stone-50 rounded-xl border border-stone-100 font-sans"
                      >
                        <div className="text-[12px] font-bold text-stone-700">
                          {f.resolution}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {f.ext} {f.fps ? `· ${f.fps}fps` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="px-6 pb-6 pt-4 space-y-3 border-t border-stone-100">

              {/* Download progress */}
              {downloading && dlProgress > 0 && (
                <div className="mb-1">
                  <ProgressBar value={dlProgress} />
                  <p className="text-[11px] text-stone-400 mt-1 font-sans text-center">
                    Downloading… {dlProgress}%
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-red-600 text-[13px] font-sans">{error}</p>
                </div>
              )}

              <button
                onClick={downloadVideo}
                disabled={downloading}
                className="w-full py-4 rounded-2xl font-bold text-[15px] font-sans flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{
                  background: downloading
                    ? "#d6d3d1"
                    : "linear-gradient(135deg, #d97706 0%, #ea580c 100%)",
                  color: "#fff",
                  boxShadow: downloading ? "none" : "0 4px 20px rgba(217,119,6,0.35)",
                }}
              >
                {quality === "audio"
                  ? <Volume2 size={17} />
                  : <Download size={17} />}
                {downloading
                  ? (dlProgress > 0 ? `${dlProgress}%` : "Preparing…")
                  : `Download ${quality === "audio" ? "Audio" : "Video"}`}
              </button>

              <button
                onClick={clearAll}
                className="w-full py-3 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-600 font-semibold text-[14px] font-sans transition-colors"
              >
                ← Download another video
              </button>
            </div>
          </div>
        )}

        {/* ── SEO ──────────────────────────────────────────────────────────── */}
        <div className="mt-20 text-stone-500 text-[14px] leading-relaxed font-sans space-y-4 max-w-xl">
          <h2 className="text-xl font-bold text-stone-700">Free Online Video Downloader</h2>
          <p>
            Download videos from YouTube, TikTok, Instagram, Facebook, Twitter, Vimeo and more.
            No account needed — paste the link, choose a quality, and save.
          </p>
          <h3 className="text-base font-bold text-stone-600">How to use</h3>
          <ol className="list-decimal pl-5 space-y-1 text-[13px]">
            <li>Copy the video link from the platform.</li>
            <li>Paste it into the input above.</li>
            <li>Select a quality (Best, 1080p, 720p, 480p, or Audio only).</li>
            <li>Click <strong>Fetch Content</strong>.</li>
            <li>Preview and click <strong>Download</strong>.</li>
          </ol>
        </div>

      </div>
    </div>
  );
}