import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { handlePDFDownload } from "./handlePDFDownload";
import _nock from "nock";
import { ChatType, ImageType } from "@/types/telegram";
import type { Message, NHAPIResponse } from "@/types/telegram";
import type { R2Bucket } from "@cloudflare/workers-types";
import nock from "../test/nock";

describe("handlePDFDownload", () => {
  const mockToken = "test_token";
  const mockChatId = 123456789;
  const mockPdfUrl = "https://example.com/test.pdf";
  const mockContent = "Test PDF content";
  const mockMessageId = 987654321;

  const mockData: NHAPIResponse = {
    id: 177013,
    media_id: "test_media",
    title: {
      english: "Test Title",
      japanese: "テストタイトル",
      pretty: "Test Pretty Title",
    },
    images: {
      pages: [],
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
    upload_date: 1609459200,
    num_pages: 1,
    num_favorites: 0,
    tags: [],
    pdf_url: mockPdfUrl,
  };

  const mockMessage: Message = {
    message_id: mockMessageId,
    date: 1609459200,
    chat: {
      id: mockChatId,
      type: ChatType.PRIVATE,
    },
  };

  const mockR2Object = {
    key: "test.pdf",
    version: "1",
    size: mockContent.length,
    etag: "test-etag",
    httpEtag: "test-http-etag",
    checksums: {
      md5: Buffer.from("test-md5"),
      sha1: Buffer.from("test-sha1"),
      sha256: Buffer.from("test-sha256"),
      sha384: Buffer.from("test-sha384"),
      sha512: Buffer.from("test-sha512"),
      toJSON: () => ({
        md5: "test-md5",
        sha1: "test-sha1",
        sha256: "test-sha256",
        sha384: "test-sha384",
        sha512: "test-sha512",
      }),
    },
    uploaded: new Date(),
    httpMetadata: {},
    customMetadata: {},
    range: () => null,
    writeHttpMetadata: () => {},
    blob: async () => new Blob([mockContent], { type: "application/pdf" }),
  };

  const mockBucket = {
    head: vi.fn(),
    get: vi.fn().mockResolvedValue(mockR2Object),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;

  const setupNockForTelegramAPI = (
    endpoint: string,
    response: any,
    threadId?: number
  ) => {
    // Mock CORS preflight request with query parameters
    nock("https://api.telegram.org")
      .persist()
      .options(new RegExp(`/bot${mockToken}/${endpoint}(\\?.*)?`))
      .reply(200, "", {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });

    // Mock GET request
    nock("https://api.telegram.org")
      .persist()
      .get(new RegExp(`/bot${mockToken}/${endpoint}(\\?.*)?`))
      .reply(200, response);

    // Mock POST request
    nock("https://api.telegram.org")
      .persist()
      .post(new RegExp(`/bot${mockToken}/${endpoint}(\\?.*)?`))
      .reply(200, response);
  };

  beforeEach(() => {
    // Setup mocks for all required endpoints
    setupNockForTelegramAPI("sendMessage", {
      ok: true,
      result: {
        message_id: mockMessageId,
        chat: {
          id: mockChatId,
          type: ChatType.PRIVATE,
        },
      },
    });

    setupNockForTelegramAPI("sendDocument", {
      ok: true,
      result: {
        message_id: mockMessageId + 1,
        chat: {
          id: mockChatId,
          type: ChatType.PRIVATE,
        },
        document: {
          file_id: "test_file_id",
          file_unique_id: "test_unique_id",
          file_name: "test_title_177013.pdf",
          mime_type: "application/pdf",
          file_size: mockContent.length,
        },
      },
    });

    setupNockForTelegramAPI("deleteMessage", {
      ok: true,
      result: true,
    });

    setupNockForTelegramAPI("editMessageText", {
      ok: true,
      result: {
        message_id: mockMessageId,
        chat: {
          id: mockChatId,
          type: ChatType.PRIVATE,
        },
      },
    });
  });

  afterEach(() => {
    _nock.cleanAll();
    vi.clearAllMocks();
  });

  it("should download and send PDF successfully", async () => {
    const result = await handlePDFDownload(
      mockToken,
      mockChatId,
      mockData,
      mockBucket,
      mockMessage
    );

    expect(result.ok).toBe(true);
    expect(mockBucket.get).toHaveBeenCalledWith("test.pdf");
  });

  it("should handle missing R2 bucket", async () => {
    await expect(
      handlePDFDownload(
        mockToken,
        mockChatId,
        mockData,
        null as unknown as R2Bucket,
        mockMessage
      )
    ).rejects.toThrow("R2 Bucket is not properly configured");
  });

  it("should handle missing PDF URL", async () => {
    const dataWithoutPdfUrl = { ...mockData };
    delete dataWithoutPdfUrl.pdf_url;

    await expect(
      handlePDFDownload(
        mockToken,
        mockChatId,
        dataWithoutPdfUrl,
        mockBucket,
        mockMessage
      )
    ).rejects.toThrow("PDF URL is not available");
  });

  it("should handle PDF not found in R2", async () => {
    const bucketWithoutPdf = {
      ...mockBucket,
      get: vi.fn().mockResolvedValue(null),
    } as unknown as R2Bucket;

    await expect(
      handlePDFDownload(
        mockToken,
        mockChatId,
        mockData,
        bucketWithoutPdf,
        mockMessage
      )
    ).rejects.toThrow("PDF not found in R2 storage");
  });

  it("should handle send document error", async () => {
    // Clean up existing sendDocument mocks
    _nock.cleanAll();

    // Re-setup all mocks except sendDocument
    setupNockForTelegramAPI("sendMessage", {
      ok: true,
      result: {
        message_id: mockMessageId,
        chat: {
          id: mockChatId,
          type: ChatType.PRIVATE,
        },
      },
    });

    setupNockForTelegramAPI("deleteMessage", {
      ok: true,
      result: true,
    });

    setupNockForTelegramAPI("editMessageText", {
      ok: true,
      result: {
        message_id: mockMessageId,
        chat: {
          id: mockChatId,
          type: ChatType.PRIVATE,
        },
      },
    });

    // Mock send document error
    nock("https://api.telegram.org")
      .persist()
      .options(new RegExp(`/bot${mockToken}/sendDocument(\\?.*)?`))
      .reply(200, "", {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });

    nock("https://api.telegram.org")
      .persist()
      .post(new RegExp(`/bot${mockToken}/sendDocument(\\?.*)?`))
      .reply(400, {
        ok: false,
        error_code: 400,
        description: "Bad Request: file must be non-empty",
      });

    await expect(
      handlePDFDownload(
        mockToken,
        mockChatId,
        mockData,
        mockBucket,
        mockMessage
      )
    ).rejects.toThrow("Failed to send PDF document");
  });

  it("should handle message thread ID", async () => {
    const mockThreadId = 123;
    const messageWithThread: Message = {
      ...mockMessage,
      message_thread_id: mockThreadId,
    };

    const result = await handlePDFDownload(
      mockToken,
      mockChatId,
      mockData,
      mockBucket,
      messageWithThread
    );

    expect(result.ok).toBe(true);
    expect(mockBucket.get).toHaveBeenCalledWith("test.pdf");
  });
});
