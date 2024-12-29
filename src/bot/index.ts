import { Hono } from "hono";
import type { Context } from "hono";
import type { Update, Message, TelegramResponse } from "@/types/telegram";
import api from "../api/server";
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

// Mount API routes
app.route("/api", api);

// Bot webhook handler
app.post(WEBHOOK, async (c) => {
  if (
    c.req.header("X-Telegram-Bot-Api-Secret-Token") !== c.env.ENV_BOT_SECRET
  ) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  const update: Update = await c.req.json();
  if ("message" in update && update.message) {
    c.executionCtx.waitUntil(
      onMessage(c.env.ENV_BOT_TOKEN, update.message, c.get("baseUrl"))
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

    console.log("Registering webhook URL:", webhookUrl);

    const r: TelegramResponse = await (
      await fetch(
        apiUrl(c.env.ENV_BOT_TOKEN, "setWebhook", {
          url: webhookUrl,
          secret_token: c.env.ENV_BOT_SECRET,
        })
      )
    ).json();
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
    return sendPlainText(token, message.chat.id, "pong! 🏓");
  }

  if (message.text.startsWith("/start") || message.text.startsWith("/help")) {
    return sendMarkdownV2Text(
      token,
      message.chat.id,
      "*Available Commands:*\n" +
        "`/help` \\- Show this message\n" +
        "`/ping` \\- Test bot connection\n" +
        "`/fetch` \\- Fetch URL with anti\\-bot bypass"
    );
  }

  if (message.text.startsWith("/fetch")) {
    const url = message.text.split(" ")[1];
    if (!url) {
      return sendPlainText(
        token,
        message.chat.id,
        "Please provide a URL. Example:\n/fetch https://example.com"
      );
    }
    return handleFetchCommand(token, message.chat.id, url, baseUrl);
  }

  return sendPlainText(
    token,
    message.chat.id,
    "Unknown command. Use /help to see available commands."
  );
}

async function handleFetchCommand(
  token: string,
  chatId: number,
  url: string,
  baseUrl: string
): Promise<TelegramResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/fetch_url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = (await response.json()) as {
      status: string;
      message: string;
    };

    if (data.status === "success") {
      return sendMarkdownV2Text(
        token,
        chatId,
        `*Successfully fetched URL*\n${escapeMarkdown(data.message)}`
      );
    } else {
      return sendPlainText(token, chatId, `Error: ${data.message}`);
    }
  } catch (error) {
    return sendPlainText(
      token,
      chatId,
      "Failed to fetch URL. Please try again later."
    );
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

async function sendPlainText(
  token: string,
  chatId: number,
  text: string
): Promise<TelegramResponse> {
  return (
    await fetch(
      apiUrl(token, "sendMessage", {
        chat_id: chatId,
        text,
      })
    )
  ).json();
}

async function sendMarkdownV2Text(
  token: string,
  chatId: number,
  text: string
): Promise<TelegramResponse> {
  return (
    await fetch(
      apiUrl(token, "sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
      })
    )
  ).json();
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
