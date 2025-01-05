import nock from "@/utils/test/nock";
import type { RequestBodyMatcher } from "nock";

export function mockAnswerCallbackQuery(options?: {
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
    .options(`/bot${token}/answerCallbackQuery`)
    .reply(204, undefined, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
      "access-control-allow-headers": "*",
    })
    .persist();

  // Handle actual request
  scope
    .post(`/bot${token}/answerCallbackQuery`, (body) => {
      if (options?.request) {
        return JSON.stringify(body) === JSON.stringify(options.request);
      }
      return true;
    })
    .matchHeader("content-type", "application/json")
    .reply(200, {
      ok: true,
      result: true,
      ...options?.response,
    })
    .persist();

  return scope;
}
