// ─────────────────────────────────────────────────────────────────────────────
// components/DashboardLayout.tsx
// Enterprise-grade collapsible sidebar layout for AI Accountant v2
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, memo, useId, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  Landmark,
  BookOpen,
  ScanLine,
  BrainCircuit,
  Cpu,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Bell,
  Search,
  User,
  Menu,
  X,
  Activity,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "../lib/utils";
import AiCopilot from "./AiCopilot";
import { useAppStore } from "../store/useAppStore";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SIDEBAR_EXPANDED_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 72;

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type NavItemId =
  | "dashboard"
  // ── Accounting ──
  | "entry"
  | "warba_entry"
  | "convert_001_to_49"
  | "ending_balance"
  | "pos_entry"
  | "pos_report"
  | "smart_merge"
  | "merge_pdfs"
  | "bahrain_cust_payment"
  // ── File Tools ──
  | "rename"
  | "keyword_search"
  | "search"
  // ── System ──
  | "v3_architecture"
  | "ai_models"
  | "settings"
  // Legacy aliases kept for backward-compat
  | "invoices"
  | "bank_statements"
  | "journal_entries"
  | "processing_jobs";

export type ProcessingStatus = "idle" | "running" | "error";

interface NavItem {
  readonly id: NavItemId;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly badge?: number;
  // Future: href for React Router integration
  readonly href?: string;
}

export interface DashboardLayoutProps {
  children: React.ReactNode;
  activeNav: NavItemId;
  onNavChange: (id: NavItemId) => void;
  processingStatus?: ProcessingStatus;
  processingLabel?: string;
  /** Zustand integration point: pass store actions here in the future */
  onThemeToggle?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation items definition
// ─────────────────────────────────────────────────────────────────────────────

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "الرئيسية",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    label: "المحاسبة",
    items: [
      { id: "entry",             label: "Merchant Entry",   icon: <FileText size={18} /> },
      { id: "warba_entry",       label: "Warba Entry",      icon: <Landmark size={18} /> },
      { id: "convert_001_to_49", label: "Convert 001→49",  icon: <BookOpen size={18} /> },
      { id: "ending_balance",    label: "Ending Balance",   icon: <ScanLine size={18} /> },
      { id: "pos_entry",         label: "POS Entry",        icon: <Cpu size={18} /> },
      { id: "pos_report",        label: "POS Report",       icon: <Activity size={18} /> },
      { id: "merge_pdfs",        label: "Merge PDFs",       icon: <BookOpen size={18} /> },
      { id: "smart_merge",       label: "Smart Merge",      icon: <Sparkles size={18} />, badge: 0 },
      { id: "bahrain_cust_payment", label: "Bahrain CustPayment", icon: <FileText size={18} /> },
    ],
  },
  {
    label: "أدوات الملفات",
    items: [
      { id: "rename",         label: "AI File Renamer",    icon: <BrainCircuit size={18} /> },
      { id: "keyword_search", label: "Keyword Search",     icon: <Search size={18} /> },
      { id: "search",         label: "PDF Q&A",            icon: <Bell size={18} /> },
    ],
  },
  {
    label: "النظام",
    items: [
      { id: "v3_architecture", label: "V3 Architecture", icon: <LayoutDashboard size={18} /> },
      { id: "ai_models", label: "AI Engine",  icon: <BrainCircuit size={18} /> },
      { id: "settings",  label: "Settings",   icon: <Settings size={18} /> },
    ],
  },
] as const;

// Flatten for backward-compat lookups
const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(g => g.items);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: (id: NavItemId) => void;
}

const NavItemButton = memo<NavItemButtonProps>(
  ({ item, isActive, isCollapsed, onClick }) => {
    const tooltipId = useId();

    return (
      <li role="none">
        <button
          role="menuitem"
          aria-current={isActive ? "page" : undefined}
          aria-describedby={isCollapsed ? tooltipId : undefined}
          onClick={() => onClick(item.id)}
          className={cn(
            "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
            "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f1117]",
            isCollapsed ? "justify-center" : "",
            isActive
              ? "bg-blue-500/12 text-blue-400"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
          )}
        >
          {/* Active indicator */}
          <AnimatePresence>
            {isActive && (
              <motion.span
                layoutId="nav-active-bar"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>

          {/* Icon */}
          <span
            className={cn(
              "shrink-0 transition-colors",
              isActive
                ? "text-blue-400"
                : "text-slate-500 group-hover:text-slate-300"
            )}
            aria-hidden="true"
          >
            {item.icon}
          </span>

          {/* Label */}
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="truncate overflow-hidden whitespace-nowrap flex-1 text-left"
              >
                {item.label}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Badge */}
          {!isCollapsed && item.badge !== undefined && (
            <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-semibold tabular-nums">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}

          {/* Collapsed badge dot */}
          {isCollapsed && item.badge !== undefined && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
          )}

          {/* Tooltip (collapsed only) */}
          {isCollapsed && (
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none absolute left-full ml-3 z-50 px-2.5 py-1.5 bg-slate-800 text-slate-100 text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl border border-white/10"
            >
              {item.label}
              {item.badge !== undefined && (
                <span className="ml-1.5 text-blue-400">({item.badge})</span>
              )}
            </span>
          )}
        </button>
      </li>
    );
  }
);
NavItemButton.displayName = "NavItemButton";

// ─────────────────────────────────────────────────────────────────────────────
// Processing Status Badge
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: ProcessingStatus;
  label?: string;
}

const StatusBadge = memo<StatusBadgeProps>(({ status, label }) => {
  const config: Record<
    ProcessingStatus,
    { color: string; bg: string; border: string; dot: string; icon: React.ReactNode }
  > = {
    idle: {
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      dot: "bg-emerald-400",
      icon: <Activity size={12} />,
    },
    running: {
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      dot: "bg-blue-400",
      icon: <Loader2 size={12} className="animate-spin" />,
    },
    error: {
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      dot: "bg-red-400",
      icon: <Activity size={12} />,
    },
  };

  const c = config[status];

  return (
    <div
      className={cn(
        "hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium",
        c.bg,
        c.border,
        c.color
      )}
      role="status"
      aria-live="polite"
      aria-label={`AI Engine status: ${label ?? status}`}
    >
      <span className={cn("shrink-0", c.color)}>{c.icon}</span>
      <span>
        {label ??
          (status === "idle"
            ? "AI Ready"
            : status === "running"
            ? "Processing…"
            : "Engine Error")}
      </span>
    </div>
  );
});
StatusBadge.displayName = "StatusBadge";

const AiStatusBadge: React.FC = memo(() => {
  const aiStatus = useAppStore(state => state.aiStatus);
  const aiModelName = useAppStore(state => state.aiModelName);
  const llmConfig = useAppStore(state => state.llmConfig);
  const setAiStatus = useAppStore(state => state.setAiStatus);

  useEffect(() => {
    const checkStatus = async () => {
      if (llmConfig.provider === 'none') {
        setAiStatus('connected', 'Python Rules Engine');
        return;
      }
      if (llmConfig.provider === 'webllm') {
        setAiStatus('connected', llmConfig.webllmModelId.split('-').slice(0, 2).join(' '));
        return;
      }
      try {
        const url = (llmConfig.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          const models = data.models || [];
          const matched = models.find((m: any) => m.name.startsWith(llmConfig.ollamaModel)) || models[0] || { name: llmConfig.ollamaModel };
          setAiStatus('connected', matched.name);
        } else {
          setAiStatus('disconnected', '');
        }
      } catch {
        setAiStatus('disconnected', '');
      }
    };
    checkStatus();
    const timer = setInterval(checkStatus, 30000);
    return () => clearInterval(timer);
  }, [llmConfig, setAiStatus]);

  if (aiStatus === 'checking') {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium bg-slate-500/10 border-slate-500/20 text-slate-400">
        <Loader2 size={12} className="animate-spin shrink-0" />
        <span>Connecting…</span>
      </div>
    );
  }

  if (aiStatus === 'disconnected') {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium bg-red-500/10 border-red-500/20 text-red-400">
        <AlertCircle size={12} className="shrink-0" />
        <span>AI Offline</span>
      </div>
    );
  }

  return (
    <div 
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      title={`Connected: ${aiModelName}`}
    >
      <CheckCircle2 size={12} className="shrink-0" />
      <span className="max-w-[120px] truncate">{aiModelName || 'AI Ready'}</span>
    </div>
  );
});
AiStatusBadge.displayName = 'AiStatusBadge';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeNav,
  onNavChange,
  processingStatus = "idle",
  processingLabel,
  onThemeToggle,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  const handleNavClick = useCallback(
    (id: NavItemId) => {
      onNavChange(id);
      closeMobile();
    },
    [onNavChange, closeMobile]
  );

  const activeLabel = NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? "Dashboard";

  return (
    <div className="flex h-screen bg-[#0a0b0f] text-slate-200 overflow-hidden">
      {/* ── Mobile overlay ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* ════════════════════ SIDEBAR ════════════════════ */}
      <motion.aside
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "fixed md:relative z-50 flex flex-col h-full overflow-hidden",
          "bg-[#0f1117] border-r border-white/[0.06] shadow-[1px_0_0_rgba(255,255,255,0.03)]",
          "transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ minWidth: collapsed ? SIDEBAR_COLLAPSED_WIDTH : undefined }}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-[60px] px-4 border-b border-white/[0.06] shrink-0",
            collapsed ? "justify-center" : "gap-3"
          )}
        >
          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
            <Sparkles size={16} className="text-white" aria-hidden="true" />
          </div>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <p className="text-[13px] font-bold text-white tracking-wide whitespace-nowrap leading-none">
                  AI Accountant
                </p>
                <p className="text-[10px] text-slate-600 uppercase tracking-[0.15em] mt-0.5">
                  v2 · Enterprise
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile close */}
          <button
            onClick={closeMobile}
            className="ml-auto md:hidden p-1 text-slate-500 hover:text-slate-300 rounded-lg"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 scrollbar-hide"
          aria-label="Primary navigation"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              {/* Section label */}
              {!collapsed && (
                <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600 select-none">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="h-[1px] bg-white/[0.05] mx-2 mb-2" />}
              <ul role="menu" className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItemButton
                    key={item.id}
                    item={item}
                    isActive={activeNav === item.id}
                    isCollapsed={collapsed}
                    onClick={handleNavClick}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="shrink-0 p-2 border-t border-white/[0.06]">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2.5 rounded-xl",
              "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70",
              collapsed ? "justify-center" : ""
            )}
          >
            {collapsed ? (
              <ChevronRight size={16} aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft size={16} aria-hidden="true" />
                <span className="text-xs font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>
      </motion.aside>

      {/* ════════════════════ MAIN ════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Header ── */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 h-[60px] px-4 md:px-5 bg-[#0a0b0f]/95 backdrop-blur-sm border-b border-white/[0.06] shrink-0"
          role="banner"
        >
          {/* Mobile menu */}
          <button
            className="md:hidden p-2 -ml-1 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
            onClick={openMobile}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <Menu size={18} aria-hidden="true" />
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h1 className="text-[13px] font-semibold text-white truncate leading-none">
              {activeLabel}
            </h1>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-none">
              Haitham Soliman Abdou
            </p>
          </div>

          {/* Search */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-xl w-56 group focus-within:border-blue-500/40 focus-within:bg-blue-500/[0.04] transition-all">
            <Search
              size={14}
              className="text-slate-500 group-focus-within:text-blue-400 shrink-0 transition-colors"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search…"
              aria-label="Search documents and entries"
              className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 outline-none min-w-0"
            />
            <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 text-[10px] text-slate-600 border border-white/10 rounded font-mono">
              ⌘K
            </kbd>
          </div>

          {/* Processing status */}
          <AiStatusBadge />

          {/* Notifications */}
          <button
            className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
            aria-label="Notifications (3 unread)"
          >
            <Bell size={17} aria-hidden="true" />
            <span
              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full"
              aria-hidden="true"
            />
          </button>

          {/* Theme toggle placeholder — Future: connect to Zustand theme store */}
          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              className="hidden sm:flex p-2 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
              aria-label="Toggle theme"
            >
              <span className="text-xs font-mono">☀</span>
            </button>
          )}

          {/* User avatar — Future: connect to auth store */}
          <button
            className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
            aria-label="User profile"
          >
            <User size={14} className="text-white" aria-hidden="true" />
          </button>
        </header>

        {/* ── Main content ── */}
        {/*
          Future integration point:
          Wrap children in <Suspense> + <ErrorBoundary> here.
          Pass Zustand state/actions via context or props.
        */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent p-4 md:p-6 lg:p-8"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      <AiCopilot />
    </div>
  );
};

export default memo(DashboardLayout);
