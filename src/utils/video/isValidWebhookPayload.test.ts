import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidWebhookPayload } from "./videoJobWebhook";
import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";

// Mock logger to avoid noise during tests
vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("isValidWebhookPayload", () => {
  const mockBotToken = "test-bot-token";
  const mockChatId = 12345;
  const mockMessageId = 67890;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Valid payloads", () => {
    it("should accept valid completed status payload with result object", () => {
      const payload: VideoAnalysisWebhookPayload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept valid payload with original error_details format (size_context_limit error)", () => {
      const payload: VideoAnalysisWebhookPayload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Video exceeds size and context limits",
        error_type: "size_context_limit",
        error_details: {
          max_size_mb: 50,
          max_duration_seconds: 120,
          max_frames: 3000,
          suggested_actions: [
            "Use a shorter video",
            "Reduce video resolution",
            "Focus on key cooking steps only"
          ]
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept valid payload with Go API error_details format (api_error)", () => {
      const payload: VideoAnalysisWebhookPayload = {
        job_id: "test-job-123",
        status: "failed",
        error: "API processing error",
        error_type: "api_error",
        error_details: {
          estimated_tokens: 15000,
          largest_model_capacity: 32000,
          model_name: "gemini-pro-vision",
          suggestions: [
            "Try again with a shorter video",
            "Ensure the video clearly shows cooking steps",
            "Check if the video format is supported"
          ]
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept valid payload with mixed error_details format (both original and Go API fields)", () => {
      const payload: VideoAnalysisWebhookPayload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Mixed format error",
        error_type: "api_error",
        error_details: {
          max_size_mb: 50,
          estimated_tokens: 15000,
          largest_model_capacity: 32000,
          model_name: "gemini-pro-vision",
          suggested_actions: ["Use a shorter video"],
          suggestions: ["Try again with a shorter video"]
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept valid failed status payload with minimal error details", () => {
      const payload: VideoAnalysisWebhookPayload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Processing failed",
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept payload with string chat_id and message_id that can be converted to numbers", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: "12345",
          message_id: "67890",
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
      
      // Verify that the payload was modified with converted numbers
      expect(payload.callback_data.chat_id).toBe(12345);
      expect(payload.callback_data.message_id).toBe(67890);
    });

    it("should accept valid error types", () => {
      const validErrorTypes = ["size_context_limit", "processing_error", "network_error", "unknown_error", "api_error"];
      
      validErrorTypes.forEach(errorType => {
        const payload: VideoAnalysisWebhookPayload = {
          job_id: "test-job-123",
          status: "failed",
          error: "Test error",
          error_type: errorType as any,
          callback_data: {
            chat_id: mockChatId,
            message_id: mockMessageId,
            bot_token: mockBotToken,
          },
        };

        const result = isValidWebhookPayload(payload);
        expect(result).toBe(true);
      });
    });
  });

  describe("Invalid payloads - missing required fields", () => {
    it("should reject null or undefined payload", () => {
      expect(isValidWebhookPayload(null)).toBe(false);
      expect(isValidWebhookPayload(undefined)).toBe(false);
    });

    it("should reject non-object payload", () => {
      expect(isValidWebhookPayload("string")).toBe(false);
      expect(isValidWebhookPayload(123)).toBe(false);
      expect(isValidWebhookPayload(true)).toBe(false);
      expect(isValidWebhookPayload([])).toBe(false);
    });

    it("should reject payload with missing job_id", () => {
      const payload = {
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with empty job_id", () => {
      const payload = {
        job_id: "",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with invalid job_id type", () => {
      const payload = {
        job_id: 123,
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with missing status", () => {
      const payload = {
        job_id: "test-job-123",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with invalid status value", () => {
      const payload = {
        job_id: "test-job-123",
        status: "invalid_status",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with missing callback_data", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });
  });

  describe("Invalid payloads - completed status validation", () => {
    it("should reject completed status without result", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with missing recipe_text", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with empty recipe_text", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with invalid recipe_text type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: 123,
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with missing recipe_title", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with empty recipe_title", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with invalid recipe_title type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: 123,
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with missing recipe_ready", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject completed status with invalid recipe_ready type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: "true",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });
  });

  describe("Invalid payloads - failed status validation", () => {
    it("should reject failed status without error", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject failed status with empty error", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "",
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject failed status with invalid error type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: 123,
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject failed status with invalid error_type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "invalid_error_type",
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject failed status with non-object error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: "invalid_details",
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject failed status with null error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: null,
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject failed status with empty error_details object", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {},
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });
  });

  describe("Invalid payloads - error_details validation", () => {
    it("should reject error_details with invalid max_size_mb type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          max_size_mb: "50",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid max_duration_seconds type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          max_duration_seconds: "120",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid max_frames type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          max_frames: "3000",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid suggested_actions type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          suggested_actions: "Use a shorter video",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with non-string elements in suggested_actions", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          suggested_actions: ["Use a shorter video", 123],
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid estimated_tokens type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          estimated_tokens: "15000",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid largest_model_capacity type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          largest_model_capacity: "32000",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid model_name type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          model_name: 123,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with empty model_name", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          model_name: "",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with invalid suggestions type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          suggestions: "Try again with a shorter video",
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject error_details with non-string elements in suggestions", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          suggestions: ["Try again with a shorter video", 123],
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });
  });

  describe("Invalid payloads - callback_data validation", () => {
    it("should reject payload with invalid chat_id type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: {},
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with empty chat_id string", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: "",
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with non-numeric chat_id string", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: "abc123",
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with invalid message_id type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: {},
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with empty message_id string", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: "",
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with non-numeric message_id string", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: "abc123",
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with invalid bot_token type", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: 123,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with empty bot_token", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: "",
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });

    it("should reject payload with whitespace-only bot_token", () => {
      const payload = {
        job_id: "test-job-123",
        status: "completed",
        result: {
          recipe_text: "Test recipe instructions",
          recipe_title: "Test Recipe",
          recipe_ready: true,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: "   ",
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should accept payload with minimal valid error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          max_size_mb: 50,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept payload with minimal valid Go API error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          estimated_tokens: 15000,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept payload with zero values in error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          max_size_mb: 0,
          max_duration_seconds: 0,
          max_frames: 0,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept payload with empty arrays in error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "size_context_limit",
        error_details: {
          suggested_actions: [],
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });

    it("should accept payload with negative numbers in error_details", () => {
      const payload = {
        job_id: "test-job-123",
        status: "failed",
        error: "Test error",
        error_type: "api_error",
        error_details: {
          estimated_tokens: -1,
          largest_model_capacity: -1,
        },
        callback_data: {
          chat_id: mockChatId,
          message_id: mockMessageId,
          bot_token: mockBotToken,
        },
      };

      const result = isValidWebhookPayload(payload);
      expect(result).toBe(true);
    });
  });
});