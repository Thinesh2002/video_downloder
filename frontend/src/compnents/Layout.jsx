import { useEffect, useState, useRef } from "react";
import Header from "./Base/Header/index";
import Sidebar from "./Base/Sidebar/index";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        sidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target)
      ) {
        if (!event.target.closest("button")) {
          setSidebarOpen(false);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarOpen]);

  return (
    /* Background-ai light slate color-uku maathi irukkaen */
    <div className="h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans selection:bg-blue-100">
      
      {/* Header-ku onMenuClick prop correct-ah pass panni irukkaen */}
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex h-[calc(100vh-4rem)] relative">
        
        {/* Overlay with smooth blur */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 lg:hidden transition-opacity"
          />
        )}

        {/* Sidebar with Glass Effect */}
        <aside
          ref={sidebarRef}
          className={`
            fixed lg:relative z-40 h-full
            bg-white/80 backdrop-blur-md border-r border-slate-200
            transition-all duration-300 ease-in-out
            ${
              sidebarOpen
                ? "w-72 translate-x-0 opacity-100 shadow-xl"
                : "w-0 -translate-x-full lg:translate-x-0 opacity-0 lg:border-none"
            }
          `}
        >
          <div className="w-72 h-full">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-transparent scroll-smooth">
          <div className="max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}