export function apiUrl(
  token: string,
  method: string,
  params: Record<string, any> = {}
): string {
  const baseUrl = `https://api.telegram.org/bot${token}/${method}`;
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      queryParams.append(key, value.toString());
    }
  }

  const queryString = queryParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
