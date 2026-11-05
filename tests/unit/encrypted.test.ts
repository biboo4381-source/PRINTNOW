import { expect, it } from "vitest";
import { inspectPdf } from "@/lib/files";
import { makeEncryptedPdf } from "../fixtures";

it("rejects password-protected PDFs", async () => {
  expect(await inspectPdf(await makeEncryptedPdf())).toEqual({ ok: false, reason: "ENCRYPTED" });
});
