import nock from "@/utils/test/nock";
import type { RequestBodyMatcher } from "nock";
import type { PDFStatus } from "@/types/telegram";

interface PDFStatusResponse {
  status: boolean;
  pdf_status: PDFStatus;
  pdf_url?: string;
}

export function mockFetchPDFStatus(options?: {
  request?: RequestBodyMatcher;
  response?: Partial<PDFStatusResponse>;
  galleryId?: string;
  baseUrl?: string;
}) {
  const galleryId = options?.galleryId || "177013";
  const baseUrl = options?.baseUrl || "https://api.example.com";
  const scope = nock(baseUrl);

  // Handle CORS preflight request
  scope
    .options(`/pdf-status/${galleryId}`)
    .reply(204, undefined, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
      "access-control-allow-headers": "*",
    })
    .persist();

  // Handle actual request
  scope
    .get(`/pdf-status/${galleryId}`)
    .matchHeader("content-type", "application/json")
    .reply(200, {
      status: true,
      pdf_status: "processing",
      ...options?.response,
    } as PDFStatusResponse)
    .persist();

  return scope;
}
