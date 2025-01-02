import type {
  Message,
  NHAPIResponse,
  TelegramResponse,
} from "@/types/telegram";
import type { R2Bucket } from "@cloudflare/workers-types";
import { sendPlainText } from "../telegram/sendPlainText";
import { apiUrl } from "../telegram/apiUrl";

export async function handlePDFDownload(
  token: string,
  chatId: number,
  data: NHAPIResponse,
  bucket: R2Bucket,
  originalMessage: Message
): Promise<TelegramResponse> {
  if (!bucket || typeof bucket.get !== "function") {
    throw new Error("R2 Bucket is not properly configured");
  }

  console.log("[NH] PDF Download - Bucket status:", {
    isDefined: !!bucket,
    hasGetMethod: bucket && typeof bucket.get === "function",
  });

  const pdfLoadingMessage = await sendPlainText(
    token,
    chatId,
    "📥 Downloading PDF, please wait...",
    originalMessage
  );

  try {
    if (!data.pdf_url) {
      throw new Error("PDF URL is not available");
    }

    const r2Url = new URL(data.pdf_url);
    const key = r2Url.pathname.slice(1);

    const pdfObject = await bucket.get(key);
    if (!pdfObject) {
      throw new Error(`PDF not found in R2 storage`);
    }

    const pdfBlob = await pdfObject.blob();
    const formData = new FormData();

    const displayTitle =
      data.title.english || data.title.pretty || data.title.japanese || "N/A";

    const cleanTitle = displayTitle
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .toLowerCase();
    const filename = `${cleanTitle}_${data.id}.pdf`;

    formData.append("document", pdfBlob, filename);
    formData.append("chat_id", chatId.toString());
    formData.append("caption", `${displayTitle} (ID: ${data.id})`);

    if (originalMessage.message_thread_id) {
      formData.append(
        "message_thread_id",
        originalMessage.message_thread_id.toString()
      );
    }

    const documentResponse = await fetch(
      `https://api.telegram.org/bot${token}/sendDocument`,
      {
        method: "POST",
        body: formData,
      }
    );

    const documentResult = (await documentResponse.json()) as TelegramResponse;

    if (!documentResult.ok) {
      throw new Error("Failed to send PDF document");
    }

    // Clean up loading message
    await fetch(
      apiUrl(token, "deleteMessage", {
        chat_id: chatId,
        message_id: pdfLoadingMessage.result.message_id,
        ...(originalMessage.message_thread_id && {
          message_thread_id: originalMessage.message_thread_id,
        }),
      })
    );

    return documentResult;
  } catch (error) {
    console.error("[NH] PDF Error:", error);

    // Update loading message to error
    await fetch(
      apiUrl(token, "editMessageText", {
        chat_id: chatId,
        message_id: pdfLoadingMessage.result.message_id,
        text: `❌ Failed to download PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        ...(originalMessage.message_thread_id && {
          message_thread_id: originalMessage.message_thread_id,
        }),
      })
    );

    throw error;
  }
}
