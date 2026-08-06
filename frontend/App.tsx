import React, { lazy, Suspense } from "react";
import DashboardLayout, { type NavItemId } from "./components/DashboardLayout";

import { useAppStore } from "./store/useAppStore";
import { ChevronLeft } from "lucide-react";
import { AppMode } from "./types";

// Automation screens pull in heavyweight PDF, spreadsheet, and local-LLM
// libraries. Load each screen only when the user navigates to it so the
// dashboard can start quickly.
const DashboardHome = lazy(() => import("./components/DashboardHome"));
const AISettings = lazy(() => import("./components/AISettings"));
const MerchantEntryAutomation = lazy(() => import("./components/MerchantEntryAutomation"));
const WarbaEntryAutomation = lazy(() => import("./components/WarbaEntryAutomation"));
const EndingBalanceAutomation = lazy(() => import("./components/EndingBalanceAutomation"));
const MergePdfsAutomation = lazy(() => import("./components/MergePdfsAutomation"));
const POSEntryAutomation = lazy(() => import("./components/POSEntryAutomation"));
const POSReport = lazy(() => import("./components/POSReport"));
const SmartMergeAutomation = lazy(() => import("./components/SmartMergeAutomation"));
const Convert001To49Automation = lazy(() => import("./components/Convert001To49Automation"));
const PdfQaComponent = lazy(() => import("./components/PdfQaComponent"));
const PdfKeywordSearchComponent = lazy(() => import("./components/PdfKeywordSearchComponent"));
const RenamerComponent = lazy(() => import("./components/RenamerComponent"));
const BahrainCustPaymentAutomation = lazy(() => import("./components/BahrainCustPaymentAutomation"));
const OSDashboard = lazy(() => import("./components/OSDashboard"));

export default function App() {
  const mode = useAppStore((state) => state.appMode);
  const setMode = useAppStore((state) => state.setAppMode);

  const handleNavChange = (navId: NavItemId) => {
    switch (navId) {
      // Home
      case "dashboard":         setMode("home"); break;
      // Accounting
      case "entry":             setMode("entry"); break;
      case "invoices":          setMode("entry"); break;
      case "warba_entry":
      case "bank_statements":   setMode("warba_entry"); break;
      case "convert_001_to_49":
      case "journal_entries":   setMode("convert_001_to_49"); break;
      case "ending_balance":    setMode("ending_balance"); break;
      case "pos_entry":         setMode("pos_entry"); break;
      case "pos_report":
      case "processing_jobs":   setMode("pos_report"); break;
      case "merge_pdfs":        setMode("merge_pdfs"); break;
      case "smart_merge":       setMode("smart_merge"); break;
      case "bahrain_cust_payment": setMode("bahrain_cust_payment"); break;
      // File Tools
      case "rename":            setMode("rename"); break;
      case "keyword_search":    setMode("keyword_search"); break;
      case "search":            setMode("search"); break;
      // System
      case "ai_models":
      case "settings":          setMode("ai_settings"); break;
      case "v3_architecture":   setMode("v3_architecture"); break;
    }
  };

  const activeNav: NavItemId =
    mode === "home"             ? "dashboard"
    : mode === "entry"          ? "entry"
    : mode === "warba_entry"    ? "warba_entry"
    : mode === "convert_001_to_49" ? "convert_001_to_49"
    : mode === "ending_balance" ? "ending_balance"
    : mode === "pos_entry"      ? "pos_entry"
    : mode === "pos_report"     ? "pos_report"
    : mode === "merge_pdfs"     ? "merge_pdfs"
    : mode === "smart_merge"    ? "smart_merge"
    : mode === "bahrain_cust_payment" ? "bahrain_cust_payment"
    : mode === "rename"         ? "rename"
    : mode === "keyword_search" ? "keyword_search"
    : mode === "search"         ? "search"
    : mode === "v3_architecture"? "v3_architecture"
    : mode === "ai_settings"    ? "ai_models"
    : "dashboard";

  return (
    <DashboardLayout activeNav={activeNav} onNavChange={handleNavChange}>
      {/* Back button for sub-tools */}
      {mode !== "home" && (
        <button
          onClick={() => setMode("home")}
          className="flex items-center gap-2 mb-5 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
        >
          <ChevronLeft size={16} />
          Back to Dashboard
        </button>
      )}

      <Suspense fallback={<div className="py-12 text-center text-slate-400">Loading tool…</div>}>
        {/* Pages */}
        {mode === "home" && (
          <DashboardHome onNavigate={(m) => setMode(m as AppMode)} />
        )}
        {mode === "ai_settings" && <AISettings />}
        {mode === "entry" && <MerchantEntryAutomation />}
        {mode === "warba_entry" && <WarbaEntryAutomation />}
        {mode === "convert_001_to_49" && <Convert001To49Automation />}
        {mode === "ending_balance" && <EndingBalanceAutomation />}
        {mode === "merge_pdfs" && <MergePdfsAutomation />}
        {mode === "pos_entry" && <POSEntryAutomation />}
        {mode === "pos_report" && <POSReport />}
        {mode === "smart_merge" && <SmartMergeAutomation />}
        {mode === "bahrain_cust_payment" && <BahrainCustPaymentAutomation />}
        {mode === "rename" && <RenamerComponent />}
        {mode === "search" && <PdfQaComponent />}
        {mode === "keyword_search" && <PdfKeywordSearchComponent />}
        {mode === "v3_architecture" && <OSDashboard />}
      </Suspense>
    </DashboardLayout>
  );
}
