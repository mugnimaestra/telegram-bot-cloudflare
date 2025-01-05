import type { Message, TelegramResponse } from "@/types/telegram";
import type { R2Bucket } from "@cloudflare/workers-types";
import { PDFStatus } from "@/types/telegram";
import { sendPlainText } from "@/utils/telegram/sendPlainText";
import { sendMarkdownV2Text } from "@/utils/telegram/sendMarkdownV2Text";
import { formatNHResponse } from "./formatNHResponse";
import { fetchNHData } from "./fetchNHData";
import { handlePDFDownload } from "@/utils/pdf/handlePDFDownload";
import { handleTelegraphFallback } from "@/utils/telegraph/handleTelegraphFallback";
import { getPDFStatusMessage } from "@/utils/pdf/getPDFStatusMessage";
import { getPDFKeyboard } from "@/utils/pdf/getPDFKeyboard";
import { apiUrl } from "@/utils/telegram/apiUrl";
import { extractNHId } from "./extractNHId";

export async function handleNHCommand(
  token: string,
  chatId: number,
  input: string,
  originalMessage: Message,
  bucket: R2Bucket,
  nhApiUrl: string
): Promise<TelegramResponse> {
  const bucketStatus = {
    isDefined: !!bucket,
    hasGetMethod: bucket && typeof bucket.get === "function",
  };
  console.log("[NH] Bucket status:", bucketStatus);

  let loadingMessage: TelegramResponse | null = null;
  try {
    // Send loading message with timeout handling
    loadingMessage = await Promise.race([
      sendPlainText(token, chatId, "🔍 Fetching data...", originalMessage),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Network error or timeout")), 10000)
      ),
    ]);

    const deleteLoadingMessage = async () => {
      if (!loadingMessage?.result?.message_id) return;

      try {
        await Promise.race([
          fetch(
            apiUrl(token, "deleteMessage", {
              chat_id: chatId,
              message_id: loadingMessage.result.message_id,
              ...(originalMessage.message_thread_id && {
                message_thread_id: originalMessage.message_thread_id,
              }),
            })
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Delete message timeout")), 5000)
          ),
        ]);
      } catch (error) {
        console.error("[NH] Failed to delete loading message:", error);
        // Try to update the message instead of deleting if deletion fails
        try {
          await fetch(
            apiUrl(token, "editMessageText", {
              chat_id: chatId,
              message_id: loadingMessage.result.message_id,
              text: "❌ Request failed or timed out. Please try again.",
              ...(originalMessage.message_thread_id && {
                message_thread_id: originalMessage.message_thread_id,
              }),
            })
          );
        } catch (editError) {
          console.error("[NH] Failed to edit loading message:", editError);
        }
      }
    };

    // Extract and validate ID
    const id = extractNHId(input);
    if (!id) {
      await deleteLoadingMessage();
      throw new Error("Invalid ID format");
    }

    // Fetch data with timeout
    console.log(`[NH] Starting fetch for ID: ${id}`);
    let data;
    try {
      data = await Promise.race([
        fetchNHData(nhApiUrl, id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Network error or timeout")), 15000)
        ),
      ]);
    } catch (error) {
      await deleteLoadingMessage();
      return {
        ok: false,
        description: "Network error or timeout",
      };
    }

    // Send metadata message with timeout
    const formattedResponse = await formatNHResponse(data);
    await Promise.race([
      sendMarkdownV2Text(token, chatId, formattedResponse, originalMessage),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Network error or timeout")), 10000)
      ),
    ]);

    // Delete loading message
    await deleteLoadingMessage();

    // Infer PDF status if undefined
    const inferredStatus = data.pdf_url
      ? PDFStatus.COMPLETED
      : PDFStatus.NOT_REQUESTED;

    const effectiveStatus = data.pdf_status || inferredStatus;

    // Debug PDF status
    console.log("[NH] PDF Status check:", {
      originalStatus: data.pdf_status,
      inferredStatus,
      effectiveStatus,
      hasPdfUrl: !!data.pdf_url,
      url: data.pdf_url,
    });

    // If bucket is not available or PDF URL is not available, use Telegraph
    if (!bucketStatus.hasGetMethod || !data.pdf_url) {
      console.log(
        "[NH] Using Telegraph fallback due to:",
        !bucketStatus.hasGetMethod
          ? "bucket not available"
          : "PDF URL not available"
      );
      try {
        return await handleTelegraphFallback(
          token,
          chatId,
          { ...data, pdf_status: effectiveStatus },
          originalMessage
        );
      } catch (error) {
        return {
          ok: true,
          description:
            "Failed to create Telegraph fallback, but request was processed",
        };
      }
    }

    // Send PDF status message with keyboard
    const statusMessage = getPDFStatusMessage(effectiveStatus);
    const keyboard = getPDFKeyboard(data.id, effectiveStatus, data.pdf_url);

    await sendMarkdownV2Text(
      token,
      chatId,
      `ℹ️ ${statusMessage}`,
      originalMessage,
      keyboard
    );

    // If PDF is completed, send it as attachment
    if (effectiveStatus === PDFStatus.COMPLETED && data.pdf_url) {
      try {
        return await handlePDFDownload(
          token,
          chatId,
          data,
          bucket,
          originalMessage
        );
      } catch (error) {
        console.log(
          "[NH] PDF download failed, falling back to Telegraph:",
          error
        );
        try {
          const fallbackResult = await handleTelegraphFallback(
            token,
            chatId,
            { ...data, pdf_status: PDFStatus.FAILED },
            originalMessage
          );
          return { ...fallbackResult, ok: true };
        } catch (telegraphError) {
          console.error("[NH] Telegraph fallback also failed:", telegraphError);
          return {
            ok: true,
            description:
              "PDF download and Telegraph fallback failed, but request was processed",
          };
        }
      }
    }

    // Return success response for other cases
    return { ok: true };
  } catch (error) {
    console.error("[NH] Error in handleNHCommand:", error);

    // Always try to clean up loading message in case of any error
    if (loadingMessage?.result?.message_id) {
      try {
        await fetch(
          apiUrl(token, "editMessageText", {
            chat_id: chatId,
            message_id: loadingMessage.result.message_id,
            text: `❌ Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }. Please try again.`,
            ...(originalMessage.message_thread_id && {
              message_thread_id: originalMessage.message_thread_id,
            }),
          })
        );
      } catch (editError) {
        console.error("[NH] Failed to edit error message:", editError);
      }
    }

    // For invalid input format, we want to show a user-friendly message
    if (error instanceof Error && error.message.includes("Invalid ID format")) {
      return {
        ok: false,
        description: "Invalid ID format. Please provide a valid numeric ID.",
      };
    }

    // Determine if it's a network error
    const isNetworkError =
      error instanceof Error &&
      (error.message.includes("timeout") ||
        error.message.includes("network") ||
        error.message.includes("502") ||
        error.message.includes("failed"));

    if (isNetworkError) {
      return {
        ok: false,
        description: "Network error or timeout. Please try again later.",
      };
    }

    // For other errors, return an error response
    return {
      ok: false,
      description: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
