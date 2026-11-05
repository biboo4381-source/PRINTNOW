"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LIMITS } from "@/lib/config";
import { clearDraftFile, loadDraftFile, saveDraftFile } from "@/lib/client/file-store";
import { type UploadMode, makeThumbnail, precheckFile, uploadAndVerify } from "@/lib/client/upload";
import { DEFAULT_ADJUSTMENT, type ImageAdjustment } from "@/lib/image-layout";
import { parsePageSelection } from "@/lib/pages";
import { type ColorMode, type PriceTable, priceLine } from "@/lib/pricing";

/** The single document in this order. */
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
  /** Images: size as displayed by the browser (after camera orientation). */
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** Small preview of the upload. */
  thumb?: string;
}

export interface PrintSettings {
  colorMode: ColorMode;
  copies: number;
  pageMode: "all" | "custom";
  customPages: string;
  adjustment: ImageAdjustment;
}

export const DEFAULT_SETTINGS: PrintSettings = {
  colorMode: "BW",
  copies: 1,
  pageMode: "all",
  customPages: "",
  adjustment: DEFAULT_ADJUSTMENT,
};

export interface LineSummary {
  file: DraftFile;
  settings: PrintSettings;
  isImage: boolean;
  pageSelection: string;
  selectedPageCount: number;
  pageError: string | null;
  copiesError: string | null;
  pricePerPage: number;
  printedPages: number;
  subtotal: number;
}

interface PrintFlow {
  prices: PriceTable;
  uploadMode: UploadMode;
  file: DraftFile | null;
  ready: boolean;
  hydrated: boolean;
  notice: string | null;
  /** Uploads a document, replacing any current one. */
  chooseFile: (file: File) => void;
  /** Handles a drop or multi-select: uses the first file and explains why. */
  chooseFromList: (list: FileList | File[]) => void;
  removeFile: () => void;
  settings: PrintSettings;
  updateSettings: (patch: Partial<PrintSettings>) => void;
  /** The original file bytes kept in this browser (memory, then IndexedDB). Null if unavailable. */
  getSource: () => Promise<Blob | null>;
  line: LineSummary | null;
  reset: () => void;
  dismissNotice: () => void;
}

const Ctx = createContext<PrintFlow | null>(null);
const STORAGE_KEY = "printnow:draft:v2";

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
  const [file, setFile] = useState<DraftFile | null>(null);
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sourceRef = useRef<Blob | null>(null);

  // Restore after reload / back navigation. sessionStorage only exists in the browser, so this
  // must run after mount; reading it during render would make server and client HTML differ.
  useEffect(() => {
    let saved: { file?: DraftFile | null; settings?: Partial<PrintSettings> } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      /* ignore broken storage */
    }
    const restored = saved.file && saved.file.status === "ready" && saved.file.fileId ? saved.file : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser storage after mount
    setFile(restored);
    setSettings({ ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const keep = file?.status === "ready" ? file : null;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ file: keep, settings }));
    } catch {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ file: keep && { ...keep, thumb: undefined }, settings }));
      } catch {
        /* in-memory state still works */
      }
    }
  }, [file, settings, hydrated]);

  const patchFile = useCallback((localId: string, patch: Partial<DraftFile>) => {
    setFile((prev) => (prev && prev.localId === localId ? { ...prev, ...patch } : prev));
  }, []);

  const chooseFile = useCallback(
    (chosen: File) => {
      setNotice(null);
      const problem = precheckFile(chosen);
      const localId = crypto.randomUUID();
      sourceRef.current = problem ? null : chosen;
      void clearDraftFile();
      // A new document starts with fresh settings (pages/crop from the old file wouldn't apply).
      setSettings((s) => ({ ...DEFAULT_SETTINGS, colorMode: s.colorMode, copies: s.copies }));
      setFile({
        localId,
        name: chosen.name,
        sizeBytes: chosen.size,
        status: problem ? "error" : "uploading",
        progress: 0,
        error: problem ?? undefined,
      });
      if (problem) return;
      void saveDraftFile(chosen);
      makeThumbnail(chosen).then((thumb) => thumb && patchFile(localId, { thumb }));
      uploadAndVerify(
        chosen,
        uploadMode,
        (pct) => patchFile(localId, { progress: Math.min(99, Math.round(pct)) }),
        () => patchFile(localId, { status: "verifying", progress: 100 }),
      )
        .then((v) =>
          patchFile(localId, {
            status: "ready",
            progress: 100,
            fileId: v.id,
            format: v.format,
            pageCount: v.pageCount,
            name: v.name,
            imageWidth: v.imageWidth,
            imageHeight: v.imageHeight,
          }),
        )
        .catch((err: unknown) =>
          patchFile(localId, { status: "error", error: err instanceof Error ? err.message : "Upload failed. Please try again." }),
        );
    },
    [patchFile, uploadMode],
  );

  const chooseFromList = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list);
      if (files.length === 0) return;
      chooseFile(files[0]);
      if (files.length > 1) {
        setNotice(`One document per order: we used “${files[0].name}”. Place another order for your other files.`);
      }
    },
    [chooseFile],
  );

  const removeFile = useCallback(() => {
    sourceRef.current = null;
    void clearDraftFile();
    setNotice(null);
    setFile(null);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const getSource = useCallback(async () => {
    if (sourceRef.current) return sourceRef.current;
    const stored = await loadDraftFile();
    if (stored) sourceRef.current = stored;
    return stored;
  }, []);

  const updateSettings = useCallback((patch: Partial<PrintSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const ready = !!file && file.status === "ready" && !!file.fileId;

  const line = useMemo<LineSummary | null>(() => {
    if (!file || !ready) return null;
    const isImage = file.format === "JPG" || file.format === "PNG";
    const pageCount = file.pageCount ?? 1;
    const selection =
      isImage || settings.pageMode === "all"
        ? parsePageSelection("all", pageCount)
        : parsePageSelection(settings.customPages, pageCount);
    const copiesValid = Number.isInteger(settings.copies);
    const copies = copiesValid ? settings.copies : 0;
    const copiesError = !copiesValid
      ? "Enter the number of copies."
      : copies < LIMITS.minCopies || copies > LIMITS.maxCopies
        ? `Copies must be between ${LIMITS.minCopies} and ${LIMITS.maxCopies}.`
        : null;
    const count = selection.ok ? selection.count : 0;
    const price = priceLine(prices, { selectedPageCount: count, copies: Math.max(0, copies), colorMode: settings.colorMode });
    return {
      file,
      settings,
      isImage,
      pageSelection: selection.ok ? selection.normalized : "",
      selectedPageCount: count,
      pageError: selection.ok ? null : selection.error,
      copiesError,
      ...price,
    };
  }, [file, ready, settings, prices]);

  const value: PrintFlow = {
    prices,
    uploadMode,
    file,
    ready,
    hydrated,
    notice,
    chooseFile,
    chooseFromList,
    removeFile,
    settings,
    updateSettings,
    getSource,
    line,
    reset: () => {
      sourceRef.current = null;
      void clearDraftFile();
      setFile(null);
      setSettings(DEFAULT_SETTINGS);
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
