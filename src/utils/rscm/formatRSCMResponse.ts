import { ConsultationSchedule, AppointmentResult } from './types';
import { escapeMarkdown } from '../telegram/escapeMarkdown';
import { formatTimeRange } from './dateUtils';

/**
 * Format a single consultation schedule into a markdown string
 */
function formatSchedule(schedule: ConsultationSchedule): string {
  const doctorName = escapeMarkdown(schedule.doctorName);
  const timeRange = formatTimeRange(schedule.startTime, schedule.endTime);
  
  return [
    `👨‍⚕️ *${doctorName}*`,
    `🕒 ${timeRange}`,
    `👥 Quota: ${schedule.quota}`,
    ''  // Empty line for spacing
  ].join('\n');
}

/**
 * Format the earliest morning appointment section
 */
function formatEarliestMorning(schedule: ConsultationSchedule): string {
  const date = escapeMarkdown(schedule.date);
  return [
    '⭐ *Earliest Morning Appointment:*',
    `📅 Date: ${date}`,
    formatSchedule(schedule)
  ].join('\n');
}

/**
 * Format appointment results into a markdown message for Telegram
 */
export function formatRSCMResponse(result: AppointmentResult): string {
  const { schedules, earliestMorning, service, date } = result;
  
  const parts = [
    '🏥 *RSCM Appointment Checker*',
    `Service: ${escapeMarkdown(service)}`,
    `Date: ${escapeMarkdown(date)}`,
    ''  // Empty line for spacing
  ];

  if (schedules.length === 0) {
    parts.push('❌ No appointments available for this date\\.');
    return parts.join('\n');
  }

  parts.push('📋 *Available Appointments:*');
  parts.push(schedules.map(formatSchedule).join('\n'));

  if (earliestMorning) {
    parts.push(formatEarliestMorning(earliestMorning));
  }

  return parts.join('\n');
}

/**
 * Format error message for display
 */
export function formatRSCMError(error: Error): string {
  const message = escapeMarkdown(error.message);
  return [
    '❌ *Error checking appointments*',
    `Message: ${message}`,
    '',
    '_Please try again later or contact support if the problem persists\\._'
  ].join('\n');
}

/**
 * Format help message showing available services
 */
export function formatRSCMHelp(services: string[]): string {
  const formattedServices = services
    .map(service => `• ${escapeMarkdown(service)}`)
    .join('\n');

  return [
    '🏥 *RSCM Appointment Checker Help*',
    '',
    'Available services:',
    formattedServices,
    '',
    'Usage:',
    '`/rscm <service_name>`'
  ].join('\n');
}