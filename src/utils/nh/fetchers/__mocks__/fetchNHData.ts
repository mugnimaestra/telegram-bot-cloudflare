import nock from "@/utils/test/nock";
import type { RequestBodyMatcher } from "nock";
import type { NHAPIResponse } from "@/types/telegram";

export function mockFetchNHData(options?: {
  request?: RequestBodyMatcher;
  response?: Partial<NHAPIResponse>;
  galleryId?: string;
  baseUrl?: string;
}) {
  const galleryId = options?.galleryId || "177013";
  const baseUrl = options?.baseUrl || "https://api.example.com";
  const scope = nock(baseUrl);

  // Handle CORS preflight request
  scope
    .options(`/get?id=${galleryId}`)
    .reply(204, undefined, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
      "access-control-allow-headers": "*",
    })
    .persist();

  // Handle actual request
  scope
    .get(`/get?id=${galleryId}`)
    .matchHeader("content-type", "application/json")
    .reply(200, {
      id: parseInt(galleryId),
      media_id: "987654",
      title: {
        english: "Test Title",
        japanese: "テストタイトル",
        pretty: "Test Pretty Title",
      },
      images: {
        pages: [
          {
            t: "j",
            w: 1200,
            h: 1700,
          },
        ],
        cover: {
          t: "j",
          w: 350,
          h: 500,
        },
        thumbnail: {
          t: "j",
          w: 250,
          h: 350,
        },
      },
      scanlator: "",
      tags: [
        {
          id: 1,
          type: "tag",
          name: "test",
          url: "/tag/test",
          count: 1,
        },
      ],
      num_pages: 1,
      num_favorites: 0,
      upload_date: 1609459200,
      ...options?.response,
    } as NHAPIResponse)
    .persist();

  return scope;
}
