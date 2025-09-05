/**
 * Retry utility for network calls with exponential backoff
 */

import { logger } from "@/utils/logger";

/**
 * Retry utility for network calls
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  timeoutMs: number = 10000,
): Promise<Response> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: abortController.signal,
      });
      clearTimeout(timeoutId);

      // If successful response, return it
      if (response.ok || response.status < 500) {
        return response;
      }

      // For server errors (5xx), retry
      if (response.status >= 500) {
        logger.warn(
          `Server error ${response.status}, retrying (${attempt}/${maxRetries})`,
        );
        throw new Error(`Server error: ${response.status}`);
      }

      // For client errors (4xx), don't retry
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        `Fetch attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
      );

      if (attempt < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s...
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt - 1) * 1000),
        );
      }
    }
  }

  throw lastError!;
}