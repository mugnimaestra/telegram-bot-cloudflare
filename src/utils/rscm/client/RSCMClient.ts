import {
  RSCMApiResponse,
  RSCMConfig,
  RSCMError,
  RSCMErrorType,
  RSCMRequestPayload,
  ConsultationSchedule,
} from "../types";
import { formatDate } from "../dateUtils";
import { logger } from "../logger";

interface Env {
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
}

/**
 * Client for interacting with RSCM API
 */
export class RSCMClient {
  private config: RSCMConfig;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config: RSCMConfig, maxRetries: number = 3, retryDelay: number = 1000) {
    this.config = config;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate that the service exists in configuration
   */
  private validateService(service: string): void {
    if (!this.config.services[service]) {
      throw RSCMError.validation(
        `Invalid service: ${service}`,
        { 
          service,
          availableServices: Object.keys(this.config.services) 
        }
      );
    }
  }

  /**
   * Build request payload for API call
   */
  private buildPayload(service: string, date: Date): RSCMRequestPayload {
    this.validateService(service);
    
    return {
      ...this.config.services[service],
      appointment_date: formatDate(date),
    };
  }

  /**
   * Make HTTP request to RSCM API
   */
  private async makeRequest(payload: RSCMRequestPayload): Promise<RSCMApiResponse> {
    const response = await fetch(this.config.api_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const statusText = response.statusText || 'Unknown error';
      throw new RSCMError(
        RSCMErrorType.API_ERROR,
        `API returned status ${response.status}: ${statusText}`,
        `HTTP_${response.status}`,
        { 
          status: response.status,
          statusText,
          url: this.config.api_url 
        }
      );
    }

    return await response.json();
  }

  /**
   * Parse API response into consultation schedules
   */
  private parseResponse(data: RSCMApiResponse, date: Date): ConsultationSchedule[] {
    if (data.status !== "200" || !data.data) {
      logger.info("No appointments found", {
        date: formatDate(date),
        status: data.status,
        message: data.pesan,
      });
      return [];
    }

    return data.data.map((schedule) => ({
      doctorName: schedule.actor[0]?.display || "Unknown Doctor",
      startTime: schedule.consultationDay.start,
      endTime: schedule.consultationDay.end,
      quota: parseInt(schedule.consultationDay.quota, 10),
      date: formatDate(date),
    }));
  }

  /**
   * Fetch appointments for a specific date and service with retry mechanism
   */
  async fetchAppointments(service: string, date: Date): Promise<ConsultationSchedule[]> {
    logger.debug("Fetching appointments", { service, date: formatDate(date) });

    const payload = this.buildPayload(service, date);
    logger.debug("Request payload", { payload });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${this.maxRetries}`);
        
        const data = await this.makeRequest(payload);
        logger.debug("API response", { data });

        const schedules = this.parseResponse(data, date);
        
        logger.info("Successfully fetched appointments", {
          service,
          date: formatDate(date),
          count: schedules.length,
        });

        return schedules;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Request failed`, {
          attempt,
          service,
          date: formatDate(date),
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * attempt;
          logger.debug(`Retrying in ${delay}ms`);
          await this.sleep(delay);
          continue;
        }
      }
    }

    // If we reach here, all retries failed
    if (lastError instanceof RSCMError) {
      throw lastError;
    }

    const error = new RSCMError(
      RSCMErrorType.NETWORK_ERROR,
      lastError?.message || "Network request failed after retries",
      "NETWORK_RETRY_FAILED",
      {
        service,
        date: formatDate(date),
        retryCount: this.maxRetries,
        lastError: lastError?.message,
      }
    );

    logger.error("All retry attempts failed", {
      service,
      date: formatDate(date),
      error: error.toJSON(),
    });

    throw error;
  }

  /**
   * Fetch appointments for multiple dates with optimized performance
   */
  async fetchAppointmentsBatch(
    service: string, 
    dates: Date[], 
    delayBetweenRequests: number = 1000
  ): Promise<ConsultationSchedule[]> {
    // Validate service early to fail fast for invalid services
    this.validateService(service);
    
    const startTime = Date.now();
    
    logger.info("Fetching appointments for date range", {
      service,
      dateCount: dates.length,
      dates: dates.map(d => formatDate(d)),
    });

    const allSchedules: ConsultationSchedule[] = [];
    const errors: Array<{ date: string; error: string }> = [];

    for (const date of dates) {
      try {
        const schedules = await this.fetchAppointments(service, date);
        allSchedules.push(...schedules);

        // Add delay between requests to avoid overwhelming the server
        if (delayBetweenRequests > 0 && process.env.NODE_ENV !== "test") {
          await this.sleep(delayBetweenRequests);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ date: formatDate(date), error: errorMessage });
        
        // Log the error but continue with other dates
        logger.warn("Failed to fetch appointments for date", {
          service,
          date: formatDate(date),
          error: errorMessage,
        });
        
        // If it's a validation error, throw immediately
        if (error instanceof RSCMError && error.type === RSCMErrorType.INVALID_SERVICE) {
          throw error;
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.performance("fetchAppointmentsBatch", duration, {
      service,
      totalSchedules: allSchedules.length,
      successfulDates: dates.length - errors.length,
      failedDates: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });

    return allSchedules;
  }

  /**
   * Check if service exists in configuration
   */
  isValidService(service: string): boolean {
    return service in this.config.services;
  }

  /**
   * Get list of available services
   */
  getAvailableServices(): string[] {
    return Object.keys(this.config.services);
  }

  /**
   * Update configuration
   */
  updateConfig(config: RSCMConfig): void {
    this.config = config;
  }
}