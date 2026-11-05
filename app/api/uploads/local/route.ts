import { randomUUID } from "node:crypto";
import { LIMITS } from "@/lib/config";
import { EXT_BY_FORMAT, sniffFormat } from "@/lib/files";
import { handle, jsonError, noStore } from "@/lib/http";
import { storageMode, writeLocalObject } from "@/lib/storage";

/** Local development/test upload endpoint. Disabled whenever Vercel Blob is configured. */
export const POST = handle(async (request: Request) => {
  if (storageMode() !== "local" || process.env.VERCEL === "1") {
    return jsonError("NOT_AVAILABLE", "Not available.", 404);
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("NO_FILE", "No file received.", 400);
  if (file.size > LIMITS.maxFileBytes) {
    return jsonError("FILE_TOO_LARGE", `This file is larger than ${LIMITS.maxFileBytes / (1024 * 1024)} MB.`, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffFormat(bytes);
  const ext = format ? EXT_BY_FORMAT[format] : "bin";
  const key = `uploads/${randomUUID()}/file-${randomUUID().slice(0, 8)}.${ext}`;
  await writeLocalObject(key, bytes);
  return noStore({ pathname: key });
});
