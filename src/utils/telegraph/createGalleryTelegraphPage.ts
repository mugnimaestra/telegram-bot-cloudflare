import type { GalleryData } from "@/utils/nh/fetchNHData";
import type { Node } from "@/types/telegraph";
import { createTelegraphPage } from "./createTelegraphPage";
import { getOrCreateTelegraphAccount } from "./getOrCreateTelegraphAccount";

export async function createGalleryTelegraphPage(
  galleryData: GalleryData
): Promise<string | null> {
  try {
    // Get or create Telegraph account
    const account = await getOrCreateTelegraphAccount();
    if (!account) {
      console.error("[Telegraph] Failed to get or create Telegraph account.");
      return null;
    }

    // Create Telegraph page content
    const content: Node[] = [
      {
        tag: "h4",
        children: [galleryData.title],
      },
    ];

    // Add images
    for (const image of galleryData.images) {
      content.push({
        tag: "figure",
        children: [
          {
            tag: "img",
            attrs: {
              src: image.url,
            },
          },
        ],
      });
    }

    // Create Telegraph page
    const page = await createTelegraphPage(
      account.access_token,
      galleryData.title,
      content
    );

    if (!page) {
        console.error("[Telegraph] Failed to create Telegraph page.");
        return null;
    }

    console.log("[Telegraph] Created Telegraph page for gallery:", galleryData.id);
    return page.url;

  } catch (error) {
    console.error("[Telegraph] Error creating gallery Telegraph page:", error);
    // Handle potential account issues like in handleTelegraphFallback if necessary
    // For now, just return null
    return null;
  }
}