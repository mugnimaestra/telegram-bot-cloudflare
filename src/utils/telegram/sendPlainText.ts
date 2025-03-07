import type { Message, TelegramResponse } from "@/types/telegram";
import { apiUrl } from "./apiUrl";

export async function sendPlainText(
  token: string,
  chatId: number,
  text: string,
  replyToMessage?: Message
): Promise<TelegramResponse> {
  try {
    const url = apiUrl(token, "sendMessage", {
      chat_id: chatId,
      text,
      ...(replyToMessage?.message_thread_id && {
        message_thread_id: replyToMessage.message_thread_id,
      }),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyToMessage?.message_thread_id && {
          message_thread_id: replyToMessage.message_thread_id,
        }),
      }),
    });
    const data = (await response.json()) as TelegramResponse;
    return data;
  } catch (error) {
    console.error("[Bot] Error sending plain text:", error);
    if (
      error instanceof Error &&
      (error.message === "Network error" ||
        error.message.includes("Network error"))
    ) {
      const networkError = new Error("Network error");
      networkError.name = "NetworkError";
      throw networkError;
    }
    const networkError = new Error("Network error");
    networkError.name = "NetworkError";
    throw networkError;
  }
}
