import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callVideoAnalysisService, type VideoAnalysisRequest } from "./callVideoAnalysisService";
import nock from "@/utils/test/nock";
import _nock from "nock";
import { logger } from "@/utils/logger";

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
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

  it("should successfully call video analysis service", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze")
      .matchHeader("content-type", "application/json")
      .reply(200, {
        success: true,
        recipe: mockRecipe,
      });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(true);
    expect(result.recipe).toEqual(mockRecipe);
    expect(scope.isDone()).toBe(true);
  });

  it("should handle 404 error with 'Job not found' message", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze")
      .matchHeader("content-type", "application/json")
      .reply(404, { error: "Job not found" });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Job not found");
    expect(scope.isDone()).toBe(true);
  });

  it("should handle other HTTP errors", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze")
      .matchHeader("content-type", "application/json")
      .reply(500, { error: "Internal server error" });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service returned 500: Internal Server Error");
    expect(scope.isDone()).toBe(true);
  });

  it("should handle invalid recipe structure", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze")
      .matchHeader("content-type", "application/json")
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
    expect(scope.isDone()).toBe(true);
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
      .post("/analyze")
      .matchHeader("content-type", "application/json")
      .reply(200, {
        success: false,
        error: "Analysis failed",
      });

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Analysis failed");
    expect(scope.isDone()).toBe(true);
  });

  it("should handle network errors", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze")
      .matchHeader("content-type", "application/json")
      .replyWithError("Network error");

    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
    expect(scope.isDone()).toBe(true);
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "Failed to call video analysis service",
      expect.objectContaining({
        error: "Network error",
        serviceUrl,
        videoUrl: mockRequest.videoUrl,
      })
    );
  });

  it("should send correct request payload", async () => {
    const scope = nock(serviceUrl)
      .post("/analyze", {
        video_url: mockRequest.videoUrl,
        user_id: mockRequest.userId,
        chat_id: mockRequest.chatId,
      })
      .matchHeader("content-type", "application/json")
      .reply(200, {
        success: true,
        recipe: mockRecipe,
      });

    await callVideoAnalysisService(serviceUrl, mockRequest);

    expect(scope.isDone()).toBe(true);
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
      .post("/analyze", {
        video_url: mockRequest.videoUrl,
        user_id: undefined,
        chat_id: undefined,
      })
      .matchHeader("content-type", "application/json")
      .reply(200, {
        success: true,
        recipe: mockRecipe,
      });

    await callVideoAnalysisService(serviceUrl, requestWithoutIds);

    expect(scope.isDone()).toBe(true);
  });
});