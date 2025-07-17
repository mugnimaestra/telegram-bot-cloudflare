import { AppointmentResult, ConsultationSchedule, RSCMError } from "../types";
import { formatTimeRange } from "../dateUtils";
import { logger } from "../logger";

/**
 * Handles response formatting for RSCM commands
 */
export class ResponseHandler {
  /**
   * Format successful appointment check response
   */
  formatSuccessResponse(result: AppointmentResult): string {
    logger.debug("Formatting success response", {
      service: result.service,
      schedulesCount: result.schedules.length,
      hasEarliestMorning: !!result.earliestMorning,
    });

    if (result.schedules.length === 0) {
      return this.formatNoAppointmentsMessage(result.service);
    }

    if (result.earliestMorning) {
      return this.formatEarliestMorningMessage(result.earliestMorning, result.service);
    }

    return this.formatGeneralAppointmentsMessage(result.schedules, result.service);
  }

  /**
   * Format error response
   */
  formatErrorResponse(error: Error): string {
    logger.debug("Formatting error response", {
      errorType: error.constructor.name,
      message: error.message,
    });

    if (error instanceof RSCMError) {
      return this.formatRSCMErrorMessage(error);
    }

    return this.formatGeneralErrorMessage(error);
  }

  /**
   * Format help message
   */
  formatHelpMessage(availableServices: string[]): string {
    logger.debug("Formatting help message", {
      servicesCount: availableServices.length,
    });

    const servicesText = availableServices
      .map(service => `• ${this.escapeMarkdown(service)}`)
      .join('\n');

    return `ℹ️ *RSCM Appointment Checker*

*Usage:* \\\`/rscm <service_name>\\\`

*Available services:*
${servicesText}

*Example:* \\\`/rscm URJT Geriatri\\\`

The bot will check for appointments in the next 2 weeks \\(weekdays only\\)`;
  }

  /**
   * Format message when no appointments are found
   */
  private formatNoAppointmentsMessage(service: string): string {
    return `❌ *No appointments available*

*Service:* ${this.escapeMarkdown(service)}
*Period:* Next 2 weeks \\(weekdays only\\)

Please try again later or check a different service\\.`;
  }

  /**
   * Format message for earliest morning appointment
   */
  private formatEarliestMorningMessage(
    appointment: ConsultationSchedule,
    service: string
  ): string {
    const timeRange = formatTimeRange(appointment.startTime, appointment.endTime);
    
    return `🌅 *Earliest morning appointment found\\!*

*Service:* ${this.escapeMarkdown(service)}
*Date:* ${this.escapeMarkdown(appointment.date)}
*Time:* ${timeRange}
*Doctor:* ${this.escapeMarkdown(appointment.doctorName)}
*Quota:* ${appointment.quota}

⏰ *Morning appointments are prioritized \\(07:30\\-09:00\\)*`;
  }

  /**
   * Format message for general appointments (no morning slots)
   */
  private formatGeneralAppointmentsMessage(
    schedules: ConsultationSchedule[],
    service: string
  ): string {
    const groupedByDate = this.groupSchedulesByDate(schedules);
    const dateEntries = Array.from(groupedByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 5); // Show first 5 dates

    let message = `📅 *Appointments available*

*Service:* ${this.escapeMarkdown(service)}

`;

    for (const [date, daySchedules] of dateEntries) {
      message += `*${this.escapeMarkdown(date)}*\n`;
      
      for (const schedule of daySchedules.slice(0, 3)) { // Show first 3 appointments per date
        const timeRange = formatTimeRange(schedule.startTime, schedule.endTime);
        message += `• ${timeRange} \\- ${this.escapeMarkdown(schedule.doctorName)} \\(${schedule.quota}\\)\n`;
      }
      
      if (daySchedules.length > 3) {
        message += `• \\.\\.\\. and ${daySchedules.length - 3} more\n`;
      }
      
      message += '\n';
    }

    if (groupedByDate.size > 5) {
      message += `_\\.\\.\\. and ${groupedByDate.size - 5} more dates available_\n\n`;
    }

    message += `ℹ️ *No morning appointments \\(07:30\\-09:00\\) available*`;

    return message;
  }

  /**
   * Format RSCM specific error message
   */
  private formatRSCMErrorMessage(error: RSCMError): string {
    let icon = "❌";
    let title = "Error";

    switch (error.type) {
      case "INVALID_SERVICE":
        icon = "⚠️";
        title = "Invalid Service";
        break;
      case "API_ERROR":
        icon = "🚫";
        title = "API Error";
        break;
      case "NETWORK_ERROR":
        icon = "🌐";
        title = "Network Error";
        break;
      case "INVALID_RESPONSE":
        icon = "📋";
        title = "Invalid Response";
        break;
    }

    return `${icon} *${title}*

${this.escapeMarkdown(error.message)}

Please try again later or contact support if the issue persists\\.`;
  }

  /**
   * Format general error message
   */
  private formatGeneralErrorMessage(error: Error): string {
    return `❌ *An error occurred*

${this.escapeMarkdown(error.message)}

Please try again later\\.`;
  }

  /**
   * Group schedules by date
   */
  private groupSchedulesByDate(schedules: ConsultationSchedule[]): Map<string, ConsultationSchedule[]> {
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
      dateSchedules.sort((a, b) => {
        const timeA = a.startTime.split(":").map(Number);
        const timeB = b.startTime.split(":").map(Number);
        const minutesA = timeA[0] * 60 + timeA[1];
        const minutesB = timeB[0] * 60 + timeB[1];
        return minutesA - minutesB;
      });
    }

    return grouped;
  }

  /**
   * Escape markdown special characters
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}