import _nock from "nock";
import { logger } from "../logger";

export const cleanAll = _nock.cleanAll;

export default function nock(baseUrl: string) {
  logger.debug(`Creating nock scope for ${baseUrl}`);
  const scope = _nock(baseUrl);

  // Handle CORS preflight requests - use times(10) to handle multiple requests
  scope.options(/.*/).times(10).reply(204, undefined, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "access-control-allow-headers": "*",
    "access-control-max-age": "86400",
  });

  // Add diagnostic logging to see what requests are being made
  scope.on("request", (req, interceptor, body) => {
    logger.debug(`Nock intercepted ${req.method} request to ${req.path}`, {
      headers: req.headers,
      body,
    });
  });

  scope.on("replied", (req, interceptor) => {
    logger.debug(`Nock replied to ${req.method} ${req.path}`);
  });

  scope.on("noMatch", (req, options, body) => {
    logger.debug(`Nock NO MATCH for ${req.method} ${req.path}`, {
      headers: options.headers,
      body,
    });
  });

  // Set default headers for all responses
  scope.defaultReplyHeaders({
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
  });

  return scope;
}

export function mockPDFDownload() {
  return _nock("https://example.com")
    .options("/test.pdf")
    .once()
    .reply(204, undefined, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400",
    })
    .get("/test.pdf")
    .reply(200, "mock pdf content", {
      "content-type": "application/pdf",
      "access-control-allow-origin": "*",
    });
}
