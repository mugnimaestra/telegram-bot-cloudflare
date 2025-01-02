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

  const loadingMessage = await sendPlainText(
    token,
    chatId,
    "🔍 Fetching data...",
    originalMessage
  );

  const deleteLoadingMessage = async () => {
    try {
      await fetch(
        apiUrl(token, "deleteMessage", {
          chat_id: chatId,
          message_id: loadingMessage.result.message_id,
          ...(originalMessage.message_thread_id && {
            message_thread_id: originalMessage.message_thread_id,
          }),
        })
      );
    } catch (error) {
      console.error("[NH] Failed to delete loading message:", error);
    }
  };

  try {
    // Clean and validate input
    const id = input.includes("nhentai.net/g/")
      ? input.split("nhentai.net/g/")[1].replace(/\//g, "")
      : input.replace(/\/nh$/, ""); // Remove trailing /nh if present

    if (!id || !/^\d+$/.test(id)) {
      await deleteLoadingMessage();
      throw new Error("Invalid ID format. Please provide a valid numeric ID.");
    }

    console.log(`[NH] Starting fetch for ID: ${id}`);
    const data = await fetchNHData(nhApiUrl, id);

    // Send metadata message first (without status)
    const formattedResponse = await formatNHResponse(data);
    await sendMarkdownV2Text(token, chatId, formattedResponse, originalMessage);

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
      return await handleTelegraphFallback(
        token,
        chatId,
        { ...data, pdf_status: effectiveStatus },
        originalMessage
      );
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
        return await handleTelegraphFallback(
          token,
          chatId,
          { ...data, pdf_status: PDFStatus.FAILED },
          originalMessage
        );
      }
    }

    // Return success response for other cases
    return { ok: true };
  } catch (error) {
    console.error("[NH] Error:", error);
    await deleteLoadingMessage();

    return sendPlainText(
      token,
      chatId,
      `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      originalMessage
    );
  }
}
