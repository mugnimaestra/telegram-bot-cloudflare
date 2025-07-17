import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResponseHandler } from "./ResponseHandler";
import { AppointmentResult, ConsultationSchedule, RSCMError, RSCMErrorType } from "../types";
import { logger } from "../logger";

// Mock the logger
vi.mock("../logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ResponseHandler", () => {
  let responseHandler: ResponseHandler;

  beforeEach(() => {
    responseHandler = new ResponseHandler();
    vi.clearAllMocks();
  });

  describe("formatSuccessResponse", () => {
    it("should format response when no appointments available", () => {
      const result: AppointmentResult = {
        schedules: [],
        service: "Test Service",
        date: "2024-01-15",
      };

      const response = responseHandler.formatSuccessResponse(result);

      expect(response).toContain("❌ *No appointments available*");
      expect(response).toContain("*Service:* Test Service");
      expect(response).toContain("*Period:* Next 2 weeks");
    });

    it("should format response with earliest morning appointment", () => {
      const mockSchedules: ConsultationSchedule[] = [
        {
          doctorName: "Dr. Smith",
          startTime: "08:00",
          endTime: "09:00",
          quota: 5,
          date: "2024-01-15",
        },
        {
          doctorName: "Dr. Johnson",
          startTime: "10:00",
          endTime: "11:00",
          quota: 3,
          date: "2024-01-16",
        },
      ];

      const result: AppointmentResult = {
        schedules: mockSchedules,
        earliestMorning: mockSchedules[0],
        service: "Test Service",
        date: "2024-01-15",
      };

      const response = responseHandler.formatSuccessResponse(result);

      expect(response).toContain("🌅 *Earliest morning appointment found\\!*");
      expect(response).toContain("*Service:* Test Service");
      expect(response).toContain("*Date:* 2024\\-01\\-15");
      expect(response).toContain("*Time:* 08:00 \\- 09:00");
      expect(response).toContain("*Doctor:* Dr\\. Smith");
      expect(response).toContain("*Quota:* 5");
    });

    it("should format response with general appointments (no morning)", () => {
      const mockSchedules: ConsultationSchedule[] = [
        {
          doctorName: "Dr. Smith",
          startTime: "10:00",
          endTime: "11:00",
          quota: 5,
          date: "2024-01-15",
        },
        {
          doctorName: "Dr. Johnson",
          startTime: "14:00",
          endTime: "15:00",
          quota: 3,
          date: "2024-01-15",
        },
      ];

      const result: AppointmentResult = {
        schedules: mockSchedules,
        service: "Test Service",
        date: "2024-01-15",
      };

      const response = responseHandler.formatSuccessResponse(result);

      expect(response).toContain("📅 *Appointments available*");
      expect(response).toContain("*Service:* Test Service");
      expect(response).toContain("*2024\\-01\\-15*");
      expect(response).toContain("• 10:00 \\- 11:00 \\- Dr\\. Smith \\(5\\)");
      expect(response).toContain("• 14:00 \\- 15:00 \\- Dr\\. Johnson \\(3\\)");
      expect(response).toContain("ℹ️ *No morning appointments");
    });

    it("should limit number of appointments shown per date", () => {
      const mockSchedules: ConsultationSchedule[] = [];
      for (let i = 0; i < 5; i++) {
        mockSchedules.push({
          doctorName: `Dr. ${i}`,
          startTime: `${10 + i}:00`,
          endTime: `${11 + i}:00`,
          quota: 1,
          date: "2024-01-15",
        });
      }

      const result: AppointmentResult = {
        schedules: mockSchedules,
        service: "Test Service",
        date: "2024-01-15",
      };

      const response = responseHandler.formatSuccessResponse(result);

      expect(response).toContain("\\.\\.\\. and 2 more");
    });

    it("should limit number of dates shown", () => {
      const mockSchedules: ConsultationSchedule[] = [];
      for (let i = 0; i < 10; i++) {
        mockSchedules.push({
          doctorName: "Dr. Smith",
          startTime: "10:00",
          endTime: "11:00",
          quota: 1,
          date: `2024-01-${15 + i}`,
        });
      }

      const result: AppointmentResult = {
        schedules: mockSchedules,
        service: "Test Service",
        date: "2024-01-15",
      };

      const response = responseHandler.formatSuccessResponse(result);

      expect(response).toContain("\\.\\.\\. and 5 more dates available");
    });
  });

  describe("formatErrorResponse", () => {
    it("should format RSCM error response", () => {
      const error = new RSCMError(
        RSCMErrorType.INVALID_SERVICE,
        "Invalid service: Test Service"
      );

      const response = responseHandler.formatErrorResponse(error);

      expect(response).toContain("⚠️ *Invalid Service*");
      expect(response).toContain("Invalid service: Test Service");
      expect(response).toContain("Please try again later");
    });

    it("should format API error response", () => {
      const error = new RSCMError(
        RSCMErrorType.API_ERROR,
        "API returned status 500"
      );

      const response = responseHandler.formatErrorResponse(error);

      expect(response).toContain("🚫 *API Error*");
      expect(response).toContain("API returned status 500");
    });

    it("should format network error response", () => {
      const error = new RSCMError(
        RSCMErrorType.NETWORK_ERROR,
        "Network request failed"
      );

      const response = responseHandler.formatErrorResponse(error);

      expect(response).toContain("🌐 *Network Error*");
      expect(response).toContain("Network request failed");
    });

    it("should format timeout error response", () => {
      const error = new RSCMError(
        RSCMErrorType.TIMEOUT_ERROR,
        "Request timed out"
      );

      const response = responseHandler.formatErrorResponse(error);

      expect(response).toContain("❌ *Error*");
      expect(response).toContain("Request timed out");
    });

    it("should format general error response", () => {
      const error = new Error("General error message");

      const response = responseHandler.formatErrorResponse(error);

      expect(response).toContain("❌ *An error occurred*");
      expect(response).toContain("General error message");
    });
  });

  describe("formatHelpMessage", () => {
    it("should format help message with available services", () => {
      const availableServices = ["URJT Geriatri", "IPKT Jantung"];

      const response = responseHandler.formatHelpMessage(availableServices);

      expect(response).toContain("ℹ️ *RSCM Appointment Checker*");
      expect(response).toContain("*Usage:* \\`/rscm <service_name>\\`");
      expect(response).toContain("*Available services:*");
      expect(response).toContain("• URJT Geriatri");
      expect(response).toContain("• IPKT Jantung");
      expect(response).toContain("*Example:* \\`/rscm URJT Geriatri\\`");
    });

    it("should handle empty services list", () => {
      const availableServices: string[] = [];

      const response = responseHandler.formatHelpMessage(availableServices);

      expect(response).toContain("*Available services:*");
      expect(response).not.toContain("•");
    });
  });

  describe("markdown escaping", () => {
    it("should escape markdown special characters", () => {
      const mockSchedules: ConsultationSchedule[] = [
        {
          doctorName: "Dr. Smith (Specialist)",
          startTime: "08:00",
          endTime: "09:00",
          quota: 5,
          date: "2024-01-15",
        },
      ];

      const result: AppointmentResult = {
        schedules: mockSchedules,
        earliestMorning: mockSchedules[0],
        service: "Test Service",
        date: "2024-01-15",
      };

      const response = responseHandler.formatSuccessResponse(result);

      expect(response).toContain("Dr\\. Smith \\(Specialist\\)");
    });

    it("should escape service names with special characters", () => {
      const availableServices = ["Service-1", "Service_2", "Service*3"];

      const response = responseHandler.formatHelpMessage(availableServices);

      expect(response).toContain("• Service\\-1");
      expect(response).toContain("• Service\\_2");
      expect(response).toContain("• Service\\*3");
    });
  });
});