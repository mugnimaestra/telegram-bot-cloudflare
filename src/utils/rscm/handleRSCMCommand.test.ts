import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRSCMCommand } from "./handleRSCMCommand";
import { TelegramContext } from "./types";
import { ChatType, Message } from "../../types/telegram";
import { mockFetchAppointments } from "./fetchers/__mocks__/fetchAppointments";

// Increase test timeout
vi.setConfig({ testTimeout: 10000 });

// Mock dependencies
vi.mock("./fetchers/fetchAppointments");
vi.mock("./dateUtils", () => ({
  generateDateRanges: () => [new Date("2025-03-07")],
  formatDate: (date: Date) => date.toISOString().split("T")[0],
  isMorningAppointment: (time: string) => {
    const hour = parseInt(time.split(":")[0], 10);
    return hour < 12;
  },
  formatTimeRange: (startTime: string, endTime: string) => {
    return `${startTime} - ${endTime}`;
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show help message when no service is provided", async () => {
    mockContext.message.text = "/rscm";

    await handleRSCMCommand(mockContext);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0]).toContain("RSCM Appointment Checker Help");
    expect(reply.mock.calls[0][0]).toContain("Available services");
  });

  it("should show error for invalid service", async () => {
    mockContext.message.text = "/rscm InvalidService";

    await handleRSCMCommand(mockContext);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0]).toContain("❌ Invalid service");
  });

  it("should fetch and display appointments for valid service", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";

    const mockAppointment = {
      doctorName: "Dr. Test",
      startTime: "08:00",
      endTime: "12:00",
      quota: 10,
      date: "2025-03-07",
    };

    // Mock the reply function to return a Message object
    const mockReplyMessage: Message = {
      message_id: 2,
      chat: {
        id: 123,
        type: ChatType.PRIVATE,
      },
      date: Math.floor(Date.now() / 1000),
    };

    // Clear all mocks before setting them up
    vi.clearAllMocks();

    // Set up mocks
    vi.mocked(reply).mockResolvedValueOnce(mockReplyMessage);
    vi.mocked(editMessageText).mockResolvedValueOnce(true);
    vi.mocked(mockFetchAppointments).mockResolvedValueOnce([mockAppointment]);

    await handleRSCMCommand(mockContext);

    // Should show processing message
    expect(reply).toHaveBeenCalledWith(
      "🔄 Checking appointments\\.\\.\\. Please wait\\.",
      { parse_mode: "MarkdownV2" }
    );

    // Should update with results
    expect(editMessageText).toHaveBeenCalledWith(
      123, // chat id
      2, // message id from processing message
      undefined,
      expect.stringContaining("Dr\\. Test"), // escaped doctor name
      { parse_mode: "MarkdownV2" }
    );
  });

  it("should handle API errors gracefully", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";

    // Mock API error
    vi.mocked(mockFetchAppointments).mockRejectedValueOnce(
      new Error("API error")
    );

    // Mock the reply function to return a Message object
    const mockReplyMessage: Message = {
      message_id: 2,
      chat: {
        id: 123,
        type: ChatType.PRIVATE,
      },
      date: Math.floor(Date.now() / 1000),
    };
    vi.mocked(reply).mockResolvedValueOnce(mockReplyMessage);

    await handleRSCMCommand(mockContext);

    // Should show error message
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining("❌ *Error checking appointments*"),
      { parse_mode: "MarkdownV2" }
    );
  });

  it("should show when no appointments are available", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";

    // Mock empty response
    vi.mocked(mockFetchAppointments).mockResolvedValueOnce([]);
    vi.mocked(mockContext.reply).mockResolvedValueOnce(mockMessage);
    vi.mocked(editMessageText).mockResolvedValueOnce(true);

    await handleRSCMCommand(mockContext);

    expect(editMessageText).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      undefined,
      expect.stringContaining("No appointments available"),
      { parse_mode: "MarkdownV2" }
    );
  });

  it("should highlight earliest morning appointment when available", async () => {
    mockContext.message.text = "/rscm URJT Geriatri";

    const mockAppointments = [
      {
        doctorName: "Dr. Late",
        startTime: "13:00",
        endTime: "16:00",
        quota: 5,
        date: "2025-03-07",
      },
      {
        doctorName: "Dr. Early",
        startTime: "07:30",
        endTime: "11:30",
        quota: 8,
        date: "2025-03-07",
      },
    ];

    // Mock the reply function to return a Message object
    const mockReplyMessage: Message = {
      message_id: 2,
      chat: {
        id: 123,
        type: ChatType.PRIVATE,
      },
      date: Math.floor(Date.now() / 1000),
    };

    // Clear all mocks before setting them up
    vi.clearAllMocks();

    // Set up mocks
    vi.mocked(reply).mockResolvedValueOnce(mockReplyMessage);
    vi.mocked(editMessageText).mockResolvedValueOnce(true);
    vi.mocked(mockFetchAppointments).mockResolvedValueOnce(mockAppointments);

    await handleRSCMCommand(mockContext);

    // Should update with results
    expect(editMessageText).toHaveBeenCalledWith(
      123, // chat id
      2, // message id from processing message
      undefined,
      expect.stringContaining("Earliest Morning Appointment"),
      { parse_mode: "MarkdownV2" }
    );
  });
});
