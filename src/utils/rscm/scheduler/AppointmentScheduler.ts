import { ConsultationSchedule } from "../types";
import { 
  generateDateRanges, 
  isMorningAppointment, 
  timeToMinutes, 
  formatDate 
} from "../dateUtils";
import { logger } from "../logger";

/**
 * Configuration options for the appointment scheduler
 */
export interface SchedulerConfig {
  daysAhead?: number;
  includeWeekends?: boolean;
  startDate?: Date;
  morningStartTime?: string;
  morningEndTime?: string;
}

/**
 * Manages appointment scheduling logic and date range generation
 */
export class AppointmentScheduler {
  private config: SchedulerConfig;
  private dateRangeCache: Map<string, Date[]> = new Map();

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      daysAhead: 14,
      includeWeekends: false,
      morningStartTime: "07:30",
      morningEndTime: "09:00",
      ...config
    };
  }

  /**
   * Generate cache key for date range
   */
  private generateCacheKey(startDate: Date, daysAhead: number, includeWeekends: boolean): string {
    const start = formatDate(startDate);
    return `${start}-${daysAhead}-${includeWeekends}`;
  }

  /**
   * Check if a date is a weekend
   */
  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  /**
   * Generate date ranges for appointment checking
   */
  generateDateRanges(options: Partial<SchedulerConfig> = {}): Date[] {
    const config = { ...this.config, ...options };
    const startDate = config.startDate || new Date();
    const daysAhead = config.daysAhead || 14;
    const includeWeekends = config.includeWeekends || false;

    // Check cache first
    const cacheKey = this.generateCacheKey(startDate, daysAhead, includeWeekends);
    if (this.dateRangeCache.has(cacheKey)) {
      logger.debug("Using cached date range", { cacheKey });
      return this.dateRangeCache.get(cacheKey)!;
    }

    logger.debug("Generating new date range", {
      startDate: formatDate(startDate),
      daysAhead,
      includeWeekends
    });

    const dates: Date[] = [];
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);

    // Calculate end date
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + daysAhead);

    // Generate dates
    const currentDate = new Date(start);
    while (currentDate < endDate) {
      // Include weekends if specified, otherwise exclude them
      if (includeWeekends || !this.isWeekend(currentDate)) {
        dates.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Cache the result
    this.dateRangeCache.set(cacheKey, dates);

    logger.info("Generated date range", {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      totalDates: dates.length,
      includeWeekends
    });

    return dates;
  }

  /**
   * Check if an appointment time is considered morning
   */
  isMorningAppointment(timeStr: string): boolean {
    const startTime = this.config.morningStartTime || "07:30";
    const endTime = this.config.morningEndTime || "09:00";
    
    const timeMinutes = timeToMinutes(timeStr);
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

  /**
   * Find the earliest morning appointment from a list of schedules
   */
  findEarliestMorningAppointment(schedules: ConsultationSchedule[]): ConsultationSchedule | undefined {
    logger.debug("Finding earliest morning appointment", {
      totalSchedules: schedules.length,
      morningRange: `${this.config.morningStartTime} - ${this.config.morningEndTime}`
    });

    const morningAppointments = schedules.filter(schedule => 
      this.isMorningAppointment(schedule.startTime)
    );

    logger.debug("Found morning appointments", {
      count: morningAppointments.length
    });

    if (morningAppointments.length === 0) {
      return undefined;
    }

    // Sort by date first, then by time
    const sorted = morningAppointments.sort((a, b) => {
      // First sort by date
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;

      // Then sort by start time
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    const earliest = sorted[0];
    logger.debug("Earliest morning appointment found", {
      date: earliest.date,
      time: earliest.startTime,
      doctor: earliest.doctorName
    });

    return earliest;
  }

  /**
   * Filter schedules by date range
   */
  filterSchedulesByDateRange(
    schedules: ConsultationSchedule[], 
    startDate: Date, 
    endDate: Date
  ): ConsultationSchedule[] {
    const start = formatDate(startDate);
    const end = formatDate(endDate);

    return schedules.filter(schedule => {
      const scheduleDate = schedule.date;
      return scheduleDate >= start && scheduleDate <= end;
    });
  }

  /**
   * Group schedules by date
   */
  groupSchedulesByDate(schedules: ConsultationSchedule[]): Map<string, ConsultationSchedule[]> {
    const grouped = new Map<string, ConsultationSchedule[]>();

    for (const schedule of schedules) {
      const date = schedule.date;
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(schedule);
    }

    // Sort schedules within each date by time
    for (const [date, dateSchedules] of grouped) {
      dateSchedules.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }

    return grouped;
  }

  /**
   * Find all available dates with appointments
   */
  findAvailableDates(schedules: ConsultationSchedule[]): string[] {
    const availableDates = new Set<string>();
    
    for (const schedule of schedules) {
      if (schedule.quota > 0) {
        availableDates.add(schedule.date);
      }
    }

    return Array.from(availableDates).sort();
  }

  /**
   * Clear date range cache
   */
  clearCache(): void {
    this.dateRangeCache.clear();
    logger.debug("Date range cache cleared");
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    // Clear cache when config changes
    this.clearCache();
    logger.debug("Scheduler config updated", { config: this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}