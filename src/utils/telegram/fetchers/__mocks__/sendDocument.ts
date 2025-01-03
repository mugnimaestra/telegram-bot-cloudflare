import nock from "@/utils/test/nock";
import type { RequestBodyMatcher } from "nock";

export function mockSendDocument(options?: {
  request?: RequestBodyMatcher;
  response?: Record<string, unknown>;
  token?: string;
  baseUrl?: string;
}) {
  const token = options?.token || "test_token";
  const baseUrl = options?.baseUrl || "https://api.telegram.org";
  const scope = nock(baseUrl);

  // Handle CORS preflight request
  scope
    .options(`/bot${token}/sendDocument`)
    .reply(204, undefined, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
      "access-control-allow-headers": "*",
    })
    .persist();

  // Handle actual request
  scope
    .post(`/bot${token}/sendDocument`, (body) => {
      if (options?.request) {
        return JSON.stringify(body) === JSON.stringify(options.request);
      }
      return true;
    })
    .matchHeader("content-type", "application/json")
    .reply(200, {
      ok: true,
      result: {
        message_id: 123,
        chat: {
          id: 456,
          type: "private",
        },
        document: {
          file_id: "test_file_id",
          file_unique_id: "test_unique_id",
          file_name: "test.pdf",
          mime_type: "application/pdf",
          file_size: 1024,
        },
      },
      ...options?.response,
    })
    .persist();

  return scope;
}
