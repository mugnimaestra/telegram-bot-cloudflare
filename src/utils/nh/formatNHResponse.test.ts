import { describe, it, expect } from "vitest";
import { formatNHResponse } from "./formatNHResponse";
import type { NHAPIResponse } from "@/types/telegram";
import { ImageType, TagType } from "@/types/telegram";

describe("formatNHResponse", () => {
  const mockResponse: NHAPIResponse = {
    id: 123456,
    media_id: "123456",
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
      cover: {
        t: ImageType.JPG,
        w: 350,
        h: 500,
      },
      thumbnail: {
        t: ImageType.JPG,
        w: 250,
        h: 350,
      },
    },
    scanlator: "Test Scanlator",
    tags: [
      {
        id: 1,
        type: TagType.TAG,
        name: "tag1",
        url: "/tag/tag1",
        count: 100,
      },
      {
        id: 2,
        type: TagType.ARTIST,
        name: "artist1",
        url: "/artist/artist1",
        count: 50,
      },
      {
        id: 3,
        type: TagType.LANGUAGE,
        name: "english",
        url: "/language/english",
        count: 1000,
      },
      {
        id: 4,
        type: TagType.CATEGORY,
        name: "manga",
        url: "/category/manga",
        count: 5000,
      },
      {
        id: 5,
        type: TagType.PARODY,
        name: "original",
        url: "/parody/original",
        count: 200,
      },
    ],
    num_pages: 2,
    num_favorites: 100,
    upload_date: 1609459200, // 2021-01-01
  };

  it("should format response with all fields", async () => {
    const result = await formatNHResponse(mockResponse);
    expect(result).toContain("📖 *Title*: Test Title");
    expect(result).toContain("• ID: 123456");
    expect(result).toContain("• Pages: 2");
    expect(result).toContain("• Favorites: 100");
    expect(result).toContain("• Category: manga");
    expect(result).toContain("• Parody: original");
    expect(result).toContain("• Language: english");
    expect(result).toContain("• Artist: artist1");
    expect(result).toContain("🏷️ *Tags*: tag1");
    expect(result).toContain("📅 Upload Date: 1/1/2021");
  });

  it("should handle missing title fields", async () => {
    const response = {
      ...mockResponse,
      title: {
        english: "",
        japanese: "テストタイトル",
        pretty: "",
      },
    };
    const result = await formatNHResponse(response);
    expect(result).toContain("📖 *Title*: テストタイトル");
  });

  it("should handle missing tags", async () => {
    const response = {
      ...mockResponse,
      tags: [],
    };
    const result = await formatNHResponse(response);
    expect(result).toContain("🏷️ *Tags*: N/A");
    expect(result).toContain("• Category: N/A");
    expect(result).toContain("• Parody: Original");
    expect(result).toContain("• Language: N/A");
    expect(result).toContain("• Artist: N/A");
  });

  it("should handle invalid upload date", async () => {
    const response = {
      ...mockResponse,
      upload_date: 0,
    };
    const result = await formatNHResponse(response);
    expect(result).toContain("📅 Upload Date: N/A");
  });

  it("should handle missing optional fields", async () => {
    const { num_favorites, scanlator, ...rest } = mockResponse;
    const response = rest as NHAPIResponse;
    const result = await formatNHResponse(response);
    expect(result).toContain("• Favorites: N/A");
  });

  it("should handle invalid data structure", async () => {
    const invalidData = {
      id: 123456,
    } as NHAPIResponse;

    await expect(formatNHResponse(invalidData)).rejects.toThrow(
      "Invalid API response format"
    );
  });

  it("should escape markdown special characters", async () => {
    const response = {
      ...mockResponse,
      title: {
        english: "Test *Title* with [markdown]",
        japanese: "テスト_タイトル_",
        pretty: "Test.Title",
      },
      tags: [
        {
          id: 1,
          type: TagType.TAG,
          name: "tag*with*markdown",
          url: "/tag/tag1",
          count: 100,
        },
      ],
    };
    const result = await formatNHResponse(response);
    expect(result).toContain(
      "📖 *Title*: Test \\*Title\\* with \\[markdown\\]"
    );
    expect(result).toContain("🏷️ *Tags*: tag\\*with\\*markdown");
  });
});
