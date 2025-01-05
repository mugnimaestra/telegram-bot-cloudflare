import _nock from "nock";

export const cleanAll = _nock.cleanAll;

export default function nock(baseUrl: string) {
  const scope = _nock(baseUrl);

  // Handle CORS preflight requests
  scope.options(/.*/).once().reply(204, undefined, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "access-control-allow-headers": "*",
    "access-control-max-age": "86400",
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
