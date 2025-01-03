import nock from "@/utils/test/nock";
import type { RequestBodyMatcher } from "nock";

export function mockEditMessageText(options?: {
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
    .options(`/bot${token}/editMessageText`)
    .reply(204, undefined, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
      "access-control-allow-headers": "*",
    })
    .persist();

  // Handle actual request
  scope
    .post(`/bot${token}/editMessageText`, (body) => {
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
        text: "Updated message",
      },
      ...options?.response,
    })
    .persist();

  return scope;
}
