import { TelegramContext } from "../types";
import { Message } from "../../../types/telegram";
import { RSCMClient } from "../client/RSCMClient";
import { AppointmentScheduler } from "../scheduler/AppointmentScheduler";
import { ResponseHandler } from "./ResponseHandler";
import { loadConfig } from "../config";
import { logger } from "../logger";
import { 
  RSCMError, 
  RSCMErrorType, 
  AppointmentResult, 
  ConsultationSchedule 
} from "../types";

interface Env {
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
  MAX_RETRIES?: string;
}

/**
 * Handles RSCM command processing with improved architecture
 */
export class CommandHandler {
  private client: RSCMClient;
  private scheduler: AppointmentScheduler;
  private responseHandler: ResponseHandler;
  private env?: Env;

  constructor(env?: Env) {
    this.env = env;
    const config = loadConfig(env);
    
    // Initialize components
    this.client = new RSCMClient(config);
    this.scheduler = new AppointmentScheduler();
    this.responseHandler = new ResponseHandler();
  }

  /**
   * Parse command text to extract service name
   */
  private parseCommand(text: string | undefined): string | null {
    logger.debug("Parsing command", { text });
    
    if (!text) return null;
    
    const parts = text.split(" ");
    if (parts.length < 2) return null;
    
    const result = parts.slice(1).join(" ");
    logger.debug("Parsed command", { service: result });
    
    return result;
  }

  /**
   * Handle timeout for long-running operations
   */
  private createTimeoutPromise(timeoutMs: number = 30000): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(RSCMError.timeout(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    });
  }

  /**
   * Process appointment fetching with progress updates and performance tracking
   */
  private async processAppointmentFetch(
    ctx: TelegramContext,
    service: string,
    processingMessage: Message | null
  ): Promise<AppointmentResult> {
    const startTime = Date.now();
    
    try {
      // Generate date ranges for next 2 weeks
      const dateGenStart = Date.now();
      const dates = this.scheduler.generateDateRanges();
      logger.performance("generateDateRanges", Date.now() - dateGenStart, {
        service,
        dateCount: dates.length,
      });
      
      logger.debug("Generated date range", {
        service,
        dateCount: dates.length,
        dates: dates.map(d => d.toISOString().split('T')[0]),
      });

      // Fetch appointments with timeout
      const fetchStart = Date.now();
      const schedulesPromise = this.client.fetchAppointmentsBatch(service, dates);
      const timeoutPromise = this.createTimeoutPromise();

      const schedules = await Promise.race([
        schedulesPromise,
        timeoutPromise,
      ]) as ConsultationSchedule[];

      logger.performance("fetchAppointments", Date.now() - fetchStart, {
        service,
        schedulesCount: schedules.length,
      });

      // Find earliest morning appointment
      const morningStart = Date.now();
      const earliestMorning = this.scheduler.findEarliestMorningAppointment(schedules);
      logger.performance("findEarliestMorning", Date.now() - morningStart, {
        service,
        hasEarliestMorning: !!earliestMorning,
      });
      
      logger.debug("Found earliest morning appointment", {
        service,
        hasEarliestMorning: !!earliestMorning,
        earliestMorning,
      });

      const result = {
        schedules,
        earliestMorning,
        service,
        date: new Date().toISOString().split("T")[0],
      };

      logger.performance("processAppointmentFetch", Date.now() - startTime, {
        service,
        totalSchedules: schedules.length,
        hasEarliestMorning: !!earliestMorning,
      });

      return result;

    } catch (error) {
      if (error instanceof RSCMError) {
        logger.logError(error, "Error processing appointment fetch");
      } else {
        logger.error("Error processing appointment fetch", {
          service,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  /**
   * Send or update processing message
   */
  private async sendProcessingMessage(ctx: TelegramContext): Promise<Message | null> {
    try {
      logger.debug("Sending processing message");
      const message = await ctx.reply(
        "🔄 Checking appointments\\.\\.\\. Please wait\\.",
        { parse_mode: "MarkdownV2" }
      );
      return message as Message;
    } catch (error) {
      logger.warn("Failed to send processing message", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update processing message with results
   */
  private async updateProcessingMessage(
    ctx: TelegramContext,
    processingMessage: Message | null,
    message: string
  ): Promise<void> {
    if (
      processingMessage &&
      typeof processingMessage === "object" &&
      "message_id" in processingMessage
    ) {
      try {
        logger.debug("Updating processing message with results");
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          message,
          { parse_mode: "MarkdownV2" }
        );
      } catch (error) {
        logger.warn("Failed to update processing message", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall back to sending new message
        await ctx.reply(message, { parse_mode: "MarkdownV2" });
      }
    } else {
      logger.debug("Sending new message with results");
      await ctx.reply(message, { parse_mode: "MarkdownV2" });
    }
  }

  /**
   * Handle the /rscm command
   */
  async handleCommand(ctx: TelegramContext): Promise<void> {
    let processingMessage: Message | null = null;

    try {
      // Parse service name from command
      const service = this.parseCommand(ctx.message.text);

      if (!service) {
        logger.info("No service specified, showing help");
        const helpMessage = this.responseHandler.formatHelpMessage(
          this.client.getAvailableServices()
        );
        await ctx.reply(helpMessage, { parse_mode: "MarkdownV2" });
        return;
      }

      if (!this.client.isValidService(service)) {
        logger.warn("Invalid service specified", { service });
        const helpMessage = this.responseHandler.formatHelpMessage(
          this.client.getAvailableServices()
        );
        await ctx.reply(
          `❌ Invalid service: "${service}"\n\n${helpMessage}`,
          { parse_mode: "MarkdownV2" }
        );
        return;
      }

      // Show processing message
      processingMessage = await this.sendProcessingMessage(ctx);

      // Process appointment fetching
      const result = await this.processAppointmentFetch(ctx, service, processingMessage);

      // Format response
      const responseMessage = this.responseHandler.formatSuccessResponse(result);

      // Update processing message with results
      await this.updateProcessingMessage(ctx, processingMessage, responseMessage);

      logger.info("Successfully completed appointment check", {
        service,
        schedulesFound: result.schedules.length,
        hasEarliestMorning: !!result.earliestMorning,
      });

    } catch (error) {
      if (error instanceof RSCMError) {
        logger.logError(error, "Error in command handler");
      } else {
        logger.error("Error in command handler", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const errorMessage = this.responseHandler.formatErrorResponse(
        error instanceof Error ? error : new Error("Unknown error occurred")
      );

      try {
        if (processingMessage) {
          await this.updateProcessingMessage(ctx, processingMessage, errorMessage);
        } else {
          await ctx.reply(errorMessage, { parse_mode: "MarkdownV2" });
        }
      } catch (replyError) {
        logger.error("Failed to send error message", {
          error: replyError instanceof Error ? replyError.message : String(replyError),
        });
      }
    }
  }

  /**
   * Update configuration and reinitialize components
   */
  updateConfig(env?: Env): void {
    this.env = env;
    const config = loadConfig(env);
    this.client.updateConfig(config);
    logger.debug("Command handler configuration updated");
  }

  /**
   * Get available services
   */
  getAvailableServices(): string[] {
    return this.client.getAvailableServices();
  }

  /**
   * Check if service is valid
   */
  isValidService(service: string): boolean {
    return this.client.isValidService(service);
  }
}