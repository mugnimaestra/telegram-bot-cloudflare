import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleNHCommand } from "./handleNHCommand";
import { PDFStatus, ChatType } from "@/types/telegram";
import nock from "nock";
import type { Message } from "@/types/telegram";
import { mockR2Bucket } from "../../utils/test/mockR2Bucket";
import setupNock, { mockPDFDownload } from "../../utils/test/nock";
import { mockAnswerCallbackQuery } from "../telegram/fetchers/__mocks__/answerCallbackQuery";
import { mockEditMessageText } from "../telegram/fetchers/__mocks__/editMessageText";
import { mockSendDocument } from "../telegram/fetchers/__mocks__/sendDocument";

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
    // Clear all mocks before each test
    nock.cleanAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up all nock interceptors
    nock.cleanAll();
  });

  it("should handle loading message timeout", async () => {
    // Mock the loading message request to timeout
    const scope = setupNock("https://api.telegram.org");
    scope
      .post(`/bot${mockToken}/sendMessage`)
      .delay(11000) // Longer than our 10s timeout
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
    // Mock successful loading message
    const scope = setupNock("https://api.telegram.org");
    scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
      ok: true,
      result: { message_id: 12345 },
    });

    // Mock failed deletion
    scope
      .post(`/bot${mockToken}/deleteMessage`)
      .replyWithError("Network error");

    // Mock the fallback edit message
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockChatId,
        message_id: 12345,
        text: "❌ Request failed or timed out. Please try again.",
      },
    });

    // Mock invalid input to trigger error path
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

  it("should handle invalid ID format", async () => {
    // Mock loading message
    const scope = setupNock("https://api.telegram.org");
    scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
      ok: true,
      result: { message_id: 12345 },
    });

    // Mock message deletion
    scope.post(`/bot${mockToken}/deleteMessage`).reply(200, { ok: true });

    const result = await handleNHCommand(
      mockToken,
      mockChatId,
      "invalid-id",
      mockMessage,
      mockR2Bucket,
      mockNhApiUrl
    );

    expect(result.ok).toBe(false);
    expect(result.description).toContain("Invalid ID format");
  });

  it("should handle network error during data fetch", async () => {
    // Mock loading message
    const scope = setupNock("https://api.telegram.org");
    scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
      ok: true,
      result: { message_id: 12345 },
    });

    // Mock failed data fetch
    const nhScope = setupNock(mockNhApiUrl);
    nhScope.get("/get").query(true).replyWithError("Network error");

    // Mock message deletion
    scope.post(`/bot${mockToken}/deleteMessage`).reply(200, { ok: true });

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

  it("should handle PDF download failure and fallback to Telegraph", async () => {
    // Mock loading message
    const scope = setupNock("https://api.telegram.org");
    scope
      .options(`/bot${mockToken}/sendMessage`)
      .reply(200, {})
      .post(`/bot${mockToken}/sendMessage`)
      .query(true)
      .times(3)
      .reply(200, {
        ok: true,
        result: { message_id: 12345 },
      });

    scope
      .options(`/bot${mockToken}/deleteMessage`)
      .reply(200, {})
      .post(`/bot${mockToken}/deleteMessage`)
      .query(true)
      .reply(200, {
        ok: true,
      });

    scope
      .options(`/bot${mockToken}/editMessageText`)
      .reply(200, {})
      .post(`/bot${mockToken}/editMessageText`)
      .query(true)
      .reply(200, {
        ok: true,
        result: { message_id: 12345 },
      });

    // Mock successful data fetch
    const nhScope = setupNock(mockNhApiUrl);
    nhScope
      .options("/get")
      .reply(200, {})
      .get("/get")
      .query(true)
      .reply(200, {
        id: 123456,
        media_id: "123456",
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
        pdf_status: PDFStatus.COMPLETED,
        pdf_url: "https://example.com/test.pdf",
      });

    // Mock Telegraph fallback
    const telegraphScope = setupNock("https://api.telegra.ph");
    telegraphScope
      .options("/createAccount")
      .reply(200, {})
      .post("/createAccount")
      .reply(200, {
        ok: true,
        result: {
          access_token: "test_token",
          auth_url: "https://edit.telegra.ph/auth/test_token",
        },
      });

    telegraphScope
      .options("/createPage")
      .reply(200, {})
      .post("/createPage")
      .reply(200, {
        ok: true,
        result: {
          path: "test-page",
          url: "https://telegra.ph/test-page",
        },
      });

    // Mock bucket without get method
    const mockBucket = {
      head: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      createMultipartUpload: vi.fn(),
      resumeMultipartUpload: vi.fn(),
      abortMultipartUpload: vi.fn(),
      completeMultipartUpload: vi.fn(),
    } as unknown as R2Bucket;

    const result = await handleNHCommand(
      mockToken,
      mockChatId,
      "123456",
      mockMessage,
      mockBucket,
      mockNhApiUrl
    );

    expect(result.ok).toBe(true);
    expect(mockBucket.head).not.toHaveBeenCalled(); // Since get method doesn't exist, no bucket operations should be called
  });

  it("should handle message thread ID in error responses", async () => {
    const messageWithThread = {
      ...mockMessage,
      message_thread_id: 98765,
    };

    // Mock loading message
    const scope = setupNock("https://api.telegram.org");
    scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
      ok: true,
      result: { message_id: 12345 },
    });

    // Mock message deletion
    scope.post(`/bot${mockToken}/deleteMessage`).reply(200, { ok: true });

    const result = await handleNHCommand(
      mockToken,
      mockChatId,
      "",
      messageWithThread,
      mockR2Bucket,
      mockNhApiUrl
    );

    expect(result.ok).toBe(false);
    expect(result.description).toContain("Invalid ID format");
  });

  it("should handle edit message failure during error handling", async () => {
    // Mock loading message
    const scope = setupNock("https://api.telegram.org");
    scope.post(`/bot${mockToken}/sendMessage`).reply(200, {
      ok: true,
      result: { message_id: 12345 },
    });

    // Mock message deletion failure
    scope
      .post(`/bot${mockToken}/deleteMessage`)
      .replyWithError("Network error");

    // Mock edit message failure
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockChatId,
        message_id: 12345,
        text: "❌ Request failed or timed out. Please try again.",
      },
      response: { ok: false, description: "Network error" },
    });

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
});
