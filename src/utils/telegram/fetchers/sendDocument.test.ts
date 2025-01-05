import { describe, it, expect, afterEach } from "vitest";
import { sendDocument } from "./sendDocument";
import nock from "nock";

describe("sendDocument", () => {
  const mockToken = "test_token";
  const mockChatId = "123456789";
  const mockFilename = "test.pdf";
  const mockCaption = "Test Document";
  const mockContent = "Test content";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should send document successfully", async () => {
    // Mock CORS preflight request
    nock("https://api.telegram.org")
      .options(`/bot${mockToken}/sendDocument`)
      .reply(204, undefined, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });

    // Mock the actual request
    nock("https://api.telegram.org")
      .post(`/bot${mockToken}/sendDocument`)
      .reply(200, {
        ok: true,
        result: {
          message_id: 123,
          chat: {
            id: mockChatId,
            type: "private",
          },
          document: {
            file_id: "test_file_id",
            file_unique_id: "test_unique_id",
            file_name: mockFilename,
            mime_type: "application/pdf",
            file_size: mockContent.length,
          },
        },
      });

    const blob = new Blob([mockContent], { type: "application/pdf" });
    const result = await sendDocument(
      {
        chat_id: mockChatId,
        document: blob,
        filename: mockFilename,
      },
      mockToken
    );

    expect(result.ok).toBe(true);
  });

  it("should send document with caption", async () => {
    // Mock CORS preflight request
    nock("https://api.telegram.org")
      .options(`/bot${mockToken}/sendDocument`)
      .reply(204, undefined, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });

    // Mock the actual request
    nock("https://api.telegram.org")
      .post(`/bot${mockToken}/sendDocument`)
      .reply(200, {
        ok: true,
        result: {
          message_id: 123,
          chat: {
            id: mockChatId,
            type: "private",
          },
          document: {
            file_id: "test_file_id",
            file_unique_id: "test_unique_id",
            file_name: mockFilename,
            mime_type: "application/pdf",
            file_size: mockContent.length,
          },
          caption: mockCaption,
        },
      });

    const blob = new Blob([mockContent], { type: "application/pdf" });
    const result = await sendDocument(
      {
        chat_id: mockChatId,
        document: blob,
        filename: mockFilename,
        caption: mockCaption,
      },
      mockToken
    );

    expect(result.ok).toBe(true);
  });

  it("should send document with message thread id", async () => {
    const mockThreadId = "987654321";

    // Mock CORS preflight request
    nock("https://api.telegram.org")
      .options(`/bot${mockToken}/sendDocument`)
      .reply(204, undefined, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });

    // Mock the actual request
    nock("https://api.telegram.org")
      .post(`/bot${mockToken}/sendDocument`)
      .reply(200, {
        ok: true,
        result: {
          message_id: 123,
          chat: {
            id: mockChatId,
            type: "private",
          },
          message_thread_id: mockThreadId,
          document: {
            file_id: "test_file_id",
            file_unique_id: "test_unique_id",
            file_name: mockFilename,
            mime_type: "application/pdf",
            file_size: mockContent.length,
          },
        },
      });

    const blob = new Blob([mockContent], { type: "application/pdf" });
    const result = await sendDocument(
      {
        chat_id: mockChatId,
        document: blob,
        filename: mockFilename,
        message_thread_id: mockThreadId,
      },
      mockToken
    );

    expect(result.ok).toBe(true);
  });

  it("should handle API error", async () => {
    // Mock CORS preflight request
    nock("https://api.telegram.org")
      .options(`/bot${mockToken}/sendDocument`)
      .reply(204, undefined, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });

    // Mock the API error response
    nock("https://api.telegram.org")
      .post(`/bot${mockToken}/sendDocument`)
      .reply(400, {
        ok: false,
        error_code: 400,
        description: "Bad Request: file must be non-empty",
      });

    const blob = new Blob([mockContent], { type: "application/pdf" });
    await expect(
      sendDocument(
        {
          chat_id: mockChatId,
          document: blob,
          filename: mockFilename,
        },
        mockToken
      )
    ).rejects.toThrow("HTTP error! status: 400");
  });

  it("should handle network error", async () => {
    // Mock CORS preflight request
    nock("https://api.telegram.org")
      .options(`/bot${mockToken}/sendDocument`)
      .reply(204, undefined, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
      });

    // Mock network error
    nock("https://api.telegram.org")
      .post(`/bot${mockToken}/sendDocument`)
      .replyWithError("Network error");

    const blob = new Blob([mockContent], { type: "application/pdf" });
    await expect(
      sendDocument(
        {
          chat_id: mockChatId,
          document: blob,
          filename: mockFilename,
        },
        mockToken
      )
    ).rejects.toThrow("Network error");
  });
});
