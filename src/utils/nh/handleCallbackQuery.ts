import type { CallbackQuery } from "@/types/telegram";
import { PDFStatus } from "@/types/telegram";
import { getPDFStatusMessage } from "@/utils/pdf/getPDFStatusMessage";
import { getPDFKeyboard } from "@/utils/pdf/getPDFKeyboard";
import { fetchPDFStatus } from "./fetchers/fetchPDFStatus";
import { fetchNHData } from "./fetchers/fetchNHData";
import { answerCallbackQuery } from "../telegram/fetchers/answerCallbackQuery";
import { editMessageText } from "../telegram/fetchers/editMessageText";
import { sendDocument } from "../telegram/fetchers/sendDocument";

// Add status check cache at the top level
const STATUS_CHECK_LIMIT = 10; // Maximum number of status checks
export const STATUS_CHECK_CACHE = new Map<string, number>(); // Cache for status check counts

export async function handleCallbackQuery(
  token: string,
  query: CallbackQuery,
  nhApiUrl: string
): Promise<boolean> {
  if (!query.data) return false;

  const [action, galleryId] = query.data.split(":");
  if (!galleryId) return false;

  // Handle check_pdf_status action
  if (action === "check_pdf_status") {
    const cacheKey = `${query.message?.chat.id}:${galleryId}`;
    const currentCount = STATUS_CHECK_CACHE.get(cacheKey) || 0;

    if (currentCount >= STATUS_CHECK_LIMIT) {
      console.log("[NH] Status check limit reached for ID:", galleryId);
      await answerCallbackQuery(
        {
          callback_query_id: query.id,
          text: "Maximum status check limit reached. Please try the command again.",
          show_alert: true,
        },
        token
      );
      return false;
    }

    STATUS_CHECK_CACHE.set(cacheKey, currentCount + 1);

    try {
      console.log("[NH] Checking PDF status for ID:", galleryId);
      const data = await fetchPDFStatus({ galleryId }, nhApiUrl);

      console.log("[NH] PDF Status check response:", {
        data,
        messageInfo: {
          chatId: query.message?.chat.id,
          messageId: query.message?.message_id,
        },
        checkCount: currentCount + 1,
      });

      // If status is completed, update message and trigger PDF download
      if (data.pdf_status === PDFStatus.COMPLETED && data.pdf_url) {
        // First update the message to show completion without keyboard
        await editMessageText(
          {
            chat_id: query.message?.chat.id || 0,
            message_id: query.message?.message_id || 0,
            text: "ℹ️ PDF is ready\\! Sending the file\\.\\.\\.",
            parse_mode: "MarkdownV2",
          },
          token
        );

        // Then fetch the full gallery data to get title info
        const galleryData = await fetchNHData({ galleryId }, nhApiUrl);

        // Send the PDF
        const pdfResponse = await fetch(data.pdf_url);
        const pdfBlob = await pdfResponse.blob();

        const displayTitle =
          galleryData.title.english ||
          galleryData.title.pretty ||
          galleryData.title.japanese ||
          "N/A";
        const cleanTitle = displayTitle
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "_")
          .toLowerCase();
        const filename = `${cleanTitle}_${galleryId}.pdf`;

        await sendDocument(
          {
            chat_id: query.message?.chat.id.toString() || "",
            document: pdfBlob,
            filename,
            caption: `${displayTitle} (ID: ${galleryId})`,
            message_thread_id: query.message?.message_thread_id?.toString(),
          },
          token
        );

        // Update message to final state without keyboard
        await editMessageText(
          {
            chat_id: query.message?.chat.id || 0,
            message_id: query.message?.message_id || 0,
            text: "✅ PDF has been sent\\! To download again, please use the command again\\.",
            parse_mode: "MarkdownV2",
          },
          token
        );

        // Clear the status check counter since PDF is ready
        STATUS_CHECK_CACHE.delete(cacheKey);
        return true;
      } else {
        // For other statuses, check if the status has changed before updating the message
        const currentText = query.message?.text;
        const newStatusMessage = `ℹ️ ${getPDFStatusMessage(data.pdf_status)}`;

        // Only update the message if the status has changed
        if (currentText !== newStatusMessage) {
          const keyboard = getPDFKeyboard(parseInt(galleryId), data.pdf_status);
          await editMessageText(
            {
              chat_id: query.message?.chat.id || 0,
              message_id: query.message?.message_id || 0,
              text: newStatusMessage,
              parse_mode: "MarkdownV2",
              reply_markup: keyboard,
            },
            token
          );
        }

        // Always show the current status in notification
        await answerCallbackQuery(
          {
            callback_query_id: query.id,
            text: `Current status: ${data.pdf_status}. Check count: ${
              currentCount + 1
            }/${STATUS_CHECK_LIMIT}`,
            show_alert: true,
          },
          token
        );
      }

      // Answer callback query to remove loading state
      await answerCallbackQuery(
        {
          callback_query_id: query.id,
        },
        token
      );

      return true;
    } catch (error) {
      console.error("[NH] PDF Status check error:", error);
      await answerCallbackQuery(
        {
          callback_query_id: query.id,
          text: "Failed to check PDF status. Please try again.",
          show_alert: true,
        },
        token
      );
      return false;
    }
  }

  return false;
}
