import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Update } from "@/types/telegram";
import { ChatType } from "@/types/telegram";
import type { R2Bucket } from "@cloudflare/workers-types";
import _nock from "nock";
import nock from "@/utils/test/nock";

type Variables = {
  baseUrl: string;
};

describe("Bot", () => {
  let app: Hono<{
    Bindings: {
      ENV_BOT_TOKEN: string;
      ENV_BOT_SECRET: string;
      BUCKET: R2Bucket;
      NH_API_URL: string;
      NODE_ENV?: string;
      NAMESPACE?: any;
      GEMINI_API_KEY: string;
      CHUTES_API_TOKEN: string;
      R2_BUCKET_NAME: string;
      R2_PUBLIC_URL: string;
      VIDEO_ANALYSIS_SERVICE_URL: string;
      WEBHOOK_SECRET: string;
    };
    Variables: Variables;
  }>;
  let mockBucket: R2Bucket;
  let mockEnv: {
    ENV_BOT_TOKEN: string;
    ENV_BOT_SECRET: string;
    BUCKET: R2Bucket;
    NH_API_URL: string;
    NODE_ENV?: string;
    NAMESPACE?: any;
    GEMINI_API_KEY: string;
    CHUTES_API_TOKEN: string;
    R2_BUCKET_NAME: string;
    R2_PUBLIC_URL: string;
    VIDEO_ANALYSIS_SERVICE_URL: string;
    WEBHOOK_SECRET: string;
  };

  beforeEach(() => {
    // Mock R2 bucket
    mockBucket = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as R2Bucket;

    // Mock environment variables
    mockEnv = {
      ENV_BOT_TOKEN: "test_token",
      ENV_BOT_SECRET: "test_secret",
      BUCKET: mockBucket,
      NH_API_URL: "https://api.example.com",
      GEMINI_API_KEY: "test_gemini_key",
      CHUTES_API_TOKEN: "test_chutes_token",
      R2_BUCKET_NAME: "test_bucket",
      R2_PUBLIC_URL: "https://test.r2.dev",
      VIDEO_ANALYSIS_SERVICE_URL: "https://test-video-service.com",
      WEBHOOK_SECRET: "test_webhook_secret",
    };

    // Import the app for each test to get a fresh instance
    vi.resetModules();

    // Clear all nock interceptors
    _nock.cleanAll();

    // Mock Telegram API endpoints
    const telegramApi = nock("https://api.telegram.org")
      .persist()
      .defaultReplyHeaders({
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });

    // Handle CORS preflight
    telegramApi.options(/.*/).reply(200);

    // Mock Telegram API endpoints
    telegramApi
      .get(/\/bot.*\/sendMessage.*/)
      .reply(200, { ok: true })
      .post(/\/bot.*\/sendMessage/)
      .reply(200, { ok: true })
      .post(/\/bot.*\/answerCallbackQuery/)
      .reply(200, { ok: true })
      .post(/\/bot.*\/editMessageText/)
      .reply(200, { ok: true });

    // Mock NH API endpoints
    const nhApi = nock("https://api.example.com")
      .persist()
      .defaultReplyHeaders({
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });

    // Handle CORS preflight
    nhApi.options(/.*/).reply(200);

    // Mock NH API endpoints
    nhApi
      .get(/\/.*/)
      .reply(200, {
        id: 177013,
        media_id: "177013",
        title: {
          english: "Test Title",
          japanese: "テストタイトル",
          pretty: "Test Title",
        },
      })
      .get(/\/pdf-status\/.*/)
      .reply(200, {
        status: true,
        pdf_status: "completed",
        pdf_url: "https://example.com/test.pdf",
      });
  });

  it("should validate webhook secret token", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "wrong_secret",
      },
    });

    const res = await app.fetch(req, { ...mockEnv });
    expect(res.status).toBe(401);
  });

  it("should handle valid webhook request with message update", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/nh 177013",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle valid webhook request with callback query", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      callback_query: {
        id: "123",
        from: {
          id: 456,
          is_bot: false,
          first_name: "Test",
        },
        chat_instance: "test-instance",
        message: {
          message_id: 789,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 101,
            type: ChatType.PRIVATE,
          },
        },
        data: "check_pdf_status:177013",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle bot being added to a group", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.GROUP,
        },
        new_chat_members: [
          {
            id: parseInt(mockEnv.ENV_BOT_TOKEN.split(":")[0]),
            is_bot: true,
            first_name: "Test Bot",
          },
        ],
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle non-command messages", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "Hello bot!",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle help command", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/help",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should set base URL in context", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        Host: "example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle malformed JSON in request body", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: "invalid json",
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(400);
  });

  it("should handle ping command", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        from: {
          id: 123,
          is_bot: false,
          first_name: "Test User",
        },
        text: "/ping",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle /nh command without input", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/nh",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle unknown commands", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/unknown",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle message without text", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should register webhook", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    // Mock the Telegram API response for setWebhook
    nock("https://api.telegram.org")
      .get(/\/bot.*\/setWebhook.*/)
      .reply(200, { ok: true });

    const req = new Request("http://localhost/registerWebhook", {
      method: "GET",
      headers: {
        Host: "example.com",
      },
    });

    const res = await app.fetch(req, { ...mockEnv });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Ok");
  });

  it("should handle webhook registration failure", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    // Mock the Telegram API response for setWebhook failure
    nock("https://api.telegram.org")
      .get(/\/bot.*\/setWebhook.*/)
      .reply(200, { ok: false, description: "Test error" });

    const req = new Request("http://localhost/registerWebhook", {
      method: "GET",
      headers: {
        Host: "example.com",
      },
    });

    const res = await app.fetch(req, { ...mockEnv });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Test error");
  });

  it("should unregister webhook", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    // Mock the Telegram API response for setWebhook
    nock("https://api.telegram.org")
      .get(/\/bot.*\/setWebhook.*/)
      .reply(200, { ok: true });

    const req = new Request("http://localhost/unRegisterWebhook", {
      method: "GET",
    });

    const res = await app.fetch(req, { ...mockEnv });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Ok");
  });

  it("should handle webhook unregistration failure", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    // Mock the Telegram API response for setWebhook failure
    nock("https://api.telegram.org")
      .get(/\/bot.*\/setWebhook.*/)
      .reply(200, { ok: false, description: "Test error" });

    const req = new Request("http://localhost/unRegisterWebhook", {
      method: "GET",
    });

    const res = await app.fetch(req, { ...mockEnv });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Test error");
  });

  it("should handle webhook handler error", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    // Clear existing mocks
    _nock.cleanAll();

    // Mock Telegram API to handle both OPTIONS and POST requests
    nock("https://api.telegram.org")
      .persist()
      .options(/\/bot.*\/sendMessage.*/)
      .reply(200, undefined, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      })
      .post(/\/bot.*\/sendMessage.*/)
      .replyWithError({ name: "NetworkError", message: "Network error" });

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/ping",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(500);
  });

  it("should handle /start command", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        from: {
          id: 123,
          is_bot: false,
          first_name: "Test User",
        },
        text: "/start",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle ping command at different times of day", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    // Mock different times of day
    const times = [
      { hour: 8, greeting: "Good morning" },
      { hour: 14, greeting: "Good afternoon" },
      { hour: 20, greeting: "Good evening" },
    ];

    for (const { hour, greeting } of times) {
      vi.useFakeTimers();
      const date = new Date();
      date.setHours(hour);
      vi.setSystemTime(date);

      const update: Update = {
        update_id: 123,
        message: {
          message_id: 456,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 789,
            type: ChatType.PRIVATE,
          },
          from: {
            id: 123,
            is_bot: false,
            first_name: "Test User",
          },
          text: "/ping",
        },
      };

      const req = new Request("http://localhost/endpoint", {
        method: "POST",
        headers: {
          "X-Telegram-Bot-Api-Secret-Token": "test_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(update),
      });

      const res = await app.fetch(req, {
        ...mockEnv,
        executionCtx: {
          waitUntil: vi.fn(),
          passThroughOnException: vi.fn(),
        },
      });
      expect(res.status).toBe(200);

      vi.useRealTimers();
    }
  });

  it("should handle /nh command with URL", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/nh https://nhentai.net/g/177013/",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });

  it("should handle /nh command with numeric ID", async () => {
    const { default: botApp } = await import("./index");
    app = botApp;

    const update: Update = {
      update_id: 123,
      message: {
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 789,
          type: ChatType.PRIVATE,
        },
        text: "/nh 177013",
      },
    };

    const req = new Request("http://localhost/endpoint", {
      method: "POST",
      headers: {
        "X-Telegram-Bot-Api-Secret-Token": "test_secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(update),
    });

    const res = await app.fetch(req, {
      ...mockEnv,
      executionCtx: {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      },
    });
    expect(res.status).toBe(200);
  });
});
