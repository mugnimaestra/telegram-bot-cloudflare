import {
  RSCMApiResponse,
  RSCMConfig,
  RSCMError,
  RSCMErrorType,
  RSCMRequestPayload,
  ConsultationSchedule,
} from "../types";

import { formatDate, isMorningAppointment, toJakartaTime } from "../dateUtils";
import { loadConfig } from "../config";
import { logger } from "../logger";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Env {
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
}

/**
 * Fetch appointments for a specific date and service with retry mechanism
 */
export async function fetchAppointments(
  service: string,
  date: Date,
  env?: Env,
  config: RSCMConfig = loadConfig(env)
): Promise<ConsultationSchedule[]> {
  logger.debug("Fetching appointments", { service, date: formatDate(date) });

  // Validate service exists
  if (!config.services[service]) {
    throw new RSCMError(
      RSCMErrorType.INVALID_SERVICE,
      `Invalid service: ${service}`
    );
  }

  const payload: RSCMRequestPayload = {
    ...config.services[service],
    appointment_date: formatDate(date),
  };

  logger.debug("Request payload", { payload });
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(`Attempt ${attempt}/${MAX_RETRIES}`);
      const response = await fetch(config.api_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = new RSCMError(
          RSCMErrorType.API_ERROR,
          `API returned status ${response.status}`
        );
        logger.error("API error", {
          status: response.status,
          attempt,
          service,
          date: formatDate(date),
        });
        throw error;
      }

      const data: RSCMApiResponse = await response.json();
      logger.debug("API response", { data });

      if (data.status !== "200" || !data.data) {
        logger.info("No appointments found", {
          service,
          date: formatDate(date),
          status: data.status,
          message: data.pesan,
        });
        return [];
      }

      const schedules = data.data.map((schedule) => ({
        doctorName: schedule.actor[0]?.display || "Unknown Doctor",
        startTime: schedule.consultationDay.start,
        endTime: schedule.consultationDay.end,
        quota: parseInt(schedule.consultationDay.quota, 10),
        date: formatDate(date),
      }));

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

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        logger.debug(`Retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }
    }
  }

  if (lastError instanceof RSCMError) {
    throw lastError;
  }

  const error = new RSCMError(
    RSCMErrorType.NETWORK_ERROR,
    lastError?.message || "Network request failed after retries"
  );

  logger.error("All retry attempts failed", {
    service,
    date: formatDate(date),
    error: error.message,
  });

  throw error;
}

/**
 * Find the earliest morning appointment from a list of schedules
 */
export function findEarliestMorningAppointment(
  schedules: ConsultationSchedule[]
): ConsultationSchedule | undefined {
  return schedules
    .filter((schedule) => isMorningAppointment(schedule.startTime))
    .sort((a, b) => {
      // First sort by date
      const dateCompare =
        new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;

      // Then sort by start time
      const timeA = a.startTime.split(":").map(Number);
      const timeB = b.startTime.split(":").map(Number);
      const minutesA = timeA[0] * 60 + timeA[1];
      const minutesB = timeB[0] * 60 + timeB[1];
      return minutesA - minutesB;
    })[0];
}

/**
 * Check if service exists in config
 */
export function isValidService(
  service: string,
  env?: Env,
  config: RSCMConfig = loadConfig(env)
): boolean {
  return service in config.services;
}

/**
 * Get list of available services
 */
export function getAvailableServices(
  env?: Env,
  config: RSCMConfig = loadConfig(env)
): string[] {
  return Object.keys(config.services);
}
