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

  const response = await fetch(`${baseUrl}${url}`, options);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
