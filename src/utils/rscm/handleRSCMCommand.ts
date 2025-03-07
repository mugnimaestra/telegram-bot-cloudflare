import { TelegramContext } from "./types";
import { Message } from "../../types/telegram";
import {
  fetchAppointments,
  findEarliestMorningAppointment,
  isValidService,
  getAvailableServices,
} from "./fetchers/fetchAppointments";
import {
  formatRSCMResponse,
  formatRSCMError,
  formatRSCMHelp,
} from "./formatRSCMResponse";
import { generateDateRanges } from "./dateUtils";
import { AppointmentResult, RSCMError, ConsultationSchedule } from "./types";
import { logger } from "./logger";

interface Env {
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
  MAX_RETRIES?: string; // Maximum number of retries for failed requests
}

// Add retry tracking
let retryCount = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds between retries

/**
 * Process command arguments
 */
function parseCommand(text: string | undefined): string | null {
  logger.debug("Parsing command", { text });
  if (!text) return null;
  const parts = text.split(" ");
  if (parts.length < 2) return null;
  const result = parts.slice(1).join(" ");
  logger.debug("Parsed command", { service: result });
  return result;
}

/**
 * Fetch appointments for a specific date range
 */
async function fetchDateRangeAppointments(
  service: string,
  dates: Date[],
  env?: Env
): Promise<ConsultationSchedule[]> {
  logger.info("Fetching appointments for date range", {
    service,
    dateCount: dates.length,
    dates: dates.map((d) => d.toISOString()),
  });

  const allSchedules: ConsultationSchedule[] = [];
  const maxRetries = parseInt(env?.MAX_RETRIES || "") || MAX_RETRIES;

  for (const date of dates) {
    try {
      logger.debug("Fetching for date", {
        service,
        date: date.toISOString(),
      });

      const schedules = await fetchAppointments(service, date, env);
      logger.debug("Received schedules", {
        service,
        date: date.toISOString(),
        count: schedules.length,
        schedules,
      });

      allSchedules.push(...schedules);

      // Reset retry count on success
      retryCount = 0;

      // Small delay between requests to avoid overwhelming the server
      if (process.env.NODE_ENV !== "test") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      retryCount++;
      logger.warn(
        `Fetch attempt ${retryCount} failed for date ${date.toISOString()}`,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (retryCount >= maxRetries) {
        throw new Error(
          `Failed to fetch appointments after ${maxRetries} attempts`
        );
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }

  logger.info("Completed fetching all dates", {
    service,
    totalSchedules: allSchedules.length,
  });

  return allSchedules;
}

/**
 * Handle the /rscm command
 */
export async function handleRSCMCommand(
  ctx: TelegramContext,
  env?: Env
): Promise<void> {
  let processingMessage: Message | null = null;

  try {
    // Reset retry count at the start of each command
    retryCount = 0;

    // Parse service name from command
    const service = parseCommand(ctx.message.text);

    if (!service) {
      logger.info("No service specified, showing help");
      const availableServices = getAvailableServices(env);
      const helpMessage = formatRSCMHelp(availableServices);
      await ctx.reply(helpMessage, { parse_mode: "MarkdownV2" });
      return;
    }

    if (!isValidService(service, env)) {
      logger.warn("Invalid service specified", { service });
      const availableServices = getAvailableServices(env);
      const helpMessage = formatRSCMHelp(availableServices);
      await ctx.reply(`❌ Invalid service: "${service}"\n\n${helpMessage}`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    // Get next 2 weeks excluding weekends
    const dates = generateDateRanges();
    logger.debug("Generated date range", {
      service,
      dateCount: dates.length,
      dates: dates.map((d) => d.toISOString()),
    });

    try {
      // Show processing message
      logger.debug("Sending processing message");
      processingMessage = (await ctx.reply(
        "🔄 Checking appointments\\.\\.\\. Please wait\\.",
        { parse_mode: "MarkdownV2" }
      )) as Message;

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), 30000); // 30 second timeout
      });

      // Fetch appointments with timeout
      const schedules = (await Promise.race([
        fetchDateRangeAppointments(service, dates, env),
        timeoutPromise,
      ])) as ConsultationSchedule[];

      // Find earliest morning appointment
      const earliestMorning = findEarliestMorningAppointment(schedules);
      logger.debug("Found earliest morning appointment", {
        service,
        hasEarliestMorning: !!earliestMorning,
        earliestMorning,
      });

      // Prepare result
      const result: AppointmentResult = {
        schedules,
        earliestMorning,
        service,
        date: new Date().toISOString().split("T")[0],
      };

      // Format and send response
      const message = formatRSCMResponse(result);

      // Edit the processing message with results
      if (
        processingMessage &&
        typeof processingMessage === "object" &&
        "message_id" in processingMessage
      ) {
        logger.debug("Updating processing message with results");
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          message,
          { parse_mode: "MarkdownV2" }
        );
      } else {
        logger.debug("Sending new message with results");
        await ctx.reply(message, { parse_mode: "MarkdownV2" });
      }

      logger.info("Successfully completed appointment check", {
        service,
        schedulesFound: schedules.length,
        hasEarliestMorning: !!earliestMorning,
      });
    } catch (error) {
      // Send error message
      logger.error("Error checking appointments", {
        service,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorMessage =
        error instanceof Error
          ? formatRSCMError(error)
          : formatRSCMError(new Error("Unknown error occurred"));

      await ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
    }
  } catch (error) {
    // Handle any other errors
    logger.error("Unhandled error in command handler", {
      error: error instanceof Error ? error.message : String(error),
    });

    const errorMessage =
      error instanceof Error
        ? formatRSCMError(error)
        : formatRSCMError(new Error("Unknown error occurred"));

    await ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
  }
}
