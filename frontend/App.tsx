import React, { lazy, Suspense } from "react";
import DashboardLayout, { type NavItemId } from "./components/DashboardLayout";

import { useAppStore } from "./store/useAppStore";
import { ChevronLeft } from "lucide-react";
import { AlertTriangleIcon } from "./components/icons";
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

const ApiKeyWarningBanner: React.FC<{ onInfoClick: () => void }> = ({
  onInfoClick,
}) => (
  <div
    className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-4 mb-8 rounded-r-lg animate-fade-in"
    role="alert"
  >
    <div className="flex items-center">
      <AlertTriangleIcon className="h-8 w-8 text-red-400 mr-4 flex-shrink-0" />
      <div className="flex-grow">
        <p className="font-bold">Action Required: API Key Not Found</p>
        <p className="text-sm">
          AI features are disabled because the Google Gemini API key is not
          configured. Please set the{" "}
          <code className="bg-red-800/50 text-red-200 px-1.5 py-0.5 rounded">
            GEMINI_API_KEY
          </code>{" "}
          environment variable in your hosting environment.
        </p>
      </div>
      <button
        onClick={onInfoClick}
        className="ml-4 flex-shrink-0 text-sm font-semibold underline hover:text-white whitespace-nowrap"
      >
        How to fix this
      </button>
    </div>
  </div>
);

export default function App() {
  const mode = useAppStore((state) => state.appMode);
  const setMode = useAppStore((state) => state.setAppMode);

  const isApiKeyMissing = false; // Gemini/Vertex removed; no gemini key to check

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
      {/* API Key Warning */}
      {isApiKeyMissing && (
        <div className="mb-6">
          <ApiKeyWarningBanner onInfoClick={() => setMode("ai_settings")} />
        </div>
      )}

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
