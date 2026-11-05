import { ALLOWED_MIME_TYPES, LIMITS, formatBytes } from "../config";

export type UploadMode = "blob" | "local";

export interface VerifiedFileDto {
  id: string;
  name: string;
  format: "PDF" | "JPG" | "PNG";
  sizeBytes: number;
  pageCount: number;
  imageWidth: number | null;
  imageHeight: number | null;
}

export class UploadError extends Error {}

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Quick checks in the browser for instant feedback. The server re-checks everything. */
export function precheckFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type || EXT_TO_MIME[ext] || "";
  if (!EXT_TO_MIME[ext] && !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    return "This file type isn't supported. Please upload a PDF, JPG or PNG.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > LIMITS.maxFileBytes) {
    return `This file is ${formatBytes(file.size)}. The maximum is ${formatBytes(LIMITS.maxFileBytes)}.`;
  }
  return null;
}

function mimeFor(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type) ? file.type : EXT_TO_MIME[ext] ?? "application/octet-stream";
}

function extFor(mime: string) {
  return mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
}

async function uploadToBlob(file: File, onProgress: (pct: number) => void): Promise<string> {
  const { upload } = await import("@vercel/blob/client");
  const contentType = mimeFor(file);
  const pathname = `uploads/${crypto.randomUUID()}/file.${extFor(contentType)}`;
  try {
    const result = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/uploads/token",
      contentType,
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: (e) => onProgress(e.percentage),
    });
    return result.pathname;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/content type/i.test(msg)) throw new UploadError("This file type isn't supported. Please upload a PDF, JPG or PNG.");
    if (/too large|size/i.test(msg)) throw new UploadError(`This file is larger than ${formatBytes(LIMITS.maxFileBytes)}.`);
    throw new UploadError("Upload failed. Please check your connection and try again.");
  }
}

function uploadToLocal(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", "/api/uploads/local");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.pathname);
        else reject(new UploadError(body?.error?.message ?? "Upload failed. Please try again."));
      } catch {
        reject(new UploadError("Upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new UploadError("Upload failed. Please check your connection and try again."));
    xhr.send(form);
  });
}

export async function uploadAndVerify(
  file: File,
  mode: UploadMode,
  onProgress: (pct: number) => void,
  onVerifying: () => void,
): Promise<VerifiedFileDto> {
  const pathname = mode === "blob" ? await uploadToBlob(file, onProgress) : await uploadToLocal(file, onProgress);
  onVerifying();
  const res = await fetch("/api/files/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname, name: file.name }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new UploadError(body?.error?.message ?? "We couldn't check this file. Please try again.");
  return body.file as VerifiedFileDto;
}

/** Small preview image (data URL) for the file card. Never throws. */
export async function makeThumbnail(file: File, maxSize = 240): Promise<string | undefined> {
  try {
    const canvas = document.createElement("canvas");
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxSize / Math.max(base.width, base.height) });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      await task.destroy();
    } else {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return undefined;
  }
}
