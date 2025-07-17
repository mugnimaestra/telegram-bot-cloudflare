import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRSCMCommand } from "./handleRSCMCommand";
import { TelegramContext } from "./types";
import { ChatType, Message } from "../../types/telegram";
import { CommandHandler } from "./handlers/CommandHandler";

// Increase test timeout
vi.setConfig({ testTimeout: 10000 });

// Mock the CommandHandler
vi.mock("./handlers/CommandHandler", () => ({
  CommandHandler: vi.fn(),
}));

// Mock the logger
vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("handleRSCMCommand", () => {
  const mockMessage: Message = {
    message_id: 2,
    chat: {
      id: 123,
      type: ChatType.PRIVATE,
    },
    date: Math.floor(Date.now() / 1000),
  };

  // Mock Telegram context with proper types
  const reply = vi.fn().mockResolvedValue(mockMessage);
  const editMessageText = vi.fn().mockResolvedValue(true);

  const mockContext: TelegramContext = {
    message: {
      message_id: 1,
      chat: {
        id: 123,
        type: ChatType.PRIVATE,
      },
      text: "",
      date: Math.floor(Date.now() / 1000),
    },
    chat: {
      id: 123,
      type: ChatType.PRIVATE,
    },
    reply: reply as typeof reply & { mock: { calls: any[][] } },
    telegram: {
      editMessageText: editMessageText as typeof editMessageText & {
        mock: { calls: any[][] };
      },
    },
  };

  const mockHandleCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset the mock constructor
    vi.mocked(CommandHandler).mockImplementation(() => ({
      handleCommand: mockHandleCommand,
    } as any));
  });

  it("should create CommandHandler and delegate to handleCommand", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";
    mockHandleCommand.mockResolvedValueOnce(undefined);

    await handleRSCMCommand(mockContext);

    expect(CommandHandler).toHaveBeenCalledWith(undefined);
    expect(mockHandleCommand).toHaveBeenCalledWith(mockContext);
  });

  it("should create CommandHandler with env parameter", async () => {
    const mockEnv = {
      RSCM_CONFIG: '{"api_url": "https://test.com"}',
      RSCM_API_URL: "https://test.com",
    };

    mockContext.message.text = "/rscm URJT Geriatri";
    mockHandleCommand.mockResolvedValueOnce(undefined);

    await handleRSCMCommand(mockContext, mockEnv);

    expect(CommandHandler).toHaveBeenCalledWith(mockEnv);
    expect(mockHandleCommand).toHaveBeenCalledWith(mockContext);
  });

  it("should handle errors from CommandHandler gracefully", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";
    const testError = new Error("Test error from CommandHandler");
    mockHandleCommand.mockRejectedValueOnce(testError);

    await handleRSCMCommand(mockContext);

    expect(CommandHandler).toHaveBeenCalledWith(undefined);
    expect(mockHandleCommand).toHaveBeenCalledWith(mockContext);
    expect(reply).toHaveBeenCalledWith(
      "❌ An unexpected error occurred\\. Please try again later\\.",
      { parse_mode: "MarkdownV2" }
    );
  });

  it("should handle errors in fallback reply", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";
    const testError = new Error("Test error from CommandHandler");
    mockHandleCommand.mockRejectedValueOnce(testError);
    reply.mockRejectedValueOnce(new Error("Reply failed"));

    // Should not throw
    await expect(handleRSCMCommand(mockContext)).resolves.not.toThrow();

    expect(CommandHandler).toHaveBeenCalledWith(undefined);
    expect(mockHandleCommand).toHaveBeenCalledWith(mockContext);
    expect(reply).toHaveBeenCalledWith(
      "❌ An unexpected error occurred\\. Please try again later\\.",
      { parse_mode: "MarkdownV2" }
    );
  });

  it("should log command handling", async () => {
    const { logger } = await import("./logger");
    
    mockContext.message.text = "/rscm URJT Geriatri";
    mockHandleCommand.mockResolvedValueOnce(undefined);

    await handleRSCMCommand(mockContext);

    expect(logger.info).toHaveBeenCalledWith(
      "Handling RSCM command",
      {
        chatId: 123,
        messageText: "/rscm URJT Geriatri",
      }
    );
  });

  it("should log unhandled errors", async () => {
    const { logger } = await import("./logger");
    
    mockContext.message.text = "/rscm URJT Geriatri";
    const testError = new Error("Test error");
    mockHandleCommand.mockRejectedValueOnce(testError);

    await handleRSCMCommand(mockContext);

    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled error in RSCM command handler",
      {
        error: "Test error",
      }
    );
  });
});