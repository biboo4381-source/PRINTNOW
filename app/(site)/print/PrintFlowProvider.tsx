"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LIMITS } from "@/lib/config";
import { type UploadMode, makeThumbnail, precheckFile, uploadAndVerify } from "@/lib/client/upload";
import { parsePageSelection } from "@/lib/pages";
import { type ColorMode, type PriceTable, priceLine } from "@/lib/pricing";

export interface DraftFile {
  localId: string;
  name: string;
  sizeBytes: number;
  status: "uploading" | "verifying" | "ready" | "error";
  progress: number;
  error?: string;
  fileId?: string;
  format?: "PDF" | "JPG" | "PNG";
  pageCount?: number;
  thumb?: string;
}

export interface FileSettings {
  colorMode: ColorMode;
  copies: number;
  pageMode: "all" | "custom";
  customPages: string;
}

export const DEFAULT_SETTINGS: FileSettings = { colorMode: "BW", copies: 1, pageMode: "all", customPages: "" };

export interface LineSummary {
  file: DraftFile;
  settings: FileSettings;
  pageSelection: string;
  selectedPageCount: number;
  error: string | null;
  pricePerPage: number;
  printedPages: number;
  subtotal: number;
}

interface PrintFlow {
  prices: PriceTable;
  uploadMode: UploadMode;
  files: DraftFile[];
  readyFiles: DraftFile[];
  hydrated: boolean;
  notice: string | null;
  addFiles: (list: FileList | File[]) => void;
  removeFile: (localId: string) => void;
  replaceFile: (localId: string, file: File) => void;
  settingsFor: (fileId: string) => FileSettings;
  updateSettings: (fileId: string, patch: Partial<FileSettings>) => void;
  lines: LineSummary[];
  total: number;
  totalPrintedPages: number;
  linesValid: boolean;
  reset: () => void;
  dismissNotice: () => void;
}

const Ctx = createContext<PrintFlow | null>(null);
const STORAGE_KEY = "printnow:draft:v1";

export function usePrintFlow() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrintFlow must be used inside PrintFlowProvider");
  return ctx;
}

export function PrintFlowProvider({
  prices,
  uploadMode,
  children,
}: {
  prices: PriceTable;
  uploadMode: UploadMode;
  children: React.ReactNode;
}) {
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [settings, setSettings] = useState<Record<string, FileSettings>>({});
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore a draft after reload / back navigation (only fully verified files survive).
  // sessionStorage only exists in the browser, so this must run after mount; reading it during
  // render would make the server and client HTML differ.
  useEffect(() => {
    let saved: { files?: DraftFile[]; settings?: Record<string, FileSettings> } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      /* ignore broken storage */
    }
    const restored = (saved.files ?? []).filter((f) => f.status === "ready" && f.fileId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage after mount
    setFiles(restored);
    setSettings(saved.settings ?? {});
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const ready = files.filter((f) => f.status === "ready");
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ files: ready, settings }));
    } catch {
      // Storage full (large thumbnails): retry without thumbnails.
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ files: ready.map((f) => ({ ...f, thumb: undefined })), settings }),
        );
      } catch {
        /* give up silently: the in-memory state still works */
      }
    }
  }, [files, settings, hydrated]);

  const patchFile = useCallback((localId: string, patch: Partial<DraftFile>) => {
    setFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  }, []);

  const startUpload = useCallback(
    (localId: string, file: File) => {
      makeThumbnail(file).then((thumb) => thumb && patchFile(localId, { thumb }));
      uploadAndVerify(
        file,
        uploadMode,
        (pct) => patchFile(localId, { progress: Math.min(99, Math.round(pct)) }),
        () => patchFile(localId, { status: "verifying", progress: 100 }),
      )
        .then((verified) => {
          patchFile(localId, {
            status: "ready",
            progress: 100,
            fileId: verified.id,
            format: verified.format,
            pageCount: verified.pageCount,
            name: verified.name,
          });
        })
        .catch((err: unknown) => {
          patchFile(localId, {
            status: "error",
            error: err instanceof Error ? err.message : "Upload failed. Please try again.",
          });
        });
    },
    [patchFile, uploadMode],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      const slots = LIMITS.maxFilesPerOrder - files.length;
      if (slots <= 0) {
        setNotice(`You can add up to ${LIMITS.maxFilesPerOrder} files per order.`);
        return;
      }
      if (incoming.length > slots) {
        setNotice(`Only ${slots} more file${slots === 1 ? "" : "s"} can be added (maximum ${LIMITS.maxFilesPerOrder} per order).`);
      } else {
        setNotice(null);
      }
      const accepted = incoming.slice(0, slots);
      const drafts: DraftFile[] = accepted.map((file) => {
        const problem = precheckFile(file);
        return {
          localId: crypto.randomUUID(),
          name: file.name,
          sizeBytes: file.size,
          status: problem ? "error" : "uploading",
          progress: 0,
          error: problem ?? undefined,
        };
      });
      setFiles((prev) => [...prev, ...drafts]);
      drafts.forEach((d, i) => d.status === "uploading" && startUpload(d.localId, accepted[i]));
    },
    [files.length, startUpload],
  );

  const removeFile = useCallback((localId: string) => {
    setNotice(null);
    setFiles((prev) => prev.filter((f) => f.localId !== localId));
  }, []);

  const replaceFile = useCallback(
    (localId: string, file: File) => {
      const problem = precheckFile(file);
      patchFile(localId, {
        name: file.name,
        sizeBytes: file.size,
        status: problem ? "error" : "uploading",
        progress: 0,
        error: problem ?? undefined,
        fileId: undefined,
        format: undefined,
        pageCount: undefined,
        thumb: undefined,
      });
      if (!problem) startUpload(localId, file);
    },
    [patchFile, startUpload],
  );

  const settingsFor = useCallback((fileId: string) => settings[fileId] ?? DEFAULT_SETTINGS, [settings]);
  const updateSettings = useCallback((fileId: string, patch: Partial<FileSettings>) => {
    setSettings((prev) => ({ ...prev, [fileId]: { ...(prev[fileId] ?? DEFAULT_SETTINGS), ...patch } }));
  }, []);

  const readyFiles = useMemo(() => files.filter((f) => f.status === "ready" && f.fileId), [files]);

  const lines = useMemo<LineSummary[]>(
    () =>
      readyFiles.map((file) => {
        const s = settings[file.fileId!] ?? DEFAULT_SETTINGS;
        const pageCount = file.pageCount ?? 1;
        const selection = s.pageMode === "all" ? parsePageSelection("all", pageCount) : parsePageSelection(s.customPages, pageCount);
        const copies = Number.isInteger(s.copies) ? s.copies : 0;
        const copiesError = !Number.isInteger(s.copies)
          ? "Enter the number of copies."
          : copies < LIMITS.minCopies || copies > LIMITS.maxCopies
            ? `Copies must be between ${LIMITS.minCopies} and ${LIMITS.maxCopies}.`
            : null;
        const count = selection.ok ? selection.count : 0;
        const price = priceLine(prices, { selectedPageCount: count, copies: Math.max(0, copies), colorMode: s.colorMode });
        return {
          file,
          settings: s,
          pageSelection: selection.ok ? selection.normalized : "",
          selectedPageCount: count,
          error: selection.ok ? copiesError : selection.error,
          ...price,
        };
      }),
    [readyFiles, settings, prices],
  );

  const value: PrintFlow = {
    prices,
    uploadMode,
    files,
    readyFiles,
    hydrated,
    notice,
    addFiles,
    removeFile,
    replaceFile,
    settingsFor,
    updateSettings,
    lines,
    total: lines.reduce((s, l) => s + l.subtotal, 0),
    totalPrintedPages: lines.reduce((s, l) => s + l.printedPages, 0),
    linesValid: lines.length > 0 && lines.every((l) => !l.error),
    reset: () => {
      setFiles([]);
      setSettings({});
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
    dismissNotice: () => setNotice(null),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
