import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleNHCommand } from "./handleNHCommand";
import { PDFStatus, ChatType } from "@/types/telegram";
import type { Message } from "@/types/telegram";
import { mockR2Bucket } from "../../utils/test/mockR2Bucket";
import nock from "@/utils/test/nock";

describe("handleNHCommand", () => {
  const mockToken = "test_token";
  const mockChatId = 123456789;
  const mockNhApiUrl = "https://api.example.com";
  const mockMessage: Message = {
    message_id: 987654321,
    chat: {
      id: mockChatId,
      type: ChatType.PRIVATE,
    },
    date: Math.floor(Date.now() / 1000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("input validation", () => {
    it.each`
      input                                    | description
      ${""}                                    | ${"empty input"}
      ${"invalid-id"}                          | ${"invalid ID format"}
      ${"abc123"}                              | ${"non-numeric ID"}
      ${"https://nhentai.net/invalid/547949/"} | ${"invalid URL format"}
    `("should handle $description", async ({ input }) => {
      const scope = nock("https://api.telegram.org");

      // Mock loading message
      scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      });

      scope
        .post(
          `/bot${mockToken}/sendMessage?chat_id=${mockChatId}&text=%F0%9F%94%8D+Fetching+data...`,
          {
            chat_id: mockChatId,
            text: "🔍 Fetching data...",
          }
        )
        .reply(200, {
          ok: true,
          result: { message_id: 12345 },
        });

      // Mock message deletion
      scope.options(`/bot${mockToken}/editMessageText`).reply(204, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      });

      scope
        .post(`/bot${mockToken}/editMessageText`, {
          chat_id: mockChatId,
          message_id: 12345,
          text: "❌ Error: Invalid ID format. Please try again.",
        })
        .reply(200, { ok: true });

      const result = await handleNHCommand(
        mockToken,
        mockChatId,
        input,
        mockMessage,
        mockR2Bucket,
        mockNhApiUrl
      );

      expect(result.ok).toBe(false);
      expect(result.description).toContain("Invalid ID format");
    });
  });

  it("should handle loading message timeout", async () => {
    const scope = nock("https://api.telegram.org");

    scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
    });

    scope
      .post(
        `/bot${mockToken}/sendMessage?chat_id=${mockChatId}&text=%F0%9F%94%8D+Fetching+data...`,
        {
          chat_id: mockChatId,
          text: "🔍 Fetching data...",
        }
      )
      .delay(3000) // Shorter than our test timeout but longer than our 1s timeout
      .reply(200, { ok: true });

    const result = await handleNHCommand(
      mockToken,
      mockChatId,
      "123456",
      mockMessage,
      mockR2Bucket,
      mockNhApiUrl
    );

    expect(result.ok).toBe(false);
    expect(result.description).toContain("Network error");
  });

  it("should handle loading message deletion failure", async () => {
    const scope = nock("https://api.telegram.org");

    // Mock loading message
    scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
    });

    scope
      .post(
        `/bot${mockToken}/sendMessage?chat_id=${mockChatId}&text=%F0%9F%94%8D+Fetching+data...`,
        {
          chat_id: mockChatId,
          text: "🔍 Fetching data...",
        }
      )
      .reply(200, {
        ok: true,
        result: { message_id: 12345 },
      });

    // Mock failed deletion
    scope.options(`/bot${mockToken}/editMessageText`).reply(204, undefined, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
    });

    scope
      .post(`/bot${mockToken}/editMessageText`, {
        chat_id: mockChatId,
        message_id: 12345,
        text: "❌ Error: Invalid ID format. Please try again.",
      })
      .replyWithError("Network error");

    const result = await handleNHCommand(
      mockToken,
      mockChatId,
      "",
      mockMessage,
      mockR2Bucket,
      mockNhApiUrl
    );

    expect(result.ok).toBe(false);
    expect(result.description).toContain("Invalid ID format");
  });

  it("should handle network error during data fetch", async () => {
    const scope = nock("https://api.telegram.org");

    // Mock loading message
    scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
    });

    scope
      .post(
        `/bot${mockToken}/sendMessage?chat_id=${mockChatId}&text=%F0%9F%94%8D+Fetching+data...`,
        {
          chat_id: mockChatId,
          text: "🔍 Fetching data...",
        }
      )
      .reply(200, {
        ok: true,
        result: { message_id: 12345 },
      });

    // Mock failed data fetch
    const nhScope = nock(mockNhApiUrl);
    nhScope.get("/get").query(true).replyWithError("Network error");

    // Mock message deletion
    scope.options(`/bot${mockToken}/editMessageText`).reply(204, undefined, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
    });

    scope
      .post(`/bot${mockToken}/editMessageText`, {
        chat_id: mockChatId,
        message_id: 12345,
        text: "❌ Error: Network error or timeout. Please try again.",
      })
      .reply(200, { ok: true });

    const result = await handleNHCommand(
      mockToken,
      mockChatId,
      "123456",
      mockMessage,
      mockR2Bucket,
      mockNhApiUrl
    );

    expect(result.ok).toBe(false);
    expect(result.description).toContain("Network error");
  });

  describe("valid inputs", () => {
    it.each`
      input                              | expectedId
      ${"https://nhentai.net/g/547949/"} | ${"547949"}
      ${"https://nhentai.net/g/547949"}  | ${"547949"}
      ${"#547949"}                       | ${"547949"}
      ${"547949"}                        | ${"547949"}
    `("should handle valid input: $input", async ({ input, expectedId }) => {
      const scope = nock("https://api.telegram.org");

      // Mock loading message
      scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      });

      scope
        .post(
          `/bot${mockToken}/sendMessage?chat_id=${mockChatId}&text=%F0%9F%94%8D+Fetching+data...`,
          {
            chat_id: mockChatId,
            text: "🔍 Fetching data...",
          }
        )
        .reply(200, {
          ok: true,
          result: { message_id: 12345 },
        });

      // Mock successful data fetch
      const nhScope = nock(mockNhApiUrl);
      nhScope
        .get(`/get`)
        .query({ id: expectedId })
        .reply(200, {
          id: parseInt(expectedId),
          media_id: expectedId,
          title: {
            english: "Test Title",
            japanese: "テストタイトル",
            pretty: "Test Title",
          },
          images: {
            pages: [{ url: "https://example.com/1.jpg" }],
            cover: { url: "https://example.com/cover.jpg" },
            thumbnail: { url: "https://example.com/thumb.jpg" },
          },
          scanlator: "",
          tags: [],
          num_pages: 1,
          num_favorites: 0,
          upload_date: 1234567890,
        });

      // Mock message deletion
      scope.options(`/bot${mockToken}/deleteMessage`).reply(204, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      });

      scope
        .post(`/bot${mockToken}/deleteMessage`, {
          chat_id: mockChatId,
          message_id: 12345,
        })
        .reply(200, { ok: true });

      // Mock formatted response message
      scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      });

      scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
        ok: true,
        result: { message_id: 12346 },
      });

      // Mock PDF status message
      scope.options(`/bot${mockToken}/sendMessage`).reply(204, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "content-type",
      });

      scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
        ok: true,
        result: { message_id: 12347 },
      });

      const result = await handleNHCommand(
        mockToken,
        mockChatId,
        input,
        mockMessage,
        mockR2Bucket,
        mockNhApiUrl
      );

      expect(result.ok).toBe(true);
    });
  });
});
