import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "printnow-test-"));
delete process.env.BLOB_READ_WRITE_TOKEN;
