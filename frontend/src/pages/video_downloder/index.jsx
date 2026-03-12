import { useState, useRef } from "react";
import API from "../../config/api";
import {
  Download,
  Link2,
  RefreshCcw
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

    if (previewUrl?.startsWith("blob:"))
      URL.revokeObjectURL(previewUrl);

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

        <div className="text-center mb-6 md:mb-10">

          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
            Download Any <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-600">
              Social Video
            </span>
          </h1>

          <p className="text-slate-500 mt-4 text-sm md:text-[15px] font-medium max-w-md mx-auto px-4">
            Save content from your favorite platforms instantly.
          </p>

        </div>

        {/* MAIN DOWNLOADER CARD */}
        <div className="w-full max-w-2xl bg-white/70 backdrop-blur-2xl border border-white/50 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.04)] overflow-hidden">

          {!videoUrl && (

            <div className="p-6 md:p-10">

              {/* URL INPUT */}
              <div className="relative group mb-6">

                <div className="absolute inset-y-0 left-4 md:left-5 flex items-center pointer-events-none">
                  <Link2 className="text-slate-400" size={20} />
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e)=>{
                    setUrl(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e)=>{
                    if(e.key==="Enter"){
                      e.preventDefault();
                      fetchVideo();
                    }
                  }}
                  placeholder="Paste video URL here..."
                  className="w-full bg-white border-2 border-slate-100 rounded-2xl pl-12 md:pl-14 pr-24 md:pr-28 py-4 md:py-5 text-slate-900 font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm text-sm md:text-base"
                />

                <button
                  onClick={url ? ()=>setUrl("") : handlePaste}
                  className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 px-3 md:px-4 py-2 bg-slate-100 rounded-xl text-[10px] md:text-xs font-bold text-slate-600"
                >
                  {url ? "Clear" : "Paste"}
                </button>

              </div>

              {/* QUALITY SELECTOR */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-6">

                {QUALITY_OPTIONS.map((q)=>(
                  
                  <button
                    key={q.value}
                    onClick={()=>setQuality(q.value)}
                    className={`p-3 rounded-xl border text-left transition
                    ${quality === q.value
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 bg-white"}
                    `}
                  >

                    <div className="text-sm font-bold">
                      {q.label}
                    </div>

                    <div className="text-[10px] text-slate-500">
                      {q.sub}
                    </div>

                  </button>

                ))}

              </div>

              {/* FETCH BUTTON */}
              <button
                onClick={fetchVideo}
                disabled={loading || !url.trim()}
                className="w-full py-4 md:py-5 bg-slate-900 text-white rounded-2xl font-black text-base md:text-lg shadow-xl flex items-center justify-center gap-2"
              >

                {loading
                  ? <RefreshCcw className="animate-spin" size={20}/>
                  : "Fetch Content"}

              </button>

            </div>

          )}

          {videoUrl && (

            <div ref={resultRef} className="p-6 md:p-10 border-t border-slate-100">

              <div className="w-full max-w-md mx-auto rounded-xl overflow-hidden bg-black">

                {previewLoading && (
                  <div className="flex items-center justify-center h-40 text-white text-sm">
                    Loading Preview...
                  </div>
                )}

                {previewUrl && (
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-[660px] object-contain"
                  />
                )}

                {!previewUrl && !previewLoading && (
                  <div className="flex items-center justify-center h-40 text-white text-sm">
                    Preview not available
                  </div>
                )}

              </div>

              <button
                onClick={downloadVideo}
                disabled={downloading}
                className="mt-6 w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <Download size={18}/>
                {downloading ? "Downloading..." : "Download Video"}
              </button>

              <button
                onClick={clearAll}
                className="mt-4 w-full py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold"
              >
                Download Another Video
              </button>

            </div>

          )}

        </div>

        {/* SEO CONTENT SECTION */}
        <div className="max-w-4xl mx-auto mt-20 px-6 text-slate-700 leading-relaxed">

          <h2 className="text-3xl font-bold text-slate-900 mb-6">
            Free Online Video Downloader
          </h2>

          <p className="mb-4">
            This free online video downloader allows you to download videos
            from popular social media platforms such as Instagram, TikTok,
            YouTube, Facebook and Vimeo.
          </p>

          <p className="mb-6">
            Simply paste the video link above, select your preferred
            quality and download the video instantly.
          </p>

          <h3 className="text-2xl font-semibold text-slate-900 mb-4">
            How to Use
          </h3>

          <ol className="list-decimal pl-6 space-y-2">
            <li>Copy the video link from the social media platform.</li>
            <li>Paste the link into the input box above.</li>
            <li>Select the quality you want.</li>
            <li>Click Fetch Content.</li>
            <li>Preview and download the video.</li>
          </ol>

        </div>

      </div>

    </div>

  );

}