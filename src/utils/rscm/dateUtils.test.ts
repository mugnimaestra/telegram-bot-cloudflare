import { describe, it, expect } from 'vitest';
import {
  generateDateRanges,
  toJakartaTime,
  formatDate,
  isMorningAppointment,
  timeToMinutes,
  compareTimeStrings,
  formatTimeRange
} from './dateUtils';

describe('dateUtils', () => {
  describe('generateDateRanges', () => {
    it('should generate weekday dates for next 2 weeks', () => {
      // Use a known Monday as reference
      const startDate = new Date('2025-03-03'); // Monday
      const dates = generateDateRanges(startDate);

      // Should have 10 dates (2 weeks of weekdays)
      expect(dates).toHaveLength(10);

      // Should not include weekends
      dates.forEach(date => {
        const day = date.getDay();
        expect(day).not.toBe(0); // Sunday
        expect(day).not.toBe(6); // Saturday
      });

      // Should be consecutive weekdays
      for (let i = 1; i < dates.length; i++) {
        const dayDiff = (dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
        // If Friday to Monday, diff should be 3 days
        // Otherwise should be 1 day
        expect(dayDiff === 1 || dayDiff === 3).toBe(true);
      }
    });
  });

  describe('toJakartaTime', () => {
    it('should convert to UTC+7', () => {
      const date = new Date('2025-03-03T00:00:00Z'); // UTC
      const jakartaTime = toJakartaTime(date);
      expect(jakartaTime.getUTCHours()).toBe(7);
    });
  });

  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2025-03-03T12:00:00Z');
      expect(formatDate(date)).toBe('2025-03-03');
    });
  });

  describe('isMorningAppointment', () => {
    it('should identify morning appointments correctly', () => {
      expect(isMorningAppointment('07:30')).toBe(true);
      expect(isMorningAppointment('08:00')).toBe(true);
      expect(isMorningAppointment('09:00')).toBe(true);
      expect(isMorningAppointment('07:29')).toBe(false);
      expect(isMorningAppointment('09:01')).toBe(false);
      expect(isMorningAppointment('13:00')).toBe(false);
    });
  });

  describe('timeToMinutes', () => {
    it('should convert time string to minutes', () => {
      expect(timeToMinutes('07:30')).toBe(450);
      expect(timeToMinutes('08:00')).toBe(480);
      expect(timeToMinutes('13:45')).toBe(825);
    });
  });

  describe('compareTimeStrings', () => {
    it('should compare time strings correctly', () => {
      expect(compareTimeStrings('07:30', '08:00')).toBeLessThan(0);
      expect(compareTimeStrings('08:00', '08:00')).toBe(0);
      expect(compareTimeStrings('13:00', '08:00')).toBeGreaterThan(0);
    });
  });

  describe('formatTimeRange', () => {
    it('should format time range with escape characters', () => {
      expect(formatTimeRange('08:00', '12:00')).toBe('08:00 \\- 12:00');
    });
  });
});