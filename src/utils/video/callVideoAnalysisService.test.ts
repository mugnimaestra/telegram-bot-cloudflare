import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callVideoAnalysisService, type VideoAnalysisRequest } from "./callVideoAnalysisService";
import nock from "@/utils/test/nock";
import _nock from "nock";
import { logger } from "@/utils/logger";

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedLogger = vi.mocked(logger);

describe("callVideoAnalysisService", () => {
  const serviceUrl = "https://test-video-service.com";
  const mockRequest: VideoAnalysisRequest = {
    videoUrl: "https://test.r2.dev/videos/test.mp4",
    userId: 123,
    chatId: 456,
  };

  const mockRecipe = {
    title: "Test Recipe",
    ingredients: [{ item: "test ingredient" }],
    equipment: [],
    instructions: [{ step: 1, description: "Test step" }],
  };

  beforeEach(() => {
    _nock.cleanAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _nock.cleanAll();
  });

  it("should handle 202 job acceptance response", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(true);
    expect(result.recipe).toBeUndefined();
  });

  it("should successfully call video analysis service with callback", async () => {
    const requestWithCallback: VideoAnalysisRequest = {
      ...mockRequest,
      botToken: "test-bot-token",
      callbackUrl: "https://example.com/webhook",
      messageId: 789,
    };

    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === requestWithCallback.videoUrl &&
               body.bot_token === requestWithCallback.botToken &&
               body.callback &&
               body.callback.type === 'webhook' &&
               body.callback.webhook_url === requestWithCallback.callbackUrl &&
               body.callback.chat_id === requestWithCallback.chatId &&
               body.callback.message_id === requestWithCallback.messageId &&
               body.metadata &&
               body.metadata.user_id === requestWithCallback.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, requestWithCallback);

    expect(result.success).toBe(true);
    expect(result.recipe).toBeUndefined();
  });

  it("should handle synchronous recipe response (fallback)", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(200, {
        success: true,
        recipe: mockRecipe,
      });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(true);
    expect(result.recipe).toEqual(mockRecipe);
  });

  it("should handle 404 error with 'Job not found' message", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(404, { error: "Job not found" });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Job not found");
  });

  it("should handle 400 bad request errors", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(400, { error: "Invalid request format" });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid request format");
  });

  it("should handle other HTTP errors", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .times(3) // Handle retry attempts
      .reply(500, { error: "Internal server error" });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Server error: 500");
  });

  it("should handle invalid recipe structure", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(200, {
        success: true,
        recipe: {
          // Missing required fields
          ingredients: [],
          instructions: [],
        },
      });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service returned invalid recipe format");
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      "Invalid recipe structure from service",
      expect.objectContaining({
        hasTitle: false,
        ingredientsCount: 0,
        instructionsCount: 0,
      })
    );
  });

  it("should handle service failure response", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(200, {
        success: false,
        error: "Analysis failed",
      });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Analysis failed");
  });

  it("should handle network errors", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .times(3) // Handle retry attempts
      .replyWithError("Network error");

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to execute \"fetch()\" on \"Window\" with URL \"https://test-video-service.com/analyze\": Network error");
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "Failed to call video analysis service",
      expect.objectContaining({
        error: "Failed to execute \"fetch()\" on \"Window\" with URL \"https://test-video-service.com/analyze\": Network error",
        serviceUrl,
        videoUrl: mockRequest.videoUrl,
      })
    );
  });

  it("should send correct request payload", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === mockRequest.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(mockedLogger.info).toHaveBeenCalledWith(
      "Calling video analysis service",
      expect.objectContaining({
        serviceUrl,
        videoUrl: mockRequest.videoUrl,
        userId: mockRequest.userId,
        chatId: mockRequest.chatId,
      })
    );
  });

  it("should handle request without optional user and chat IDs", async () => {
    const requestWithoutIds: VideoAnalysisRequest = {
      videoUrl: mockRequest.videoUrl,
    };

    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === mockRequest.videoUrl &&
               body.metadata &&
               body.metadata.user_id === undefined &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, requestWithoutIds);
    
    expect(result.success).toBe(true);
  });

  it("should handle request with caption", async () => {
    const requestWithCaption: VideoAnalysisRequest = {
      ...mockRequest,
      caption: "This is a test caption for the video",
    };

    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === requestWithCaption.videoUrl &&
               body.caption === requestWithCaption.caption &&
               body.metadata &&
               body.metadata.user_id === requestWithCaption.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, requestWithCaption);
    
    expect(result.success).toBe(true);
    expect(mockedLogger.info).toHaveBeenCalledWith(
      "Calling video analysis service",
      expect.objectContaining({
        hasCaption: true,
        captionLength: requestWithCaption.caption?.length,
      })
    );
  });

  it("should handle request with empty caption", async () => {
    const requestWithEmptyCaption: VideoAnalysisRequest = {
      ...mockRequest,
      caption: "",
    };

    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === requestWithEmptyCaption.videoUrl &&
               body.caption === requestWithEmptyCaption.caption &&
               body.metadata &&
               body.metadata.user_id === requestWithEmptyCaption.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, requestWithEmptyCaption);
    
    expect(result.success).toBe(true);
  });

  it("should reject request with non-string caption", async () => {
    const requestWithInvalidCaption: VideoAnalysisRequest = {
      ...mockRequest,
      caption: 123 as any, // Invalid type
    };

    const result = await callVideoAnalysisService(serviceUrl, requestWithInvalidCaption);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe("Caption must be a string");
  });

  it("should reject request with caption too long", async () => {
    const requestWithLongCaption: VideoAnalysisRequest = {
      ...mockRequest,
      caption: "A".repeat(1025), // Exceeds 1024 character limit
    };

    const result = await callVideoAnalysisService(serviceUrl, requestWithLongCaption);
    
    expect(result.success).toBe(false);
    expect(result.error).toBe("Caption must be 1024 characters or less");
  });

  it("should handle request with exactly 1024 character caption", async () => {
    const requestWithMaxCaption: VideoAnalysisRequest = {
      ...mockRequest,
      caption: "A".repeat(1024), // Exactly at the limit
    };

    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === requestWithMaxCaption.videoUrl &&
               body.caption === requestWithMaxCaption.caption &&
               body.metadata &&
               body.metadata.user_id === requestWithMaxCaption.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, requestWithMaxCaption);
    
    expect(result.success).toBe(true);
  });

  it("should handle request with caption and callback", async () => {
    const requestWithCaptionAndCallback: VideoAnalysisRequest = {
      ...mockRequest,
      caption: "Test caption with callback",
      botToken: "test-bot-token",
      callbackUrl: "https://example.com/webhook",
      messageId: 789,
    };

    const scope = nock(serviceUrl)
      .post("/analyze", (body) => {
        return body.video_url === requestWithCaptionAndCallback.videoUrl &&
               body.caption === requestWithCaptionAndCallback.caption &&
               body.bot_token === requestWithCaptionAndCallback.botToken &&
               body.callback &&
               body.callback.type === 'webhook' &&
               body.callback.webhook_url === requestWithCaptionAndCallback.callbackUrl &&
               body.callback.chat_id === requestWithCaptionAndCallback.chatId &&
               body.callback.message_id === requestWithCaptionAndCallback.messageId &&
               body.metadata &&
               body.metadata.user_id === requestWithCaptionAndCallback.userId &&
               typeof body.metadata.timestamp === 'number';
      })
      .matchHeader("content-type", "application/json")
      .matchHeader("user-agent", "TelegramBot/1.0")
      .reply(202, {
        job_id: "test-job-123",
        status: "processing",
        message: "Job accepted for processing",
      });

    const result = await callVideoAnalysisService(serviceUrl, requestWithCaptionAndCallback);
    
    expect(result.success).toBe(true);
  });
});