import React from "react";
import DashboardLayout, { type NavItemId } from "./components/DashboardLayout";
import DashboardHome from "./components/DashboardHome";
import AISettings from "./components/AISettings";
import MerchantEntryAutomation from "./components/MerchantEntryAutomation";
import WarbaEntryAutomation from "./components/WarbaEntryAutomation";
import EndingBalanceAutomation from "./components/EndingBalanceAutomation";
import MergePdfsAutomation from "./components/MergePdfsAutomation";
import POSEntryAutomation from "./components/POSEntryAutomation";
import POSReport from "./components/POSReport";
import SmartMergeAutomation from "./components/SmartMergeAutomation";
import Convert001To49Automation from "./components/Convert001To49Automation";
import PdfQaComponent from "./components/PdfQaComponent";
import PdfKeywordSearchComponent from "./components/PdfKeywordSearchComponent";
import RenamerComponent from "./components/RenamerComponent";
import BahrainCustPaymentAutomation from "./components/BahrainCustPaymentAutomation";
import OSDashboard from "./components/OSDashboard";

import { useAppStore } from "./store/useAppStore";
import { ChevronLeft } from "lucide-react";
import { AlertTriangleIcon } from "./components/icons";
import { AppMode } from "./types";

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
  const llmConfig = useAppStore((state) => state.llmConfig);

  const isApiKeyMissing = llmConfig.provider === 'gemini' && !import.meta.env.VITE_GEMINI_API_KEY;

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
    </DashboardLayout>
  );
}
