import { vi } from "vitest";
import type { R2Bucket } from "@cloudflare/workers-types";

export const mockR2Bucket = {
  head: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  createMultipartUpload: vi.fn(),
  resumeMultipartUpload: vi.fn(),
  abortMultipartUpload: vi.fn(),
  completeMultipartUpload: vi.fn(),
} as R2Bucket;
