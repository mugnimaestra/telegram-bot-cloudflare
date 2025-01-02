import type { Message, TelegramResponse } from "@/types/telegram";

export async function sendMarkdownV2Text(
  token: string,
  chatId: number,
  text: string,
  replyToMessage?: Message,
  replyMarkup?: any
): Promise<TelegramResponse> {
  const params: Record<string, any> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
  };

  if (replyToMessage?.message_thread_id) {
    params.message_thread_id = replyToMessage.message_thread_id;
  }

  if (replyMarkup) {
    params.reply_markup = JSON.stringify(replyMarkup);
    console.log("[NH] Sending message with keyboard:", {
      text,
      keyboard: JSON.stringify(replyMarkup, null, 2),
    });
  }

  // Use POST method instead of GET for messages with keyboards
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  console.log("[NH] Sending request to Telegram:", {
    url,
    method: "POST",
    params: JSON.stringify(params, null, 2),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const result = (await response.json()) as TelegramResponse;
  console.log("[NH] Telegram API response:", result);

  return result;
}
