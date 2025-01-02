import type { CallbackQuery, NHAPIResponse } from "@/types/telegram";
import { PDFStatus } from "@/types/telegram";
import { getPDFStatusMessage } from "@/utils/pdf/getPDFStatusMessage";
import { getPDFKeyboard } from "@/utils/pdf/getPDFKeyboard";

// Add status check cache at the top level
const STATUS_CHECK_LIMIT = 10; // Maximum number of status checks
const STATUS_CHECK_CACHE = new Map<string, number>(); // Cache for status check counts

export async function handleCallbackQuery(
  token: string,
  query: CallbackQuery,
  nhApiUrl: string
): Promise<void> {
  if (!query.data) return;

  const [action, galleryId] = query.data.split(":");
  if (!galleryId) return;

  if (action === "get_pdf") {
    try {
      console.log("[NH] Processing PDF download request for ID:", galleryId);
      // Fetch the gallery data to get PDF URL and title info
      const galleryResponse = await fetch(`${nhApiUrl}/get?id=${galleryId}`);
      if (!galleryResponse.ok) {
        throw new Error("Failed to fetch gallery data");
      }
      const galleryData = (await galleryResponse.json()) as NHAPIResponse;

      if (!galleryData.pdf_url) {
        throw new Error("PDF URL is not available");
      }

      // Send the PDF
      const formData = new FormData();
      const pdfResponse = await fetch(galleryData.pdf_url);
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

      formData.append("document", pdfBlob, filename);
      formData.append("chat_id", query.message?.chat.id.toString() || "");
      formData.append("caption", `${displayTitle} (ID: ${galleryId})`);

      if (query.message?.message_thread_id) {
        formData.append(
          "message_thread_id",
          query.message.message_thread_id.toString()
        );
      }

      await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: "POST",
        body: formData,
      });

      // Answer callback query
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: query.id,
          text: "PDF sent!",
        }),
      });
      return;
    } catch (error) {
      console.error("[NH] PDF Send error:", error);
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: query.id,
          text: "Failed to send PDF. Please try again.",
          show_alert: true,
        }),
      });
      return;
    }
  }

  // Handle check_pdf_status action
  if (action === "check_pdf_status") {
    const cacheKey = `${query.message?.chat.id}:${galleryId}`;
    const currentCount = STATUS_CHECK_CACHE.get(cacheKey) || 0;

    if (currentCount >= STATUS_CHECK_LIMIT) {
      console.log("[NH] Status check limit reached for ID:", galleryId);
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: query.id,
          text: "Maximum status check limit reached. Please try the command again.",
          show_alert: true,
        }),
      });
      return;
    }

    STATUS_CHECK_CACHE.set(cacheKey, currentCount + 1);

    try {
      console.log("[NH] Checking PDF status for ID:", galleryId);
      // Check PDF status
      const response = await fetch(`${nhApiUrl}/pdf-status/${galleryId}`);
      if (!response.ok) {
        throw new Error(`Failed to check PDF status: ${response.status}`);
      }

      const data = (await response.json()) as {
        status: boolean;
        pdf_status: PDFStatus;
        pdf_url?: string;
      };

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
        // First update the message to show completion
        const editResponse = await fetch(
          `https://api.telegram.org/bot${token}/editMessageText`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: query.message?.chat.id,
              message_id: query.message?.message_id,
              text: "ℹ️ PDF is ready\\! Sending the file\\.\\.\\.",
              parse_mode: "MarkdownV2",
            }),
          }
        );

        // Then fetch the full gallery data to get title info
        const galleryResponse = await fetch(`${nhApiUrl}/get?id=${galleryId}`);
        if (!galleryResponse.ok) {
          throw new Error("Failed to fetch gallery data");
        }
        const galleryData = (await galleryResponse.json()) as NHAPIResponse;

        // Send the PDF
        const formData = new FormData();
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

        formData.append("document", pdfBlob, filename);
        formData.append("chat_id", query.message?.chat.id.toString() || "");
        formData.append("caption", `${displayTitle} (ID: ${galleryId})`);

        if (query.message?.message_thread_id) {
          formData.append(
            "message_thread_id",
            query.message.message_thread_id.toString()
          );
        }

        await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
          method: "POST",
          body: formData,
        });

        // Clear the status check counter since PDF is ready
        STATUS_CHECK_CACHE.delete(cacheKey);
      } else {
        // For other statuses, check if the status has changed before updating the message
        const currentText = query.message?.text;
        const newStatusMessage = `ℹ️ ${getPDFStatusMessage(data.pdf_status)}`;

        // Only update the message if the status has changed
        if (currentText !== newStatusMessage) {
          const keyboard = getPDFKeyboard(parseInt(galleryId), data.pdf_status);
          const editResponse = await fetch(
            `https://api.telegram.org/bot${token}/editMessageText`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: query.message?.chat.id,
                message_id: query.message?.message_id,
                text: newStatusMessage,
                parse_mode: "MarkdownV2",
                reply_markup: keyboard,
              }),
            }
          );
        }

        // Always show the current status in notification
        await fetch(
          `https://api.telegram.org/bot${token}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: query.id,
              text: `Current status: ${data.pdf_status}. Check count: ${
                currentCount + 1
              }/${STATUS_CHECK_LIMIT}`,
              show_alert: true,
            }),
          }
        );
        return;
      }

      // Answer callback query to remove loading state
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: query.id,
        }),
      });
    } catch (error) {
      console.error("[NH] PDF Status check error:", error);
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: query.id,
          text: "Failed to check PDF status. Please try again.",
          show_alert: true,
        }),
      });
    }
  }
}
