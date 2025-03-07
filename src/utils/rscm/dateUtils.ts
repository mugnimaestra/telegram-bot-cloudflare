/**
 * Utilities for handling dates in RSCM appointment checker
 */

/**
 * Generate date ranges for the next two weeks starting from today, excluding weekends
 */
export function generateDateRanges(
  startDate: Date = new Date(),
  daysAhead: number = 14
): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  // Calculate end date
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + daysAhead);

  // Generate dates
  const currentDate = new Date(start);
  while (currentDate < endDate) {
    // Only include weekdays (0 = Sunday, 6 = Saturday)
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      dates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Convert date to UTC+7 (Jakarta timezone)
 */
export function toJakartaTime(date: Date): Date {
  const utcDate = new Date(date.toUTCString());
  utcDate.setHours(utcDate.getHours() + 7);
  return utcDate;
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Parse time string (HH:mm) and determine if it's a morning appointment
 * Morning appointments are considered to be between 07:30 and 09:00
 */
export function isMorningAppointment(timeStr: string): boolean {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;

  // Between 07:30 (450 minutes) and 09:00 (540 minutes)
  return totalMinutes >= 450 && totalMinutes <= 540;
}

/**
 * Parse time string to minutes since midnight for sorting
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Compare two time strings
 */
export function compareTimeStrings(time1: string, time2: string): number {
  return timeToMinutes(time1) - timeToMinutes(time2);
}

/**
 * Get formatted time range string
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} \\- ${endTime}`;
}
