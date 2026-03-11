import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText,
  PlusSquare,
  User,
  LayoutDashboard,
  X,
  ChevronRight
} from "lucide-react";

export default function Sidebar({ onClose }) {
  return (
    <aside className="w-72 h-full bg-[#020617] text-white border-r border-orange-500/10 flex flex-col relative">
      
      {/* MOBILE CLOSE BUTTON - Glass effect */}
      <div className="lg:hidden flex justify-end p-4 absolute right-0 top-0 z-10">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20"
        >
          <X size={20} />
        </motion.button>
      </div>



      {/* SCROLLABLE MENU */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8 sidebar-scroll">
        
        {/* EBAY SECTION */}
        <Section title="EBAY ECOSYSTEM">
          <Item to="/traffic-report-analysis" icon={FileText} label="Traffic Report Analysis" onClick={onClose} />
          <Item to="/Keyword-analysis" icon={PlusSquare} label="Keyword Analysis" onClick={onClose} />
          <Item to="/Seller-analysis" icon={User} label="Seller Analysis" onClick={onClose} />
          <Item to="/ebay-template" icon={LayoutDashboard} label="Template Generator" onClick={onClose} />
          <Item to="/performance-tracker" icon={LayoutDashboard} label="Traffic Report Analysis" onClick={onClose} />
             <Item to="/trafic-report-compare" icon={LayoutDashboard} label="Traffic Report Compare" onClick={onClose} />
        </Section>

      </div>



    </aside>
  );
}

/* ================= HELPER COMPONENTS ================= */

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <p className="px-4 text-[10px] text-orange-500/60 font-bold tracking-[0.2em] uppercase">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Item({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center font-[00] justify-between px-4 py-3 rounded-xl text-sm  transition-all duration-300
        ${
          isActive
            ? "bg-orange-500/10 text-[#c7c7c7] ring-1 ring-orange-500/20"
            : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div className="flex items-center gap-3">
            <Icon size={18} className={`${isActive ? "text-orange-500" : "text-gray-500 group-hover:text-orange-400"} transition-colors`} />
            <span className="truncate">{label}</span>
          </div>
          
          {/* Active Indicator Arrow */}
          {isActive && (
            <motion.div layoutId="activeArrow">
              <ChevronRight size={14} className="text-orange-500" />
            </motion.div>
          )}

          {/* Background Glow Effect on Active */}
          {isActive && (
            <div className="absolute inset-0 bg-orange-500/5 blur-xl -z-10 rounded-xl" />
          )}
        </>
      )}
    </NavLink>
  );
}