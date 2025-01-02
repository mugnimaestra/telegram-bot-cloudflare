import type { NHAPIResponse } from "@/types/telegram";

export async function fetchNHData(
  nhApiUrl: string,
  id: string
): Promise<NHAPIResponse> {
  console.log("[NH] Fetching data for ID:", id);
  const response = await fetch(`${nhApiUrl}/get?id=${id}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status: ${response.status}`);
  }

  const data = (await response.json()) as NHAPIResponse;
  return data;
}
