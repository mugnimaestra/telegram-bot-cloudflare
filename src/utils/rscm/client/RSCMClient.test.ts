import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RSCMClient } from "./RSCMClient";
import { RSCMConfig, RSCMError, RSCMErrorType } from "../types";
import { logger } from "../logger";

// Mock the logger
vi.mock("../logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logError: vi.fn(),
    performance: vi.fn(),
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("RSCMClient", () => {
  let client: RSCMClient;
  let mockConfig: RSCMConfig;

  beforeEach(() => {
    mockConfig = {
      api_url: "https://api.example.com/appointments",
      services: {
        "Test Service": {
          user_nm: "TEST_USER",
          key: "test_key",
          poli_id: "123",
          fungsi: "getJadwalDokter_dev",
        },
      },
      check_interval_seconds: 600,
    };

    client = new RSCMClient(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with provided config", () => {
      expect(client).toBeDefined();
      expect(client.getAvailableServices()).toEqual(["Test Service"]);
    });

    it("should initialize with custom retry settings", () => {
      const customClient = new RSCMClient(mockConfig, 5, 2000);
      expect(customClient).toBeDefined();
    });
  });

  describe("isValidService", () => {
    it("should return true for valid service", () => {
      expect(client.isValidService("Test Service")).toBe(true);
    });

    it("should return false for invalid service", () => {
      expect(client.isValidService("Invalid Service")).toBe(false);
    });
  });

  describe("getAvailableServices", () => {
    it("should return list of available services", () => {
      const services = client.getAvailableServices();
      expect(services).toEqual(["Test Service"]);
    });
  });

  describe("fetchAppointments", () => {
    const testDate = new Date("2024-01-15");

    it("should fetch appointments successfully", async () => {
      const mockResponse = {
        status: "200",
        data: [
          {
            actor: [{ display: "Dr. Smith" }],
            consultationDay: {
              start: "08:00",
              end: "09:00",
              quota: "5",
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.fetchAppointments("Test Service", testDate);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        doctorName: "Dr. Smith",
        startTime: "08:00",
        endTime: "09:00",
        quota: 5,
        date: "2024-01-15",
      });
    });

    it("should return empty array when no appointments found", async () => {
      const mockResponse = {
        status: "404",
        pesan: "No appointments found",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.fetchAppointments("Test Service", testDate);

      expect(result).toHaveLength(0);
    });

    it("should throw validation error for invalid service", async () => {
      await expect(
        client.fetchAppointments("Invalid Service", testDate)
      ).rejects.toThrow(RSCMError);

      await expect(
        client.fetchAppointments("Invalid Service", testDate)
      ).rejects.toThrow("Invalid service: Invalid Service");
    });

    it("should throw API error for non-200 HTTP status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        client.fetchAppointments("Test Service", testDate)
      ).rejects.toThrow(RSCMError);
    });

    it("should retry on network failure", async () => {
      // First two attempts fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "200", data: [] }),
        });

      const result = await client.fetchAppointments("Test Service", testDate);

      expect(result).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should throw network error after max retries", async () => {
      const customClient = new RSCMClient(mockConfig, 2, 100);
      
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(
        customClient.fetchAppointments("Test Service", testDate)
      ).rejects.toThrow(RSCMError);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchAppointmentsBatch", () => {
    const testDates = [
      new Date("2024-01-15"),
      new Date("2024-01-16"),
      new Date("2024-01-17"),
    ];

    it("should fetch appointments for multiple dates", async () => {
      const mockResponse = {
        status: "200",
        data: [
          {
            actor: [{ display: "Dr. Smith" }],
            consultationDay: {
              start: "08:00",
              end: "09:00",
              quota: "5",
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.fetchAppointmentsBatch(
        "Test Service",
        testDates,
        0 // No delay for testing
      );

      expect(result).toHaveLength(3); // One appointment per date
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should continue with other dates if one fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "200", data: [] }),
        })
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: "200", data: [] }),
        });

      const result = await client.fetchAppointmentsBatch(
        "Test Service",
        testDates,
        0
      );

      expect(result).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("should throw immediately for validation errors", async () => {
      await expect(
        client.fetchAppointmentsBatch("Invalid Service", testDates, 0)
      ).rejects.toThrow(RSCMError);
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const newConfig = {
        ...mockConfig,
        api_url: "https://new-api.example.com",
        services: {
          "New Service": {
            user_nm: "NEW_USER",
            key: "new_key",
            poli_id: "456",
            fungsi: "getJadwalDokter_dev",
          },
        },
      };

      client.updateConfig(newConfig);

      expect(client.getAvailableServices()).toEqual(["New Service"]);
      expect(client.isValidService("Test Service")).toBe(false);
      expect(client.isValidService("New Service")).toBe(true);
    });
  });
});