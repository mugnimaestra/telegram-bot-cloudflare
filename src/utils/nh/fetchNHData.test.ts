import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchNHData } from "./fetchers/fetchNHData";
import nock from "@/utils/test/nock";
import _nock from "nock";
import type { NHAPIResponse } from "@/types/telegram";
import { ImageType } from "@/types/telegram";

describe("fetchNHData", () => {
  const nhApiUrl = "https://api.example.com";
  const galleryId = "123456";

  const mockResponse: NHAPIResponse = {
    id: parseInt(galleryId),
    media_id: galleryId,
    title: {
      english: "Test Title",
      japanese: "テストタイトル",
      pretty: "Test Pretty Title",
    },
    images: {
      pages: [
        { t: ImageType.JPG, w: 1280, h: 1800 },
        { t: ImageType.JPG, w: 1280, h: 1800 },
      ],
      cover: { t: ImageType.JPG, w: 350, h: 500 },
      thumbnail: { t: ImageType.JPG, w: 250, h: 350 },
    },
    scanlator: "",
    tags: [],
    num_pages: 2,
    num_favorites: 0,
    upload_date: 1609459200,
  };

  beforeEach(() => {
    _nock.cleanAll();
  });

  afterEach(() => {
    _nock.cleanAll();
  });

  it("should fetch gallery data successfully", async () => {
    const scope = nock(nhApiUrl)
      .get(`/get?id=${galleryId}`)
      .matchHeader("content-type", "application/json")
      .reply(200, mockResponse);

    console.log("Pending mocks:", scope.pendingMocks());

    const data = await fetchNHData({ galleryId }, nhApiUrl);
    expect(data).toEqual(mockResponse);

    console.log("Pending mocks after request:", scope.pendingMocks());
  });

  it("should handle API error responses", async () => {
    const scope = nock(nhApiUrl)
      .get(`/get?id=${galleryId}`)
      .matchHeader("content-type", "application/json")
      .reply(404, { error: "Gallery not found" });

    console.log("Pending mocks:", scope.pendingMocks());

    await expect(fetchNHData({ galleryId }, nhApiUrl)).rejects.toThrow(
      "Job not found"
    );

    console.log("Pending mocks after request:", scope.pendingMocks());
  });

  it("should handle network errors", async () => {
    const scope = nock(nhApiUrl)
      .get(`/get?id=${galleryId}`)
      .matchHeader("content-type", "application/json")
      .replyWithError("Network error");

    console.log("Pending mocks:", scope.pendingMocks());

    await expect(fetchNHData({ galleryId }, nhApiUrl)).rejects.toThrow(
      "Network error"
    );

    console.log("Pending mocks after request:", scope.pendingMocks());
  });

  it("should handle malformed responses", async () => {
    const scope = nock(nhApiUrl)
      .get(`/get?id=${galleryId}`)
      .matchHeader("content-type", "application/json")
      .reply(200, { invalid: "data" });

    console.log("Pending mocks:", scope.pendingMocks());

    await expect(fetchNHData({ galleryId }, nhApiUrl)).rejects.toThrow(
      "Invalid data structure"
    );

    console.log("Pending mocks after request:", scope.pendingMocks());
  });

  it("should send correct headers", async () => {
    const scope = nock(nhApiUrl)
      .get(`/get?id=${galleryId}`)
      .matchHeader("content-type", "application/json")
      .reply(200, mockResponse);

    console.log("Pending mocks:", scope.pendingMocks());

    await fetchNHData({ galleryId }, nhApiUrl);

    console.log("Pending mocks after request:", scope.pendingMocks());
  });
});
