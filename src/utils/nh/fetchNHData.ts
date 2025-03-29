import type { NHAPIResponse } from "@/types/telegram";

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

  const data = await response.json();
  if (!isValidNHAPIResponse(data)) {
    throw new Error("Invalid data structure");
  }

  return data;
}

// Added GalleryData related interfaces and function
export interface GalleryImage {
  url: string;
  width: number;
  height: number;
  fileFormat: string;
}

export interface GalleryData {
  id: string;
  title: string;
  images: GalleryImage[];
  tags: string[];
  uploadDate: string;
  pages: number;
}

interface ApiPage {
  t: 'j' | 'p' | 'g' | 'w'; // Type: jpg, png, gif, webp
  w?: number;         // Width
  h?: number;         // Height
}

interface ApiTag {
  id: number;
  type: string;
  name: string;
  url: string;
  count: number;
}

export async function fetchGalleryData(galleryId: string): Promise<GalleryData | null> {
  if (!galleryId) return null;

  const targetUrl = `https://nhentai.net/api/gallery/${galleryId}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[fetchGalleryData] Failed to fetch ${targetUrl}: ${response.status}`);
      return null;
    }

    let data: any; // Use 'any' here to avoid TS errors before validation
    try {
      data = await response.json();
    } catch (e) {
      console.error(`[fetchGalleryData] Failed to parse JSON from ${targetUrl}:`, e);
      return null;
    }

    // Basic validation for required fields
    if (!data || typeof data !== 'object' || !data.media_id || !data.title || !data.images || !data.images.pages || !data.tags || typeof data.upload_date !== 'number' || typeof data.num_pages !== 'number') {
      console.error(`[fetchGalleryData] Invalid data structure from ${targetUrl}:`, data);
      return null;
    }

    const galleryData: GalleryData = {
      id: galleryId,
      title: data.title.pretty || data.title.english || "Unknown Title",
      images: data.images.pages.map((page: ApiPage, index: number) => {
        const extensionMap: { [key: string]: string } = {
          'j': 'jpg',
          'w': 'webp',
          'p': 'png',
          'g': 'gif'
        };
        const extension = extensionMap[page.t] || 'jpg';
        const pageNum = index + 1;

        return {
          url: `https://i1.nhentai.net/galleries/${data.media_id}/${pageNum}.${extension}`,
          width: page.w || 0,
          height: page.h || 0,
          fileFormat: extension
        };
      }),
      tags: data.tags.map((tag: ApiTag) => tag.name),
      uploadDate: new Date(data.upload_date * 1000).toISOString(),
      pages: data.num_pages
    };

    return galleryData;

  } catch (error) {
    console.error(`[fetchGalleryData] Error fetching gallery data for ${galleryId}:`, error);
    return null;
  }
}
