// ─────────────────────────────────────────────────────────────────────────────
// components/UploadZone.tsx
// Enterprise drag-and-drop upload component for AI Accountant v2
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, memo, useReducer } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Image,
  Archive,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileQuestion,
} from "lucide-react";
import { cn, formatBytes, generateId } from "../lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ACCEPTED_MIME_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/tiff": [".tiff", ".tif"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};

const SUPPORTED_EXTENSIONS = ["PDF", "CSV", "XLS", "XLSX", "JPG", "PNG", "ZIP"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type FileEntryStatus = "queued" | "uploading" | "processing" | "done" | "error";

export interface FileEntry {
  readonly id: string;
  readonly file: File;
  status: FileEntryStatus;
  progress: number; // 0–100
  errorMessage?: string;
  /** Future: set by AI pipeline — e.g. "Invoice", "Bank Statement" */
  detectedType?: string;
}

export interface UploadZoneProps {
  /** Called when valid files are accepted */
  onFilesAccepted: (files: File[]) => void;
  /** Called when a file is removed from the queue */
  onRemoveFile?: (id: string, file: File) => void;
  /**
   * Called when user clicks "Start Processing".
   * Future: dispatch to Zustand store / Web Worker queue.
   */
  onStartProcessing?: (entries: FileEntry[]) => void;
  /** If true, disables the zone and shows a loading state */
  isProcessing?: boolean;
  maxFiles?: number;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// State management (local reducer — ready to migrate to Zustand)
// ─────────────────────────────────────────────────────────────────────────────

type Action =
  | { type: "ADD_FILES"; entries: FileEntry[] }
  | { type: "REMOVE_FILE"; id: string }
  | { type: "CLEAR_ALL" }
  | { type: "SET_ERRORS"; errors: string[] }
  | { type: "CLEAR_ERRORS" }
  | { type: "UPDATE_ENTRY"; id: string; patch: Partial<FileEntry> };

interface UploadState {
  entries: FileEntry[];
  rejectionErrors: string[];
}

const initialState: UploadState = {
  entries: [],
  rejectionErrors: [],
};

function uploadReducer(state: UploadState, action: Action): UploadState {
  switch (action.type) {
    case "ADD_FILES":
      return { ...state, entries: [...state.entries, ...action.entries] };
    case "REMOVE_FILE":
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case "CLEAR_ALL":
      return initialState;
    case "SET_ERRORS":
      return { ...state, rejectionErrors: action.errors };
    case "CLEAR_ERRORS":
      return { ...state, rejectionErrors: [] };
    case "UPDATE_ENTRY":
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e
        ),
      };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: file type icon
// ─────────────────────────────────────────────────────────────────────────────

function getFileIcon(file: File): React.ReactNode {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type;

  if (type === "application/pdf" || ext === "pdf")
    return <FileText size={15} className="text-red-400" aria-hidden="true" />;
  if (["xlsx", "xls", "csv"].includes(ext) || type.includes("excel") || type === "text/csv")
    return <FileSpreadsheet size={15} className="text-emerald-400" aria-hidden="true" />;
  if (type.startsWith("image/"))
    return <Image size={15} className="text-sky-400" aria-hidden="true" />;
  if (ext === "zip" || type.includes("zip"))
    return <Archive size={15} className="text-amber-400" aria-hidden="true" />;
  return <FileQuestion size={15} className="text-slate-400" aria-hidden="true" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status icon helper
// ─────────────────────────────────────────────────────────────────────────────

function FileStatusIndicator({ status }: { status: FileEntryStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={14} className="text-emerald-400" aria-label="Done" />;
    case "error":
      return <AlertCircle size={14} className="text-red-400" aria-label="Error" />;
    case "uploading":
    case "processing":
      return <Loader2 size={14} className="text-blue-400 animate-spin" aria-label="Processing" />;
    default:
      return (
        <span
          className="w-1.5 h-1.5 rounded-full bg-slate-600"
          aria-label="Queued"
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File Card (individual queued file)
// ─────────────────────────────────────────────────────────────────────────────

interface FileCardProps {
  entry: FileEntry;
  isProcessing: boolean;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

const FileCard = memo<FileCardProps>(({ entry, isProcessing, onRemove, onRetry }) => (
  <motion.li
    layout
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
    transition={{ duration: 0.2 }}
    className="group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors"
    role="listitem"
    aria-label={`${entry.file.name}, ${formatBytes(entry.file.size)}, ${entry.status}`}
  >
    {/* File icon */}
    <div
      className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.07] shrink-0"
      aria-hidden="true"
    >
      {getFileIcon(entry.file)}
    </div>

    {/* Name & meta */}
    <div className="flex-1 min-w-0">
      <p className="text-[13px] text-slate-200 font-medium truncate leading-none">
        {entry.file.name}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-[11px] text-slate-500 leading-none">
          {formatBytes(entry.file.size)}
        </p>
        {entry.detectedType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium leading-none">
            {entry.detectedType}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(entry.status === "uploading" || entry.status === "processing") &&
        entry.progress > 0 && (
          <div
            className="mt-1.5 h-[3px] bg-white/[0.06] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={entry.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Upload progress: ${entry.progress}%`}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${entry.progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        )}

      {/* Error message */}
      {entry.status === "error" && entry.errorMessage && (
        <p className="text-[11px] text-red-400 mt-1 leading-none">
          {entry.errorMessage}
        </p>
      )}
    </div>

    {/* Status indicator */}
    <FileStatusIndicator status={entry.status} />

    {/* Retry (error state) */}
    {entry.status === "error" && onRetry && (
      <button
        onClick={() => onRetry(entry.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        aria-label={`Retry processing ${entry.file.name}`}
      >
        <RefreshCw size={12} aria-hidden="true" />
      </button>
    )}

    {/* Remove */}
    <button
      onClick={() => onRemove(entry.id)}
      disabled={isProcessing || entry.status === "processing"}
      className={cn(
        "opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all",
        "text-slate-600 hover:text-red-400 hover:bg-red-500/10",
        "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500",
        "disabled:pointer-events-none disabled:opacity-30"
      )}
      aria-label={`Remove ${entry.file.name}`}
    >
      <X size={13} aria-hidden="true" />
    </button>
  </motion.li>
));
FileCard.displayName = "FileCard";

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const UploadZone: React.FC<UploadZoneProps> = ({
  onFilesAccepted,
  onRemoveFile,
  onStartProcessing,
  isProcessing = false,
  maxFiles = 20,
  className,
}) => {
  const [state, dispatch] = useReducer(uploadReducer, initialState);

  // ── Callbacks ──

  const handleDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      dispatch({ type: "CLEAR_ERRORS" });

      if (rejections.length > 0) {
        dispatch({
          type: "SET_ERRORS",
          errors: rejections.map(
            (r) => `${r.file.name}: ${r.errors.map((e) => e.message).join(", ")}`
          ),
        });
      }

      if (accepted.length > 0) {
        const newEntries: FileEntry[] = accepted.map((file) => ({
          id: generateId(),
          file,
          status: "queued",
          progress: 0,
        }));
        dispatch({ type: "ADD_FILES", entries: newEntries });
        onFilesAccepted(accepted);
      }
    },
    [onFilesAccepted]
  );

  const handleRemove = useCallback(
    (id: string) => {
      const entry = state.entries.find((e) => e.id === id);
      dispatch({ type: "REMOVE_FILE", id });
      if (entry) onRemoveFile?.(id, entry.file);
    },
    [state.entries, onRemoveFile]
  );

  const handleStartProcessing = useCallback(() => {
    /**
     * Future integration point:
     * - Dispatch entries to Zustand processing queue
     * - Submit to Web Worker coordinator
     * - Start AI pipeline (WebLLM → OCR → rules-based fallback)
     */
    onStartProcessing?.(state.entries);
  }, [state.entries, onStartProcessing]);

  const handleClearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  // ── Dropzone ──

  const { getRootProps, getInputProps, isDragActive, isDragReject, isDragAccept } =
    useDropzone({
      onDrop: handleDrop,
      accept: ACCEPTED_MIME_TYPES,
      maxFiles,
      maxSize: MAX_FILE_SIZE_BYTES,
      disabled: isProcessing,
      multiple: true,
    } as any);

  // ── Derived state ──

  const queuedCount = useMemo(
    () => state.entries.filter((e) => e.status === "queued").length,
    [state.entries]
  );
  const hasEntries = state.entries.length > 0;

  // ── Drop zone classes ──

  const dropZoneClass = useMemo(
    () =>
      cn(
        "relative flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-10 md:p-14",
        "transition-all duration-200 ease-out cursor-pointer select-none",
        isDragReject
          ? "border-red-500/60 bg-red-500/[0.04] scale-[0.99]"
          : isDragAccept
          ? "border-blue-400/80 bg-blue-500/[0.07] scale-[1.01]"
          : isDragActive
          ? "border-blue-400/60 bg-blue-500/[0.05]"
          : isProcessing
          ? "border-white/[0.07] opacity-60 cursor-not-allowed"
          : "border-white/[0.1] hover:border-blue-400/40 hover:bg-blue-500/[0.03]",
        className
      ),
    [isDragReject, isDragAccept, isDragActive, isProcessing, className]
  );

  return (
    <section aria-label="File upload zone" className="w-full space-y-3">
      {/* ── Drop Area ── */}
      <div {...getRootProps()} className={dropZoneClass}>
        <input {...getInputProps()} aria-label="File input" />

        {/* Animated glow */}
        <AnimatePresence>
          {isDragActive && (
            <motion.div
              key="glow"
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: isDragReject
                  ? "radial-gradient(ellipse at center, rgba(239,68,68,0.05) 0%, transparent 70%)"
                  : "radial-gradient(ellipse at center, rgba(59,130,246,0.08) 0%, transparent 70%)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          )}
        </AnimatePresence>

        {/* Upload icon */}
        <motion.div
          animate={{
            scale: isDragActive ? (isDragReject ? 0.9 : 1.1) : 1,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={cn(
            "flex items-center justify-center w-16 h-16 rounded-2xl transition-colors duration-200",
            isDragReject
              ? "bg-red-500/15 text-red-400"
              : isDragAccept || isDragActive
              ? "bg-blue-500/20 text-blue-300"
              : isProcessing
              ? "bg-white/[0.05] text-slate-500"
              : "bg-white/[0.05] text-slate-400 group-hover:bg-blue-500/10 group-hover:text-blue-400"
          )}
          aria-hidden="true"
        >
          {isProcessing ? (
            <Loader2 size={30} className="animate-spin text-blue-400" />
          ) : (
            <UploadCloud size={30} />
          )}
        </motion.div>

        {/* Text content */}
        <div className="text-center space-y-2 z-10 pointer-events-none">
          <p className="text-base font-semibold text-slate-200">
            {isProcessing
              ? "Processing your documents…"
              : isDragReject
              ? "File type not supported"
              : isDragActive
              ? "Release to add files"
              : "Drag & drop your invoices or bank statements here"}
          </p>

          {!isProcessing && !isDragActive && (
            <p className="text-sm text-slate-500">
              or{" "}
              <span className="text-blue-400 font-medium underline underline-offset-2">
                click to browse files
              </span>
            </p>
          )}

          {!isProcessing && (
            <p className="text-xs text-slate-600 pt-1">
              Supported:&nbsp;
              <span className="text-slate-500 font-medium">
                {SUPPORTED_EXTENSIONS.join(" · ")}
              </span>
            </p>
          )}

          {!isProcessing && (
            <p className="text-xs text-slate-700">
              Max {maxFiles} files · Up to {formatBytes(MAX_FILE_SIZE_BYTES)} each
            </p>
          )}
        </div>

        {/* Format badges */}
        {!isProcessing && !isDragActive && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 z-10" aria-hidden="true">
            {SUPPORTED_EXTENSIONS.map((ext) => (
              <span
                key={ext}
                className="px-2 py-1 text-[10px] font-bold tracking-widest uppercase rounded-lg bg-white/[0.04] text-slate-600 border border-white/[0.08]"
              >
                {ext}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Rejection errors ── */}
      <AnimatePresence>
        {state.rejectionErrors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-xl bg-red-500/[0.08] border border-red-500/20 p-3 space-y-1.5"
              role="alert"
              aria-live="assertive"
            >
              {state.rejectionErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-400">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── File queue ── */}
      <AnimatePresence>
        {hasEntries && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl bg-white/[0.025] border border-white/[0.08] overflow-hidden"
            role="region"
            aria-label="Queued files"
          >
            {/* Queue header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" aria-hidden="true" />
                <span className="text-[13px] font-medium text-slate-300">
                  {state.entries.length} file
                  {state.entries.length !== 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                {onStartProcessing && queuedCount > 0 && (
                  <button
                    onClick={handleStartProcessing}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold",
                      "bg-blue-500 hover:bg-blue-400 text-white transition-colors shadow-md shadow-blue-500/20",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f1117]"
                    )}
                    aria-label={`Start processing ${queuedCount} queued file${queuedCount !== 1 ? "s" : ""}`}
                  >
                    <Loader2 size={12} aria-hidden="true" />
                    Process {queuedCount > 1 ? `${queuedCount} files` : "file"}
                  </button>
                )}
                <button
                  onClick={handleClearAll}
                  className="text-xs text-slate-600 hover:text-slate-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                  aria-label="Clear all files"
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* File list */}
            <ul
              className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
              role="list"
              aria-label="Selected files"
            >
              <AnimatePresence initial={false}>
                {state.entries.map((entry) => (
                  <FileCard
                    key={entry.id}
                    entry={entry}
                    isProcessing={isProcessing}
                    onRemove={handleRemove}
                    // Future: wire up retry logic to AI pipeline
                    onRetry={undefined}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default memo(UploadZone);
