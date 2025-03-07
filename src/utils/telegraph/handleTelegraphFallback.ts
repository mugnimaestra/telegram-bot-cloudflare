import type {
  Message,
  NHAPIResponse,
  TelegramResponse,
} from "@/types/telegram";
import type { Node, TelegraphAccount } from "@/types/telegraph";
import { PDFStatus } from "@/types/telegram";
import { sendMarkdownV2Text } from "@/utils/telegram/sendMarkdownV2Text";
import { escapeMarkdown } from "@/utils/telegram/escapeMarkdown";
import { createTelegraphPage } from "./createTelegraphPage";
import { getPDFStatusMessage } from "@/utils/pdf/getPDFStatusMessage";
import { getPDFKeyboard } from "@/utils/pdf/getPDFKeyboard";
import { getOrCreateTelegraphAccount } from "./getOrCreateTelegraphAccount";

// Add Telegraph account and page cache at the top level
let telegraphAccountCache: TelegraphAccount | null = null;
const telegraphPageCache: Map<number, string> = new Map();

export async function handleTelegraphFallback(
  token: string,
  chatId: number,
  data: NHAPIResponse,
  originalMessage: Message
): Promise<TelegramResponse> {
  try {
    // First send the status message with keyboard
    const statusMessage = getPDFStatusMessage(data.pdf_status);
    const keyboard = getPDFKeyboard(
      data.id,
      data.pdf_status || PDFStatus.NOT_REQUESTED
    );

    await sendMarkdownV2Text(
      token,
      chatId,
      `ℹ️ ${statusMessage}`,
      originalMessage,
      keyboard
    );

    // Check if we have a cached page URL for this content
    const cachedUrl = telegraphPageCache.get(data.id);
    if (cachedUrl) {
      console.log(
        "[Telegraph] Using cached Telegraph page URL for ID:",
        data.id
      );
      return sendMarkdownV2Text(
        token,
        chatId,
        `📖 *Read here*: ${escapeMarkdown(cachedUrl)}`,
        originalMessage
      );
    }

    // Use cached or create new Telegraph account
    const account = await getOrCreateTelegraphAccount();

    // Create Telegraph page content
    const content: Node[] = [
      {
        tag: "h4",
        children: [
          data.title.english || data.title.pretty || data.title.japanese,
        ],
      },
    ];

    // Add images
    for (const page of data.images.pages) {
      content.push({
        tag: "figure",
        children: [
          {
            tag: "img",
            attrs: {
              src: page.url || "",
            },
          },
        ],
      });
    }

    // Create Telegraph page
    const page = await createTelegraphPage(
      account.access_token,
      data.title.english || data.title.pretty || "Untitled",
      content
    );

    // Cache the page URL
    telegraphPageCache.set(data.id, page.url);
    console.log("[Telegraph] Cached Telegraph page URL for ID:", data.id);

    return sendMarkdownV2Text(
      token,
      chatId,
      `📖 *Read here*: ${escapeMarkdown(page.url)}`,
      originalMessage
    );
  } catch (error) {
    console.error("[Telegraph] Telegraph error:", error);
    if (error instanceof Error && error.message.includes("UNAUTHORIZED")) {
      telegraphAccountCache = null;
      telegraphPageCache.clear();
    }
    return sendMarkdownV2Text(
      token,
      chatId,
      `❌ Error: Failed to create Telegraph page`,
      originalMessage
    );
  }
}
