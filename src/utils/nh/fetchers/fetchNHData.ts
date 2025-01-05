import { fetcher } from "@/utils/fetcher";
import type { NHAPIResponse } from "@/types/telegram";

export interface FetchNHDataParams {
  galleryId: string;
}

function isValidNHAPIResponse(data: any): data is NHAPIResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.id === "number" &&
    typeof data.media_id === "string" &&
    typeof data.title === "object" &&
    data.title !== null &&
    typeof data.title.english === "string" &&
    typeof data.title.japanese === "string" &&
    typeof data.title.pretty === "string" &&
    typeof data.images === "object" &&
    data.images !== null &&
    Array.isArray(data.images.pages) &&
    typeof data.images.cover === "object" &&
    data.images.cover !== null &&
    typeof data.images.thumbnail === "object" &&
    data.images.thumbnail !== null &&
    typeof data.scanlator === "string" &&
    Array.isArray(data.tags) &&
    typeof data.num_pages === "number" &&
    typeof data.num_favorites === "number" &&
    typeof data.upload_date === "number"
  );
}

export async function fetchNHData(
  params: FetchNHDataParams,
  nhApiUrl: string
): Promise<NHAPIResponse> {
  const data = await fetcher<any>({
    method: "GET",
    url: `/get?id=${params.galleryId}`,
    baseUrl: nhApiUrl,
  });

  if (!isValidNHAPIResponse(data)) {
    throw new Error("Invalid data structure");
  }

  return data;
}
