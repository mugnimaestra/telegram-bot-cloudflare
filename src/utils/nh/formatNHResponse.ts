import type { NHAPIResponse } from "@/types/telegram";
import { TagType as TagTypeEnum } from "@/types/telegram";
import { escapeMarkdown } from "@/utils/telegram/escapeMarkdown";

export async function formatNHResponse(data: NHAPIResponse): Promise<string> {
  // Validate data structure
  if (!data || !data.tags || !Array.isArray(data.tags)) {
    console.error("[NH] Invalid data structure:", data);
    throw new Error("Invalid API response format");
  }

  const groupedTags = data.tags.reduce((acc, tag) => {
    if (!acc[tag.type]) {
      acc[tag.type] = [];
    }
    acc[tag.type].push(tag.name);
    return acc;
  }, {} as Record<TagTypeEnum, string[]>);

  // Safely access nested properties
  const title =
    data.title?.english || data.title?.pretty || data.title?.japanese || "N/A";
  const artists = groupedTags[TagTypeEnum.ARTIST]?.join(", ") || "N/A";
  const tags = groupedTags[TagTypeEnum.TAG]?.join(", ") || "N/A";
  const languages = groupedTags[TagTypeEnum.LANGUAGE]?.join(", ") || "N/A";
  const parody = groupedTags[TagTypeEnum.PARODY]?.join(", ") || "Original";
  const category = groupedTags[TagTypeEnum.CATEGORY]?.join(", ") || "N/A";

  return `📖 *Title*: ${escapeMarkdown(title)}

📊 *Info*:
• ID: ${data.id || "N/A"}
• Pages: ${data.num_pages || "N/A"}
• Favorites: ${data.num_favorites || "N/A"}
• Category: ${escapeMarkdown(category)}
• Parody: ${escapeMarkdown(parody)}
• Language: ${escapeMarkdown(languages)}
• Artist: ${escapeMarkdown(artists)}

🏷️ *Tags*: ${escapeMarkdown(tags)}

📅 Upload Date: ${
    data.upload_date
      ? new Date(data.upload_date * 1000).toLocaleDateString()
      : "N/A"
  }`;
}
