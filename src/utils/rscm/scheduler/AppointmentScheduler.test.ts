import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppointmentScheduler } from "./AppointmentScheduler";
import { ConsultationSchedule } from "../types";
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

describe("AppointmentScheduler", () => {
  let scheduler: AppointmentScheduler;

  beforeEach(() => {
    scheduler = new AppointmentScheduler();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(scheduler).toBeDefined();
      expect(scheduler.getConfig()).toEqual({
        daysAhead: 14,
        includeWeekends: false,
        morningStartTime: "07:30",
        morningEndTime: "09:00",
      });
    });

    it("should initialize with custom config", () => {
      const customScheduler = new AppointmentScheduler({
        daysAhead: 7,
        includeWeekends: true,
        morningStartTime: "08:00",
        morningEndTime: "10:00",
      });

      expect(customScheduler.getConfig()).toEqual({
        daysAhead: 7,
        includeWeekends: true,
        morningStartTime: "08:00",
        morningEndTime: "10:00",
      });
    });
  });

  describe("generateDateRanges", () => {
    it("should generate weekday dates for next 14 days", () => {
      const startDate = new Date("2024-01-15"); // Monday
      const dates = scheduler.generateDateRanges({ startDate });

      expect(dates).toHaveLength(10); // 2 weeks of weekdays
      expect(dates[0].toISOString().split('T')[0]).toBe("2024-01-15");
      
      // Should not include weekends
      dates.forEach(date => {
        const dayOfWeek = date.getDay();
        expect(dayOfWeek).not.toBe(0); // Not Sunday
        expect(dayOfWeek).not.toBe(6); // Not Saturday
      });
    });

    it("should include weekends when specified", () => {
      const startDate = new Date("2024-01-15"); // Monday
      const dates = scheduler.generateDateRanges({ 
        startDate, 
        includeWeekends: true 
      });

      expect(dates).toHaveLength(14); // All 14 days
    });

    it("should generate custom number of days", () => {
      const startDate = new Date("2024-01-15"); // Monday
      const dates = scheduler.generateDateRanges({ 
        startDate, 
        daysAhead: 7 
      });

      expect(dates).toHaveLength(5); // 1 week of weekdays
    });

    it("should use cache for repeated calls", () => {
      const startDate = new Date("2024-01-15");
      
      const dates1 = scheduler.generateDateRanges({ startDate });
      const dates2 = scheduler.generateDateRanges({ startDate });

      expect(dates1).toBe(dates2); // Should return the same array reference
    });
  });

  describe("isMorningAppointment", () => {
    it("should return true for morning times", () => {
      expect(scheduler.isMorningAppointment("07:30")).toBe(true);
      expect(scheduler.isMorningAppointment("08:00")).toBe(true);
      expect(scheduler.isMorningAppointment("09:00")).toBe(true);
    });

    it("should return false for non-morning times", () => {
      expect(scheduler.isMorningAppointment("07:29")).toBe(false);
      expect(scheduler.isMorningAppointment("09:01")).toBe(false);
      expect(scheduler.isMorningAppointment("14:00")).toBe(false);
    });

    it("should respect custom morning time range", () => {
      const customScheduler = new AppointmentScheduler({
        morningStartTime: "08:00",
        morningEndTime: "10:00",
      });

      expect(customScheduler.isMorningAppointment("07:30")).toBe(false);
      expect(customScheduler.isMorningAppointment("08:00")).toBe(true);
      expect(customScheduler.isMorningAppointment("10:00")).toBe(true);
      expect(customScheduler.isMorningAppointment("10:01")).toBe(false);
    });
  });

  describe("findEarliestMorningAppointment", () => {
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
        startTime: "08:00",
        endTime: "09:00",
        quota: 3,
        date: "2024-01-15",
      },
      {
        doctorName: "Dr. Brown",
        startTime: "07:30",
        endTime: "08:30",
        quota: 2,
        date: "2024-01-16",
      },
    ];

    it("should find earliest morning appointment", () => {
      const earliest = scheduler.findEarliestMorningAppointment(mockSchedules);

      expect(earliest).toEqual({
        doctorName: "Dr. Johnson",
        startTime: "08:00",
        endTime: "09:00",
        quota: 3,
        date: "2024-01-15",
      });
    });

    it("should return undefined when no morning appointments", () => {
      const nonMorningSchedules = mockSchedules.filter(
        s => !scheduler.isMorningAppointment(s.startTime)
      );

      const earliest = scheduler.findEarliestMorningAppointment(nonMorningSchedules);
      expect(earliest).toBeUndefined();
    });

    it("should prioritize earlier date over earlier time", () => {
      const schedulesWithEarlierTime = [
        ...mockSchedules,
        {
          doctorName: "Dr. Early",
          startTime: "07:30",
          endTime: "08:30",
          quota: 1,
          date: "2024-01-14", // Earlier date
        },
      ];

      const earliest = scheduler.findEarliestMorningAppointment(schedulesWithEarlierTime);

      expect(earliest?.date).toBe("2024-01-14");
      expect(earliest?.doctorName).toBe("Dr. Early");
    });
  });

  describe("filterSchedulesByDateRange", () => {
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
      {
        doctorName: "Dr. Brown",
        startTime: "08:00",
        endTime: "09:00",
        quota: 2,
        date: "2024-01-20",
      },
    ];

    it("should filter schedules by date range", () => {
      const startDate = new Date("2024-01-15");
      const endDate = new Date("2024-01-16");

      const filtered = scheduler.filterSchedulesByDateRange(
        mockSchedules,
        startDate,
        endDate
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.map(s => s.date)).toEqual(["2024-01-15", "2024-01-16"]);
    });
  });

  describe("groupSchedulesByDate", () => {
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
        startTime: "08:00",
        endTime: "09:00",
        quota: 3,
        date: "2024-01-15",
      },
      {
        doctorName: "Dr. Brown",
        startTime: "08:00",
        endTime: "09:00",
        quota: 2,
        date: "2024-01-16",
      },
    ];

    it("should group schedules by date", () => {
      const grouped = scheduler.groupSchedulesByDate(mockSchedules);

      expect(grouped.size).toBe(2);
      expect(grouped.get("2024-01-15")).toHaveLength(2);
      expect(grouped.get("2024-01-16")).toHaveLength(1);
    });

    it("should sort schedules within each date by time", () => {
      const grouped = scheduler.groupSchedulesByDate(mockSchedules);
      const jan15Schedules = grouped.get("2024-01-15")!;

      expect(jan15Schedules[0].startTime).toBe("08:00");
      expect(jan15Schedules[1].startTime).toBe("10:00");
    });
  });

  describe("findAvailableDates", () => {
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
        quota: 0, // No quota
        date: "2024-01-16",
      },
      {
        doctorName: "Dr. Brown",
        startTime: "08:00",
        endTime: "09:00",
        quota: 2,
        date: "2024-01-17",
      },
    ];

    it("should find dates with available quota", () => {
      const availableDates = scheduler.findAvailableDates(mockSchedules);

      expect(availableDates).toEqual(["2024-01-15", "2024-01-17"]);
    });
  });

  describe("cache management", () => {
    it("should clear cache", () => {
      const startDate = new Date("2024-01-15");
      
      scheduler.generateDateRanges({ startDate });
      scheduler.clearCache();
      
      // Should generate new dates after cache clear
      const dates = scheduler.generateDateRanges({ startDate });
      expect(dates).toBeDefined();
    });
  });

  describe("updateConfig", () => {
    it("should update configuration and clear cache", () => {
      const startDate = new Date("2024-01-15");
      
      // Generate dates with initial config
      scheduler.generateDateRanges({ startDate });
      
      // Update config
      scheduler.updateConfig({ daysAhead: 7 });
      
      // Should use new config
      expect(scheduler.getConfig().daysAhead).toBe(7);
      
      // Should generate new dates with updated config
      const dates = scheduler.generateDateRanges({ startDate });
      expect(dates).toHaveLength(5); // 1 week of weekdays
    });
  });
});