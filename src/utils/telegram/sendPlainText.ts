import type { Message, TelegramResponse } from "@/types/telegram";
import { apiUrl } from "./apiUrl";

export async function sendPlainText(
  token: string,
  chatId: number,
  text: string,
  replyToMessage?: Message
): Promise<TelegramResponse> {
  const response = await fetch(
    apiUrl(token, "sendMessage", {
      chat_id: chatId,
      text,
      ...(replyToMessage?.message_thread_id && {
        message_thread_id: replyToMessage.message_thread_id,
      }),
    })
  );

  return response.json();
}
