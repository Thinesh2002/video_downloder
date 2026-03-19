import Header from "./Base/Header/index";

export default function Layout({ children }) {
  return (
    <div className="h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans selection:bg-blue-100">
      
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="h-[calc(100vh-4rem)] overflow-y-auto scroll-smooth">
        <div className="  animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>

    </div>
  );
}