import { handle, noStore, readJson } from "@/lib/http";
import { verifyUploadedFile } from "@/lib/services/files";

export const maxDuration = 30;

export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const file = await verifyUploadedFile(body.pathname, body.name);
  return noStore({ file });
});
