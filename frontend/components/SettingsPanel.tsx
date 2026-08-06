import React from 'react';
import { RenameMethod } from '../types';

interface SettingsPanelProps {
  renameMethod: RenameMethod;
  setRenameMethod: (method: RenameMethod) => void;
  customPattern: string;
  setCustomPattern: (pattern: string) => void;
  aiInstructions: string;
  setAiInstructions: (instructions: string) => void;
  aiSuffix: string;
  setAiSuffix: (suffix: string) => void;
  isProcessing: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  renameMethod,
  setRenameMethod,
  customPattern,
  setCustomPattern,
  aiInstructions,
  setAiInstructions,
  aiSuffix,
  setAiSuffix,
  isProcessing
}) => {
  const RadioOption = ({ value, label, description }: { value: RenameMethod; label: string; description: string; }) => (
    <label
      className={`flex items-start p-3 rounded-md transition-all duration-200 cursor-pointer border ${
        renameMethod === value
          ? 'bg-sky-900/50 border-sky-600'
          : 'bg-dark-300/30 border-dark-300 hover:border-slate-500'
      }`}
    >
      <input
        type="radio"
        name="renameMethod"
        value={value}
        checked={renameMethod === value}
        onChange={() => setRenameMethod(value)}
        disabled={isProcessing}
        className="mt-1 h-4 w-4 shrink-0 text-sky-600 bg-dark-200 border-slate-500 focus:ring-sky-500"
      />
      <div className="ml-3 text-sm">
        <span className="font-medium text-slate-200">{label}</span>
        <p className="text-slate-400">{description}</p>
      </div>
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <RadioOption
          value={RenameMethod.AI}
          label="AI-Powered"
          description="Use AI to find the best filename."
        />
        <RadioOption
          value={RenameMethod.MedicalStatement}
          label="Medical Statement"
          description="Name (no 'clinic')-[Last 4 Acc No.]-[To Date]"
        />
        <RadioOption
          value={RenameMethod.MerchantReport}
          label="Merchant Report (CSV)"
          description="Renames from 'Merchant Name', 'Merchant Number', 'Account Number' columns."
        />
        <RadioOption
          value={RenameMethod.ClinicReport}
          label="Clinic Report (XLSX/CSV)"
          description="Renames from 'Name' and 'Account Number' columns."
        />
        <RadioOption
          value={RenameMethod.BankAccount}
          label="Bank Account Code"
          description="Finds text after 'Bank account:'."
        />
        <RadioOption
          value={RenameMethod.Custom}
          label="Custom Pattern (Regex)"
          description="Use a regular expression to match."
        />
      </div>

      {renameMethod === RenameMethod.Custom && (
        <div className="animate-fade-in">
          <label htmlFor="custom-pattern" className="block text-sm font-medium text-slate-300 mb-1">
            Custom Regex Pattern
          </label>
          <input
            type="text"
            id="custom-pattern"
            value={customPattern}
            onChange={(e) => setCustomPattern(e.target.value)}
            disabled={isProcessing}
            className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g., Invoice\s+Number:\s*([A-Z0-9\-]+)"
          />
        </div>
      )}

      {renameMethod === RenameMethod.AI && (
        <div className="animate-fade-in space-y-4">
          <div>
            <label htmlFor="ai-instructions" className="block text-sm font-medium text-slate-300 mb-1">
              AI Instructions
            </label>
            <textarea
              id="ai-instructions"
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              disabled={isProcessing}
              rows={4}
              className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
              placeholder="Tell the AI how to find the filename..."
            />
          </div>
          <div>
            <label htmlFor="ai-suffix" className="block text-sm font-medium text-slate-300 mb-1">
              Filename Suffix (Optional)
            </label>
            <input
              type="text"
              id="ai-suffix"
              value={aiSuffix}
              onChange={(e) => setAiSuffix(e.target.value)}
              disabled={isProcessing}
              className="w-full bg-dark-300 border-dark-300/50 rounded-md shadow-sm p-2 text-slate-200 focus:ring-sky-500 focus:border-sky-500"
              placeholder="e.g., from 1-july-2025"
            />
            <p className="mt-1 text-xs text-slate-500">
              AI will format this as a date range. E.g., "from 1-July to 20-july-2025" becomes "01-Jul to 20 July".
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;