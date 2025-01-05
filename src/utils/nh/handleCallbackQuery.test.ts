import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleCallbackQuery, STATUS_CHECK_CACHE } from "./handleCallbackQuery";
import type { CallbackQuery } from "@/types/telegram";
import { ChatType, PDFStatus, ImageType, TagType } from "@/types/telegram";
import _nock from "nock";
import { mockFetchPDFStatus } from "./fetchers/__mocks__/fetchPDFStatus";
import { mockFetchNHData } from "./fetchers/__mocks__/fetchNHData";
import { mockAnswerCallbackQuery } from "../telegram/fetchers/__mocks__/answerCallbackQuery";
import { mockEditMessageText } from "../telegram/fetchers/__mocks__/editMessageText";
import { mockSendDocument } from "../telegram/fetchers/__mocks__/sendDocument";
import { getPDFStatusMessage } from "@/utils/pdf/getPDFStatusMessage";
import { getPDFKeyboard } from "@/utils/pdf/getPDFKeyboard";
import nock from "../test/nock";

describe("handleCallbackQuery", () => {
  const mockToken = "test_token";
  const mockNhApiUrl = "https://api.example.com";
  const mockGalleryId = "177013";
  const STATUS_CHECK_LIMIT = 10;

  const mockCallbackQuery: CallbackQuery = {
    id: "123",
    from: {
      id: 123456789,
      is_bot: false,
      first_name: "Test",
    },
    message: {
      message_id: 987654321,
      date: 123456789,
      chat: {
        id: 123456789,
        type: ChatType.PRIVATE,
      },
      text: "Test message",
    },
    chat_instance: "test",
    data: `check_pdf_status:${mockGalleryId}`,
  };

  const mockCallbackQueryWithoutData: CallbackQuery = {
    ...mockCallbackQuery,
    data: "",
  };

  const mockCallbackQueryWithoutGalleryId: CallbackQuery = {
    ...mockCallbackQuery,
    data: "check_pdf_status:",
  };

  const mockCallbackQueryWithInvalidAction: CallbackQuery = {
    ...mockCallbackQuery,
    data: `invalid_action:${mockGalleryId}`,
  };

  beforeEach(() => {
    // Reset the status check cache
    STATUS_CHECK_CACHE.clear();
  });

  afterEach(() => {
    // Clean up all nock interceptors
    _nock.cleanAll();
    // Reset the status check cache
    STATUS_CHECK_CACHE.clear();
  });

  it("should handle empty query data", async () => {
    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQueryWithoutData,
      mockNhApiUrl
    );
    expect(result).toBe(false);
  });

  it("should handle missing gallery ID", async () => {
    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQueryWithoutGalleryId,
      mockNhApiUrl
    );
    expect(result).toBe(false);
  });

  it("should handle invalid action", async () => {
    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQueryWithInvalidAction,
      mockNhApiUrl
    );
    expect(result).toBe(false);
  });

  it("should handle status check limit", async () => {
    // Mock the PDF status endpoint to always return processing
    mockFetchPDFStatus({
      galleryId: mockGalleryId,
      response: {
        status: true,
        pdf_status: PDFStatus.PROCESSING,
      },
    });

    // Mock all possible answerCallbackQuery calls
    for (let i = 1; i <= STATUS_CHECK_LIMIT; i++) {
      mockAnswerCallbackQuery({
        token: mockToken,
        request: {
          callback_query_id: mockCallbackQuery.id,
          text: `Current status: ${PDFStatus.PROCESSING}. Check count: ${i}/${STATUS_CHECK_LIMIT}`,
          show_alert: true,
        },
      });
      mockAnswerCallbackQuery({
        token: mockToken,
        request: {
          callback_query_id: mockCallbackQuery.id,
        },
      });
    }

    // Mock the error case
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: "Failed to check PDF status. Please try again.",
        show_alert: true,
      },
    });

    // Mock the limit reached case
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: "Maximum status check limit reached. Please try the command again.",
        show_alert: true,
      },
    });

    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockCallbackQuery.message?.chat.id,
        message_id: mockCallbackQuery.message?.message_id,
        text: `ℹ️ ${getPDFStatusMessage(PDFStatus.PROCESSING)}`,
        parse_mode: "MarkdownV2",
        reply_markup: getPDFKeyboard(
          parseInt(mockGalleryId),
          PDFStatus.PROCESSING
        ),
      },
    });

    // Call handleCallbackQuery multiple times to exceed limit
    for (let i = 0; i < 11; i++) {
      const result = await handleCallbackQuery(
        mockToken,
        mockCallbackQuery,
        mockNhApiUrl
      );
      if (i < 10) {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    }
  });

  it("should handle PDF status check - PROCESSING", async () => {
    mockFetchPDFStatus({
      galleryId: mockGalleryId,
      response: {
        status: true,
        pdf_status: PDFStatus.PROCESSING,
      },
    });
    // Mock the first answerCallbackQuery call with status
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: `Current status: ${PDFStatus.PROCESSING}. Check count: 1/${STATUS_CHECK_LIMIT}`,
        show_alert: true,
      },
    });
    // Mock the second answerCallbackQuery call without text
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
      },
    });
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockCallbackQuery.message?.chat.id,
        message_id: mockCallbackQuery.message?.message_id,
        text: `ℹ️ ${getPDFStatusMessage(PDFStatus.PROCESSING)}`,
        parse_mode: "MarkdownV2",
        reply_markup: getPDFKeyboard(
          parseInt(mockGalleryId),
          PDFStatus.PROCESSING
        ),
      },
    });

    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQuery,
      mockNhApiUrl
    );
    expect(result).toBe(true);
  });

  it("should handle PDF status check - COMPLETED", async () => {
    mockFetchPDFStatus({
      galleryId: mockGalleryId,
      response: {
        status: true,
        pdf_status: PDFStatus.COMPLETED,
        pdf_url: "https://example.com/test.pdf",
      },
    });
    mockFetchNHData({
      galleryId: mockGalleryId,
      response: {
        id: parseInt(mockGalleryId),
        media_id: "987654",
        title: {
          english: "Test Title",
          japanese: "テストタイトル",
          pretty: "Test Pretty Title",
        },
        images: {
          pages: [
            {
              t: ImageType.JPG,
              w: 1200,
              h: 1700,
            },
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
        scanlator: "",
        tags: [
          {
            id: 1,
            type: TagType.TAG,
            name: "test",
            url: "/tag/test",
            count: 1,
          },
        ],
        num_pages: 1,
        num_favorites: 0,
        upload_date: 1609459200,
      },
    });

    // Mock the first answerCallbackQuery call without text
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
      },
    });

    // Mock the error case
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: "Failed to check PDF status. Please try again.",
        show_alert: true,
      },
    });

    // Mock the first editMessageText call
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockCallbackQuery.message?.chat.id,
        message_id: mockCallbackQuery.message?.message_id,
        text: "ℹ️ PDF is ready\\! Sending the file\\.\\.\\.",
        parse_mode: "MarkdownV2",
      },
    });
    // Mock the second editMessageText call
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockCallbackQuery.message?.chat.id,
        message_id: mockCallbackQuery.message?.message_id,
        text: "✅ PDF has been sent\\! To download again, please use the command again\\.",
        parse_mode: "MarkdownV2",
      },
    });

    // Mock the sendDocument call with multipart/form-data
    nock("https://api.telegram.org")
      .post(`/bot${mockToken}/sendDocument`)
      .reply(200, {
        ok: true,
        result: {
          message_id: 123,
          chat: { id: mockCallbackQuery.message?.chat.id },
        },
      });

    // Mock the PDF download with CORS preflight
    nock("https://example.com").options("/test.pdf").reply(200, undefined, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    });

    nock("https://example.com")
      .get("/test.pdf")
      .reply(200, Buffer.from("mock pdf content"));

    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQuery,
      mockNhApiUrl
    );
    expect(result).toBe(true);
  });

  it("should handle PDF status check - ERROR", async () => {
    mockFetchPDFStatus({
      galleryId: mockGalleryId,
      response: {
        status: true,
        pdf_status: PDFStatus.ERROR,
      },
    });
    // Mock the first answerCallbackQuery call with status
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: `Current status: ${PDFStatus.ERROR}. Check count: 1/${STATUS_CHECK_LIMIT}`,
        show_alert: true,
      },
    });
    // Mock the second answerCallbackQuery call without text
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
      },
    });
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockCallbackQuery.message?.chat.id,
        message_id: mockCallbackQuery.message?.message_id,
        text: `ℹ️ ${getPDFStatusMessage(PDFStatus.ERROR)}`,
        parse_mode: "MarkdownV2",
        reply_markup: getPDFKeyboard(parseInt(mockGalleryId), PDFStatus.ERROR),
      },
    });

    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQuery,
      mockNhApiUrl
    );
    expect(result).toBe(true);
  });

  it("should handle API error", async () => {
    mockFetchPDFStatus({
      galleryId: mockGalleryId,
      response: {
        status: false,
      },
    });
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: "Failed to check PDF status. Please try again.",
        show_alert: true,
      },
    });

    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQuery,
      mockNhApiUrl
    );
    expect(result).toBe(false);
  });

  it("should handle network error", async () => {
    nock(mockNhApiUrl)
      .get(`/pdf-status/${mockGalleryId}`)
      .replyWithError({ message: "Network error" });
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: "Failed to check PDF status. Please try again.",
        show_alert: true,
      },
    });

    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQuery,
      mockNhApiUrl
    );
    expect(result).toBe(false);
  });

  it("should handle malformed gallery data", async () => {
    mockFetchPDFStatus({
      galleryId: mockGalleryId,
      response: {
        status: true,
        pdf_status: PDFStatus.COMPLETED,
        pdf_url: "https://example.com/test.pdf",
      },
    });
    mockFetchNHData({
      galleryId: mockGalleryId,
      response: {
        id: parseInt(mockGalleryId),
      }, // Missing required fields
    });
    mockAnswerCallbackQuery({
      token: mockToken,
      request: {
        callback_query_id: mockCallbackQuery.id,
        text: "Failed to check PDF status. Please try again.",
        show_alert: true,
      },
    });
    mockEditMessageText({
      token: mockToken,
      request: {
        chat_id: mockCallbackQuery.message?.chat.id,
        message_id: mockCallbackQuery.message?.message_id,
        text: "ℹ️ PDF is ready\\! Sending the file\\.\\.\\.",
        parse_mode: "MarkdownV2",
      },
    });

    // Mock the PDF download
    nock("https://example.com")
      .get("/test.pdf")
      .reply(200, Buffer.from("mock pdf content"));

    const result = await handleCallbackQuery(
      mockToken,
      mockCallbackQuery,
      mockNhApiUrl
    );
    expect(result).toBe(false);
  });
});
