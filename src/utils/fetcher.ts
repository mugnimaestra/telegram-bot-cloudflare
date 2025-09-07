import { logger } from "./logger";

interface FetcherOptions {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  body?: Record<string, any>;
  headers?: Record<string, string>;
  baseUrl?: string;
}

export async function fetcher<T>({
  method,
  url,
  body,
  headers = {},
  baseUrl = "",
}: FetcherOptions): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  logger.debug("fetcher called with", {
    url: `${baseUrl}${url}`,
    method,
    headers: options.headers,
    body: options.body,
  });

  const response = await fetch(`${baseUrl}${url}`, options);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Job not found");
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
