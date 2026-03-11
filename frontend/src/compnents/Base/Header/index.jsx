import { useState, useEffect } from "react";
import { Download, Menu, X, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [menuOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const NAV_LINKS = [
    { label: "Home", href: "/" },
    { label: "Downloader", href: "/" },
    { label: "Supported", href: "/" },
    { label: "About", href: "/about" },
  ];

  return (
    <header
      className={`sticky top-0 z-[100] w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-slate-200 bg-white/90 backdrop-blur-md py-2"
          : "bg-transparent py-4"
      }`}
    >
      <div className="mx-auto px-5 flex items-center justify-between">

        {/* LOGO */}
        <Link to="/" className="flex items-center gap-3">
       <div className="flex flex-col">
            <span className="font-black text-[18px] md:text-[20px] tracking-tight text-[#1C1A17] leading-none">
              <span className="text-[#E8562A]">TECKVORA</span>
            </span>
            <span className="text-[9px] font-bold text-[#6B6560] uppercase tracking-[0.2em] mt-0.5">
              Video Downloader
            </span>
          </div>
        </Link>

        {/* DESKTOP NAVIGATION */}
        <nav className="hidden md:block">
          <ul className="flex items-center gap-1 bg-[#F2EFE9]/50 p-1.5 rounded-2xl border border-[#E2DDD5]/50">
            {NAV_LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  to={l.href}
                  className="px-4 py-2 text-[14px] font-bold text-[#6B6560] rounded-xl hover:bg-white hover:text-[#1C1A17] transition-all"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* ACTIONS */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 mr-2">
            <Link
              to="/login"
              className="text-sm font-bold text-[#6B6560] hover:text-[#1C1A17]"
            >
              Sign In
            </Link>

            <Link
              to="/downloader"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#1C1A17] text-white text-sm font-bold hover:bg-[#E8562A] transition-all shadow-lg shadow-black/5"
            >
              <Download size={18} /> Download Now
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2.5 rounded-xl bg-[#F2EFE9] text-[#1C1A17] active:scale-90 transition-transform relative z-[110]"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* MOBILE MENU */}
      <div
        className={`fixed inset-0 bg-white z-[105] flex flex-col px-6 pt-24 pb-10 transition-transform duration-500 ease-in-out md:hidden ${
          menuOpen ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-[#6B6560] uppercase tracking-[0.2em] mb-2 px-2">
            Menu
          </p>

          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              to={l.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between px-5 py-4 text-[18px] font-bold text-[#1C1A17] rounded-2xl bg-[#F8F7F4] active:bg-[#F2EFE9]"
            >
              {l.label}
              <ChevronRight size={20} className="text-[#E8562A]" />
            </Link>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <Link
            to="/login"
            onClick={() => setMenuOpen(false)}
            className="w-full text-center py-4 text-[16px] font-bold text-[#6B6560]"
          >
            Sign In to your account
          </Link>

          <Link
            to="/downloader"
            onClick={() => setMenuOpen(false)}
            className="flex items-center justify-center gap-3 bg-[#1C1A17] text-white font-bold py-5 rounded-2xl shadow-2xl shadow-black/20"
          >
            <Download size={20} /> Download App Now
          </Link>
        </div>
      </div>
    </header>
  );
}