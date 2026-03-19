import { useState, useRef } from "react";
import API from "../../config/api";
import {
  Download,
  Link2,
  RefreshCcw,
  Search,
  X,
  ClipboardPaste,
  Play,
  RotateCcw,
  Share2,
  AlertCircle
} from "lucide-react";

const DIRECT_PREVIEW = ["instagram", "vimeo"];

const QUALITY_OPTIONS = [
  { value: "best", label: "Best", sub: "Max Quality" },
  { value: "high", label: "1080p", sub: "Full HD" },
  { value: "medium", label: "720p", sub: "HD" },
  { value: "low", label: "480p", sub: "SD" },
  { value: "audio", label: "Audio", sub: "MP3/M4A" }
];

export default function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [quality, setQuality] = useState("best");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const inputRef = useRef(null);
  const resultRef = useRef(null);

  const fetchVideo = async () => {
    if (!url.trim()) {
      setError("Please paste a video URL first.");
      return;
    }

    setError("");
    setVideoInfo(null);
    setVideoUrl(null);
    setPreviewUrl(null);
    setLoading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((p) => (p < 85 ? p + Math.random() * 12 : p));
    }, 300);

    try {
      const res = await API.post("/video/url", { url: url.trim(), quality });
      clearInterval(interval);
      setProgress(100);

      const data = res.data.data;
      setVideoUrl(data.video_url);
      setVideoInfo(data);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 300);

      if (DIRECT_PREVIEW.includes(data.platform)) {
        setPreviewUrl(data.video_url);
      } else {
        setPreviewLoading(true);
        try {
          const previewRes = await API.post(
            "/video/preview",
            { url: url.trim(), quality: "medium" },
            { responseType: "blob" }
          );

          const blobUrl = URL.createObjectURL(
            new Blob([previewRes.data], { type: "video/mp4" })
          );
          setPreviewUrl(blobUrl);
        } catch {
          setPreviewUrl(null);
        }
        setPreviewLoading(false);
      }
    } catch (err) {
      clearInterval(interval);
      setProgress(0);
      setError(err?.response?.data?.message || "Could not fetch video.");
    }
    setLoading(false);
  };

const downloadVideo = async () => {
  if (!url) return;

  setDownloading(true);

  try {
    const res = await fetch(`${API.defaults.baseURL}/video/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        quality,
        format: quality === "audio" ? "mp3" : "mp4",
      }),
    });

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const ext = quality === "audio" ? "mp3" : "mp4";

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `video_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);

  } catch {
    setError("Download failed. Please try again.");
  }

  setDownloading(false);
};

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError("");
    } catch {
      inputRef.current?.focus();
    }
  };

  const clearAll = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setUrl("");
    setVideoInfo(null);
    setVideoUrl(null);
    setPreviewUrl(null);
    setError("");
    setProgress(0);
  };

  return (
    <div className="min-h-screen  font-sans selection:bg-green-200">
      <div className="flex flex-col items-center px-4 pt-5 pb-20 bg-[#0F5C3B]">
        
        {/* HEADER */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-block px-4 py-1.5 mb-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-green-100 text-[10px] font-bold tracking-widest uppercase">
            Fast & Free Downloader
          </div>
          <h1 className="text-white text-[40px] font-[700] tracking-tight mb-0 drop-shadow-2xl">
            Social Video <span className="text-green-400">Downloader</span>
          </h1>
          <p className="text-green-100/70 text-[14px]   mx-auto leading-relaxed">
            Download your favorite social media videos without watermark in high quality instantly.
          </p>
        </div>

        {/* ================= BEFORE SEARCH ================= */}
        {!videoUrl && (
          <div className="w-full max-w-3xl animate-in fade-in zoom-in duration-500">
            {/* INPUT SECTION WITH GLOW */}
            <div className="relative group mb-8">
              <div className="absolute -inset-1 bg-gradient-to-r from-green-400 to-emerald-500 rounded-2xl blur opacity-25 group-focus-within:opacity-60 transition duration-500"></div>
              <div className="relative flex bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/20">
                <div className="flex items-center pl-6 text-gray-400">
                  <Search size={22} className="group-focus-within:text-green-600 transition-colors" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      fetchVideo();
                    }
                  }}
                  placeholder="Paste your video link here..."
                  className="flex-1 px-5 py-3 outline-none text-lg text-gray-800 placeholder:text-gray-400 font-[400]"
                />
                <button
                  onClick={url ? () => setUrl("") : handlePaste}
                  className="px-8 bg-gray-50 hover:bg-gray-100 font-black text-gray-600 transition-all border-l border-gray-100 flex items-center gap-2 active:bg-gray-200"
                >
                  {url ? <X size={20} className="text-red-500" /> : <ClipboardPaste size={20} className="text-green-600" />}
                  <span className="hidden sm:inline">{url ? "Clear" : "Paste"}</span>
                </button>
              </div>
            </div>

            {/* QUALITY OPTIONS - MODERN CHIPS */}
            <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 flex flex-wrap gap-4 justify-center mb-10 border border-white/10 shadow-xl">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value}
                  onClick={() => setQuality(q.value)}
                  className={`relative px-6 py-4 rounded-2xl border-2 transition-all duration-300 transform hover:-translate-y-1 active:scale-95 flex flex-col items-center min-w-[110px]
                  ${quality === q.value
                    ? "bg-white border-green-400 shadow-[0_0_25px_rgba(74,222,128,0.4)] text-green-800 scale-105"
                    : "bg-white/10 border-transparent hover:bg-white/20 text-green-100/80"}
                  `}
                >
                  <div className="font-black text-sm uppercase tracking-wider">{q.label}</div>
                  <div className={`text-[10px] mt-1 font-bold ${quality === q.value ? "text-green-600" : "text-green-100/50"}`}>
                    {q.sub}
                  </div>
                  {quality === q.value && (
                    <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white"></span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* SEARCH BUTTON */}
            <div className="text-center relative">
              {loading && (
                <div className="absolute -top-12 left-0 right-0 h-1 bg-white/10 rounded-full overflow-hidden w-48 mx-auto">
                  <div 
                    className="h-full bg-green-400 transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              )}
              <button
                onClick={fetchVideo}
                disabled={loading || !url.trim()}
                className={`group relative overflow-hidden px-9 py-3 rounded-2xl font-black text-xl transition-all duration-500 flex items-center gap-4 mx-auto
                  ${loading || !url.trim() 
                    ? "bg-white/20 text-white/50 cursor-not-allowed" 
                    : "bg-white text-[#0F5C3B] hover:bg-green-400 hover:text-white shadow-[0_15px_30px_-5px_rgba(0,0,0,0.3)] hover:shadow-green-500/50 active:scale-95"}
                `}
              >
                {loading ? (
                  <RefreshCcw className="animate-spin" size={24} />
                ) : (
                  <>
                    <Download size={24} className="group-hover:translate-y-1 transition-transform" />
                    <span>Get Video</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================= AFTER SEARCH ================= */}
        {videoUrl && (
          <div
            ref={resultRef}
            className="w-full max-w-5xl bg-white rounded-[2rem] p-6 md:p-10 flex flex-col md:flex-row gap-10 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] border border-white/20 animate-in slide-in-from-bottom-12 duration-700"
          >
            {/* LEFT: VIDEO PREVIEW */}
            <div className="w-full md:w-1/2 relative group">
              <div className="absolute -inset-1  rounded-3xl blur opacity-20 transition duration-500 group-hover:opacity-40"></div>
              <div className="relative aspect-[9/16] max-h-[500px] md:max-h-[600px] bg-black rounded-2xl overflow-hidden shadow-2xl mx-auto flex items-center justify-center">
                {previewLoading ? (
                  <div className="flex flex-col items-center gap-4 text-white">
                    <RefreshCcw className="animate-spin text-green-400" size={48} />
                    <p className="text-sm font-bold tracking-widest animate-pulse opacity-70">Loading...</p>
                  </div>
                ) : previewUrl ? (
                  <video
                    src={previewUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-gray-600 flex flex-col items-center gap-4">
                    <Play size={64} className="opacity-10" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-40 text-center">Preview not available<br/>Click download below</p>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: ACTIONS */}
            <div className="w-full md:w-1/2 flex flex-col">
              <div className="mb-10">
                <div className="flex items-center gap-2 text-green-600 font-black text-xs uppercase tracking-[0.2em] mb-3">
                  <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
                  Ready to save
                </div>
                <h3 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight mb-2">
                  Your video is ready for download!
                </h3>
                <p className="text-gray-500 font-medium flex items-center gap-2 text-sm">
                  <Link2 size={16} className="text-green-500" /> High-speed link by <span className="text-gray-900 font-bold">TECKVORA</span>
                </p>
              </div>

              <div className="space-y-4 mb-10">
                <button
                  onClick={downloadVideo}
                  disabled={downloading}
                  className="w-full group relative overflow-hidden bg-[#0F5C3B] text-white py-5 rounded-2xl font-black text-xl shadow-[0_10px_25px_-5px_rgba(15,92,59,0.4)] hover:shadow-green-900/40 hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12"></div>
                  {downloading ? (
                    <RefreshCcw className="animate-spin" size={24} />
                  ) : (
                    <Download size={24} className="group-hover:bounce" />
                  )}
                  <span>{downloading ? "Downloading..." : "DOWNLOAD NOW"}</span>
                </button>

                <button
                  onClick={clearAll}
                  className="w-full py-5 rounded-2xl font-bold text-gray-500 border-2 border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <RotateCcw size={20} />
                  SAVE ANOTHER VIDEO
                </button>
              </div>

              {/* SOCIAL & FOOTER */}
              <div className="mt-auto pt-8 border-t border-gray-100">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                  <Share2 size={14} className="text-green-500" /> Share with your friends
                </p>
                <div className="flex flex-wrap gap-4">
                  {[
                    { color: "bg-[#1877F2]", label: "F" },
                    { color: "bg-[#FF0000]", label: "Y" },
                    { color: "bg-[#25D366]", label: "W" },
                    { color: "bg-[#E4405F]", label: "I" },
                    { color: "bg-[#000000]", label: "X" }
                  ].map((social, i) => (
                    <div 
                      key={i} 
                      className={`${social.color} w-11 h-11 rounded-xl cursor-pointer hover:scale-110 hover:-rotate-6 transition-all shadow-lg flex items-center justify-center text-white font-black text-lg shadow-black/5`}
                    >
                      {social.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mt-8 flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-6 py-4 rounded-2xl text-red-200 animate-bounce">
            <AlertCircle size={20} />
            <p className="font-bold text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* FOOTER TEXT */}
      <p className="text-center text-green-100/30 text-xs font-bold tracking-tighter pb-10">
        &copy; 2026 TECKVORA - UNLIMITED SOCIAL DOWNLOADS
      </p>
    </div>
  );
}