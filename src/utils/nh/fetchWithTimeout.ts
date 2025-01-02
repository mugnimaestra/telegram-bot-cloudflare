export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  retries = 2
): Promise<Response> {
  const { timeout = 5000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.log(`[NH] Request timed out after ${timeout}ms, aborting...`);
  }, timeout);

  try {
    console.log(`[NH] Attempting fetch (${retries} retries left)`);
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[NH] Request aborted after ${timeout}ms`);
      if (retries > 0) {
        console.log(`[NH] Retrying... (${retries} retries left)`);
        const backoffTime = Math.min(1000 * retries, 2000);
        await new Promise((resolve) => setTimeout(resolve, backoffTime));

        const newTimeout = Math.min(timeout * 1.2, 8000);
        const newOptions = {
          ...options,
          timeout: newTimeout,
        };

        return fetchWithTimeout(url, newOptions, retries - 1);
      }
      throw new Error(`Request timed out after ${4 - retries} attempts`);
    }
    throw error;
  }
}
