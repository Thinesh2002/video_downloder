import { useState, useRef, useEffect } from "react";
import API from "../../config/api";
import { Download, Link2, Clipboard, RefreshCcw, Play, CheckCircle2, AlertCircle, Music, Trash2 } from "lucide-react";

const DIRECT_PREVIEW = ["instagram", "vimeo"];

const PLATFORMS = [
  { name: "YouTube", icon: "▶", color: "bg-red-500 shadow-red-200" },
  { name: "Instagram", icon: "◈", color: "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 shadow-pink-200" },
  { name: "TikTok", icon: "♪", color: "bg-slate-900 shadow-slate-300" },
  { name: "Pinterest", icon: "⊕", color: "bg-red-600 shadow-red-200" },
  { name: "Twitter/X", icon: "✕", color: "bg-black shadow-slate-400" },
  { name: "Facebook", icon: "ƒ", color: "bg-blue-600 shadow-blue-200" },
];

const QUALITY_OPTIONS = [
  { value: "best", label: "Best", sub: "Max Quality" },
  { value: "high", label: "1080p", sub: "Full HD" },
  { value: "medium", label: "720p", sub: "HD" },
  { value: "low", label: "480p", sub: "SD" },
  { value: "audio", label: "Audio", sub: "MP3/M4A" },
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
      setProgress(p => (p < 85 ? p + Math.random() * 12 : p));
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
          block: "start",
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
          const blobUrl = URL.createObjectURL(new Blob([previewRes.data], { type: "video/mp4" }));
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
    if (!videoUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const ext = quality === "audio" ? "m4a" : "mp4";
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
    <div className="bg-[#F8FAFC] min-h-screen relative overflow-hidden font-sans pb-20 touch-pan-y">
      <div className="relative z-10 flex flex-col items-center px-4 pt-8 md:pt-12">
        
        {/* HEADER */}
        <div className="text-center mb-6 md:mb-10 animate-in fade-in slide-in-from-top-4 duration-1000">
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
            Download Any <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-600">Social Video</span>
          </h1>
          <p className="text-slate-500 mt-4 text-sm md:text-[15px] font-medium max-w-md mx-auto px-4">
            Save content from your favorite platforms in 4K instantly.
          </p>
        </div>

        {/* PLATFORMS - Added Horizontal Scroll for Mobile */}
        <div className="w-full flex justify-start md:justify-center overflow-x-auto no-scrollbar pb-4 mb-8">
          <div className="flex flex-nowrap md:flex-wrap gap-3 px-4">
            {PLATFORMS.map(p => (
              <div key={p.name} className="flex-shrink-0 flex items-center gap-2.5 bg-white border border-slate-100 px-4 py-2.5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <div className={`${p.color} w-5 h-5 rounded-lg flex items-center justify-center text-white text-[9px]`}>
                  {p.icon}
                </div>
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-2xl bg-white/70 backdrop-blur-2xl border border-white/50 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] overflow-hidden transition-all duration-500">
          
          {/* INPUT & QUALITY */}
          {!videoUrl && (
            <div className="p-6 md:p-10 animate-in fade-in duration-500">
              <div className="relative group mb-6">
                <div className="absolute inset-y-0 left-4 md:left-5 flex items-center pointer-events-none">
                  <Link2 className="text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
                  placeholder="Paste video URL here..."
                  className="w-full bg-white/50 border-2 border-slate-100 rounded-2xl pl-12 md:pl-14 pr-24 md:pr-28 py-4 md:py-5 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm text-sm md:text-base"
                />
                <button 
                  onClick={url ? () => setUrl("") : handlePaste} 
                  className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 px-3 md:px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl text-[10px] md:text-xs font-bold text-slate-600 transition-all"
                >
                  {url ? "Clear" : "Paste"}
                </button>
              </div>

              {/* QUALITY OPTIONS - Responsive Grid */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-2.5 mb-8">
                {QUALITY_OPTIONS.map(q => (
                  <button key={q.value} onClick={() => setQuality(q.value)}
                    className={`flex flex-col items-center justify-center py-3 rounded-2xl border-2 transition-all active:scale-95 ${quality === q.value ? "border-blue-500 bg-blue-50/50" : "border-slate-50 bg-slate-50/50"}`}>
                    <span className={`text-[10px] md:text-[11px] font-black ${quality === q.value ? "text-blue-600" : "text-slate-700"}`}>{q.label}</span>
                    <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{q.sub}</span>
                  </button>
                ))}
              </div>

              <button onClick={fetchVideo} disabled={loading || !url.trim()}
                className="w-full py-4 md:py-5 bg-slate-900 text-white rounded-2xl font-black text-base md:text-lg shadow-xl shadow-slate-200 hover:shadow-slate-300 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <RefreshCcw className="animate-spin" size={20} /> : "Fetch Content"}
              </button>
            </div>
          )}

          {loading && (
            <div className="h-1.5 w-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
            </div>
          )}

          {error && (
            <div className="mx-6 md:mx-8 my-6 md:my-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-xs md:text-sm animate-shake">
              <AlertCircle className="flex-shrink-0" size={20} /> {error}
            </div>
          )}

          {/* RESULTS */}
          {videoUrl && (
            <div ref={resultRef} className="p-6 md:p-10 animate-in slide-in-from-bottom-10 duration-700">
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                {/* Responsive Video Container */}
                <div className="w-full md:w-5/12 aspect-video md:aspect-[9/16] bg-black rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl border-4 md:border-[5px] border-white relative">
                  {previewLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-2">
                      <RefreshCcw className="animate-spin text-blue-500" />
                      <span className="text-[10px] text-white font-bold uppercase tracking-widest">Generating...</span>
                    </div>
                  ) : previewUrl ? (
                    <video src={previewUrl} controls className="w-full h-full object-cover" playsInline />
                  ) : (
                    <div className="w-full h-full flex flex-center items-center justify-center text-slate-500 text-[10px] font-bold">No Preview</div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-center text-center md:text-left">
                  <div className="mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full mb-3">
                      <CheckCircle2 size={14} />
                      <span className="text-[10px] font-black uppercase tracking-wider">Ready</span>
                    </div>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Download Ready</h3>
                    <p className="text-slate-500 text-sm font-medium mt-1 uppercase tracking-widest">{quality} Quality</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button onClick={downloadVideo} disabled={downloading}
                      className="w-full py-4 md:py-5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black text-lg md:text-xl shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                      {downloading ? "Downloading..." : <><Download size={22} /> Save Now</>}
                    </button>

                    <button onClick={clearAll}
                      className="w-full py-3 md:py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]">
                      ← Fetch Another Video
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}