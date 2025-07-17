import { RSCMConfig } from "../types";

/**
 * Options for configuring the RSCM client
 */
export interface RSCMClientOptions {
  config: RSCMConfig;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Options for batch fetching appointments
 */
export interface BatchFetchOptions {
  service: string;
  dates: Date[];
  delayBetweenRequests?: number;
}

/**
 * Result of a batch fetch operation
 */
export interface BatchFetchResult {
  totalSchedules: number;
  successfulDates: number;
  failedDates: number;
  errors: Array<{
    date: string;
    error: string;
  }>;
}