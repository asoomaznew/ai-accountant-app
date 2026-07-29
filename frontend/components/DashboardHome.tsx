// ─────────────────────────────────────────────────────────────────────────────
// components/DashboardHome.tsx
// AI Accountant v2 — Enterprise Dashboard Homepage
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Tags, Briefcase, Stethoscope, FileSearch, MessageSquare,
  RefreshCw, Calculator, FileStack, Receipt, FileBarChart,
  Sparkles, ArrowRight, Search, FileText,
} from "lucide-react";
import { cn } from "../lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AppMode =
  | "home" | "entry" | "rename" | "warba_entry" | "keyword_search"
  | "search" | "convert_001_to_49" | "ending_balance" | "merge_pdfs"
  | "pos_entry" | "pos_report" | "smart_merge" | "v3_architecture" | "bahrain_cust_payment";

interface ToolCard {
  readonly id: AppMode;
  readonly name: string;
  readonly desc: string;
  readonly icon: React.ReactNode;
  readonly gradient: string;
  readonly tag?: "AI" | "Auto" | "New";
}

interface DashboardHomeProps {
  onNavigate: (mode: AppMode) => void;
}


const TOOLS: readonly ToolCard[] = [
  {
    id: "entry",
    name: "Merchant Entry",
    desc: "Upload a bank statement — extracts all merchant transactions and generates ready-to-post journal entries in KD",
    icon: <Briefcase size={20} />,
    gradient: "from-blue-500 to-cyan-500",
    tag: "Auto",
  },
  {
    id: "warba_entry",
    name: "Warba Entry",
    desc: "Specialized automation for Warba Polyclinics — reads Warba bank statements and creates formatted journal entries",
    icon: <Stethoscope size={20} />,
    gradient: "from-sky-500 to-blue-600",
  },
  {
    id: "convert_001_to_49",
    name: "Convert 001 → 49",
    desc: "Upload a statement in account format 001 — converts all entries to format 49 with matching debit/credit structure",
    icon: <RefreshCw size={20} />,
    gradient: "from-rose-500 to-pink-600",
  },
  {
    id: "ending_balance",
    name: "Ending Balance",
    desc: "Upload period statements — automatically calculates opening, movement, and closing balance for each account",
    icon: <Calculator size={20} />,
    gradient: "from-indigo-500 to-blue-600",
  },
  {
    id: "merge_pdfs",
    name: "Merge PDFs",
    desc: "Select multiple PDF files — merges them into a single organized file in the order you choose, downloadable instantly",
    icon: <FileStack size={20} />,
    gradient: "from-teal-500 to-cyan-600",
  },
  {
    id: "pos_entry",
    name: "POS Entry",
    desc: "Upload POS terminal reports — extracts daily sales totals and creates the corresponding accounting journal entries",
    icon: <Receipt size={20} />,
    gradient: "from-orange-500 to-red-500",
  },
  {
    id: "pos_report",
    name: "POS Report",
    desc: "Upload POS data files — generates a summarized report with daily, weekly, or monthly sales breakdown by terminal",
    icon: <FileBarChart size={20} />,
    gradient: "from-lime-500 to-green-600",
  },
  {
    id: "smart_merge",
    name: "Smart Merge",
    desc: "Upload related PDFs — AI reads and sorts them by date or content, then merges them in the correct logical order",
    icon: <Sparkles size={20} />,
    gradient: "from-fuchsia-500 to-violet-600",
    tag: "AI",
  },
  {
    id: "rename",
    name: "Rename Files",
    desc: "Upload files — AI automatically renames them based on content, date, account name or custom rules",
    icon: <Tags size={20} />,
    gradient: "from-violet-500 to-purple-600",
    tag: "AI",
  },
  {
    id: "search",
    name: "PDF Q&A",
    desc: "Upload a PDF and ask questions — AI reads the document and answers in natural language with source references",
    icon: <MessageSquare size={20} />,
    gradient: "from-pink-500 to-rose-600",
    tag: "AI",
  },
  {
    id: "keyword_search",
    name: "Keyword Search",
    desc: "Search across multiple PDF files for any keyword or phrase — returns exact matches with page references",
    icon: <Search size={20} />,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    id: "v3_architecture",
    name: "V3 Architecture",
    desc: "View the new 12-layer OS architecture pipeline with advanced agent network",
    icon: <Sparkles size={20} />,
    gradient: "from-indigo-500 to-purple-500",
    tag: "New",
  },
  {
    id: "bahrain_cust_payment",
    name: "Bahrain CustPayment",
    desc: "Process emails to Excel for Bahrain CustPayment",
    icon: <FileText size={20} />,
    gradient: "from-sky-400 to-indigo-500",
  },
] as const;

const TAG_STYLES: Record<NonNullable<ToolCard["tag"]>, string> = {
  AI: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Auto: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  New: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

interface StatCard {
  readonly label: string;
  readonly value: string | number;
  readonly trend: string;
  readonly trendUp: boolean;
  readonly icon: React.ReactNode;
  readonly gradient: string;
}

const StatCardItem = memo<StatCard>(({ label, value, trend, trendUp, icon, gradient }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative flex flex-col gap-4 p-5 rounded-2xl bg-[#13141a] border border-white/[0.07] overflow-hidden group hover:border-white/[0.12] transition-colors"
  >
    <div
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br text-white shadow-lg shrink-0",
        gradient
      )}
      aria-hidden="true"
    >
      {icon}
    </div>
    <div className="space-y-0.5">
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-[12px] text-slate-500">{label}</p>
    </div>
    <p
      className={cn("text-[11px] font-medium", trendUp ? "text-emerald-400" : "text-red-400")}
    >
      {trend}
    </p>

    {/* Background glow */}
    <div
      className={cn(
        "absolute -right-5 -bottom-5 w-24 h-24 rounded-full bg-gradient-to-br blur-2xl opacity-0 group-hover:opacity-[0.12] transition-opacity",
        gradient
      )}
      aria-hidden="true"
    />
  </motion.div>
));
StatCardItem.displayName = "StatCardItem";

// ─────────────────────────────────────────────────────────────────────────────
// Tool Card
// ─────────────────────────────────────────────────────────────────────────────

interface ToolCardItemProps {
  tool: ToolCard;
  onNavigate: (mode: AppMode) => void;
  index: number;
}

const ToolCardItem = memo<ToolCardItemProps>(({ tool, onNavigate, index }) => {
  const handleClick = useCallback(() => onNavigate(tool.id), [onNavigate, tool.id]);

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={handleClick}
      className={cn(
        "group relative flex flex-col items-start gap-3.5 p-5 rounded-2xl text-left cursor-pointer overflow-hidden",
        "bg-[#13141a] border border-white/[0.07] hover:border-white/[0.13] hover:bg-[#15161d]",
        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
      )}
      aria-label={`Open ${tool.name}: ${tool.desc}`}
    >
      {/* Tag */}
      {tool.tag && (
        <span
          className={cn(
            "absolute top-3.5 right-3.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-md border",
            TAG_STYLES[tool.tag]
          )}
          aria-label={tool.tag}
        >
          {tool.tag}
        </span>
      )}

      {/* Icon */}
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br text-white shadow-md",
          "transition-transform duration-200 group-hover:scale-105",
          tool.gradient
        )}
        aria-hidden="true"
      >
        {tool.icon}
      </div>

      {/* Text */}
      <div className="space-y-1 pr-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[13px] font-semibold text-slate-200 group-hover:text-white transition-colors">
            {tool.name}
          </h3>
        </div>
        <p className="text-[12px] text-slate-500 line-clamp-2 group-hover:text-slate-400 transition-colors leading-relaxed">
          {tool.desc}
        </p>
      </div>

      {/* Arrow */}
      <ArrowRight
        size={14}
        className="absolute bottom-4 right-4 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all"
        aria-hidden="true"
      />

      {/* Hover glow */}
      <div
        className={cn(
          "absolute -right-8 -bottom-8 w-24 h-24 rounded-full bg-gradient-to-br blur-2xl opacity-0 group-hover:opacity-10 transition-opacity",
          tool.gradient
        )}
        aria-hidden="true"
      />
    </motion.button>
  );
});
ToolCardItem.displayName = "ToolCardItem";


// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigate }) => {
  return (
    <div className="space-y-8">
      {/* ── Welcome ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-xl font-bold text-white leading-none">
          Welcome back, Haitham 👋
        </h2>
        <p className="text-[13px] text-slate-500 mt-1.5">
          All AI engines are ready. Your financial data stays private — processed locally on this device.
        </p>
      </motion.div>


      {/* ── Tools Grid ── */}
      <section aria-label="Accounting tools">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-semibold text-white">All Tools</h3>
          <span className="text-[11px] text-slate-600">
            {TOOLS.length} tools available
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {TOOLS.map((tool, i) => (
            <ToolCardItem
              key={tool.id}
              tool={tool}
              onNavigate={onNavigate}
              index={i}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default memo(DashboardHome);
