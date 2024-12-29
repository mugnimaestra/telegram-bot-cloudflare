import { Hono } from "hono";
import type { Context } from "hono";
import type { Update, Message, TelegramResponse } from "@/types/telegram";
import type { Env } from "@/types/env";

const WEBHOOK = "/endpoint";

type Variables = {
  baseUrl: string;
};

const app = new Hono<{
  Bindings: Env["Bindings"];
  Variables: Variables;
}>();

// Store the base URL in context
app.use("*", async (c, next) => {
  c.set("baseUrl", `https://${c.req.header("host")}`);
  await next();
});

// Bot webhook handler
app.post(WEBHOOK, async (c) => {
  console.log("[Webhook] Received update");

  if (
    c.req.header("X-Telegram-Bot-Api-Secret-Token") !== c.env.ENV_BOT_SECRET
  ) {
    console.error("[Webhook] Unauthorized request");
    return c.json({ error: "Unauthorized" }, 403);
  }

  const update: Update = await c.req.json();
  if ("message" in update && update.message) {
    console.log(
      `[Webhook] Processing command: ${update.message.text?.split(" ")[0]}`
    );
    const messagePromise = onMessage(
      c.env.ENV_BOT_TOKEN,
      update.message,
      c.get("baseUrl")
    );
    c.executionCtx.waitUntil(
      messagePromise.then(
        () => {
          console.log("[Webhook] Message processed successfully");
        },
        (error) => {
          console.error("[Webhook] Message processing failed:", error.message);
        }
      )
    );
  }

  return c.text("Ok");
});

// Register webhook
app.get(
  "/registerWebhook",
  async (c: Context<{ Bindings: Env["Bindings"] }>) => {
    const host = c.req.header("host") || "";
    const webhookUrl = `https://${host}${WEBHOOK}`;

    console.log(
      "[Register Webhook] Attempting to register webhook URL:",
      webhookUrl
    );

    const r: TelegramResponse = await (
      await fetch(
        apiUrl(c.env.ENV_BOT_TOKEN, "setWebhook", {
          url: webhookUrl,
          secret_token: c.env.ENV_BOT_SECRET,
        })
      )
    ).json();

    if (r.ok) {
      console.log("[Register Webhook] Successfully registered webhook");
    } else {
      console.error("[Register Webhook] Failed to register webhook:", r);
    }

    return c.text(r.ok ? "Ok" : JSON.stringify(r, null, 2));
  }
);

async function onMessage(
  token: string,
  message: Message,
  baseUrl: string
): Promise<TelegramResponse> {
  if (!message.text) {
    return { ok: false, description: "No text in message" };
  }

  if (message.text === "/ping") {
    const userName = message.from?.first_name || "there";
    const timeOfDay = new Date().getHours();
    let greeting = "Hello";

    if (timeOfDay < 12) greeting = "Good morning";
    else if (timeOfDay < 17) greeting = "Good afternoon";
    else greeting = "Good evening";

    return sendPlainText(
      token,
      message.chat.id,
      `${greeting}, ${userName}! 🏓\nPong! Bot is alive and well!`,
      message
    );
  }

  if (message.text.startsWith("/start") || message.text.startsWith("/help")) {
    const userName = message.from?.first_name || "there";
    return sendMarkdownV2Text(
      token,
      message.chat.id,
      `Hello ${escapeMarkdown(userName)}\\! Welcome to UMP9 Bot 🤖\n\n` +
        `*Available Commands:*\n` +
        `\n🔍 *Basic Commands:*\n` +
        `\`/help\` \\- Show this message\n` +
        `\`/ping\` \\- Check if bot is alive\n` +
        `\n📚 *NH Commands:*\n` +
        `\`/nh <id>\` \\- Fetch data from nhapi\n` +
        `Example: \`/nh 546408\` or \`/nh https://nhentai\\.net/g/546408/\`\n\n` +
        `Bot Version: 1\\.0\\.0`,
      message
    );
  }

  if (message.text.startsWith("/nh")) {
    const input = message.text.split(" ")[1];
    if (!input) {
      return sendPlainText(
        token,
        message.chat.id,
        "Please provide an ID or URL. Example:\n/nh 546408\n/nh https://nhentai.net/g/546408/",
        message
      );
    }
    return handleNHCommand(token, message.chat.id, input, message);
  }

  return sendPlainText(
    token,
    message.chat.id,
    "Unknown command. Use /help to see available commands.",
    message
  );
}

async function formatNHResponse(data: any): Promise<string> {
  const tags = data.tags
    .filter((tag: any) => tag.type === "tag")
    .map((tag: any) => tag.name)
    .join(", ");

  const languages = data.tags
    .filter((tag: any) => tag.type === "language")
    .map((tag: any) => tag.name)
    .join(", ");

  const artists = data.tags
    .filter((tag: any) => tag.type === "artist")
    .map((tag: any) => tag.name)
    .join(", ");

  return `📖 *Title*: ${data.title.english || data.title.pretty || "N/A"}

📊 *Info*:
• ID: ${data.id}
• Pages: ${data.num_pages}
• Favorites: ${data.num_favorites}
• Language: ${languages}
• Artist: ${artists}

🏷️ *Tags*: ${tags}

📅 Upload Date: ${new Date(data.upload_date * 1000).toLocaleDateString()}`;
}

async function handleNHCommand(
  token: string,
  chatId: number,
  input: string,
  originalMessage: Message
): Promise<TelegramResponse> {
  console.log(`[NH] Processing request for ID: ${input}`);

  const loadingMessage = await sendPlainText(
    token,
    chatId,
    "🔍 Please wait, fetching data... This might take up to 5 minutes.",
    originalMessage
  );

  try {
    const id = input.includes("nhentai.net/g/")
      ? input.split("nhentai.net/g/")[1].replace(/\//g, "")
      : input;

    console.log(`[NH] Fetching data for ID: ${id}`);
    const response = await fetch(
      `https://nhapiod-proxy.onrender.com/get?id=${id}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[NH] Data fetched successfully for ID: ${id}`);

    // Delete the loading message
    const deleteParams: Record<string, any> = {
      chat_id: chatId,
      message_id: loadingMessage.result.message_id,
    };

    // Include message_thread_id if it exists
    if (originalMessage.message_thread_id) {
      deleteParams.message_thread_id = originalMessage.message_thread_id;
    }

    await fetch(apiUrl(token, "deleteMessage", deleteParams));

    // Format and send the response
    const formattedResponse = await formatNHResponse(data);
    const sendParams: Record<string, any> = {
      chat_id: chatId,
      text: formattedResponse,
      parse_mode: "Markdown",
    };

    // Include message_thread_id if it exists
    if (originalMessage.message_thread_id) {
      sendParams.message_thread_id = originalMessage.message_thread_id;
    }

    const sendResult = await fetch(apiUrl(token, "sendMessage", sendParams));

    const finalResponse = (await sendResult.json()) as TelegramResponse;
    if (!finalResponse.ok) {
      throw new Error("Failed to send message to user");
    }

    console.log(`[NH] Response sent successfully for ID: ${id}`);
    return finalResponse;
  } catch (error) {
    console.error(
      `[NH] Error:`,
      error instanceof Error ? error.message : "Unknown error"
    );

    if (loadingMessage.ok) {
      const deleteParams: Record<string, any> = {
        chat_id: chatId,
        message_id: loadingMessage.result.message_id,
      };

      // Include message_thread_id if it exists
      if (originalMessage.message_thread_id) {
        deleteParams.message_thread_id = originalMessage.message_thread_id;
      }

      await fetch(apiUrl(token, "deleteMessage", deleteParams));
    }

    const errorText = `Error: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;

    const errorResponse = await sendPlainText(
      token,
      chatId,
      errorText,
      originalMessage
    );
    return errorResponse;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

async function sendPlainText(
  token: string,
  chatId: number,
  text: string,
  replyToMessage?: Message
): Promise<TelegramResponse> {
  const params: Record<string, any> = {
    chat_id: chatId,
    text,
  };

  // If message is from a topic, use the same topic
  if (replyToMessage?.message_thread_id) {
    params.message_thread_id = replyToMessage.message_thread_id;
  }

  return (await fetch(apiUrl(token, "sendMessage", params))).json();
}

async function sendMarkdownV2Text(
  token: string,
  chatId: number,
  text: string,
  replyToMessage?: Message
): Promise<TelegramResponse> {
  const params: Record<string, any> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
  };

  // If message is from a topic, use the same topic
  if (replyToMessage?.message_thread_id) {
    params.message_thread_id = replyToMessage.message_thread_id;
  }

  return (await fetch(apiUrl(token, "sendMessage", params))).json();
}

function apiUrl(
  token: string,
  methodName: string,
  params: Record<string, any> | null = null
): string {
  let query = "";
  if (params) {
    query = "?" + new URLSearchParams(params).toString();
  }
  return `https://api.telegram.org/bot${token}/${methodName}${query}`;
}

export default app;
