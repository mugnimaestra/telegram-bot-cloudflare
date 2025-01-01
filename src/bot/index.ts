import { Hono } from "hono";
import type { Context } from "hono";
import type {
  Update,
  Message,
  TelegramResponse,
  NHAPIResponse,
} from "@/types/telegram";
import {
  PDFStatus as PDFStatusEnum,
  TagType as TagTypeEnum,
} from "@/types/telegram";
import type { TelegraphAccount, TelegraphPage, Node } from "@/types/telegraph";
import type { Env } from "@/types/env";
import type { R2Bucket } from "@cloudflare/workers-types";

const WEBHOOK = "/endpoint";

type Variables = {
  baseUrl: string;
};

const app = new Hono<{
  Bindings: Env["Bindings"] & {
    KV: KVNamespace;
  };
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

    // Handle new chat members (bot added to group)
    if (update.message.new_chat_members) {
      const botWasAdded = update.message.new_chat_members.some(
        (member: { id: number }) =>
          member.id.toString() === c.env.ENV_BOT_TOKEN.split(":")[0]
      );
      if (botWasAdded) {
        console.log("[Webhook] Bot was added to a group");
        const messagePromise = sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "Hello\\! I'm UMP9 Bot 🤖\n\nUse /help to see available commands\\.",
          update.message
        );
        c.executionCtx.waitUntil(messagePromise);
        return c.text("Ok");
      }
    }

    const messagePromise = onMessage(
      c.env.ENV_BOT_TOKEN,
      update.message,
      c.get("baseUrl"),
      c.env.BUCKET,
      c.env.NH_API_URL,
      c.env.KV
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
          allowed_updates: [
            "message",
            "edited_message",
            "channel_post",
            "edited_channel_post",
          ],
          drop_pending_updates: true,
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

// Unregister webhook
app.get(
  "/unRegisterWebhook",
  async (c: Context<{ Bindings: Env["Bindings"] }>) => {
    console.log("[Unregister Webhook] Attempting to remove webhook");

    const r: TelegramResponse = await (
      await fetch(apiUrl(c.env.ENV_BOT_TOKEN, "setWebhook", { url: "" }))
    ).json();

    if (r.ok) {
      console.log("[Unregister Webhook] Successfully removed webhook");
    } else {
      console.error("[Unregister Webhook] Failed to remove webhook:", r);
    }

    return c.text(r.ok ? "Ok" : JSON.stringify(r, null, 2));
  }
);

async function onMessage(
  token: string,
  message: Message,
  baseUrl: string,
  bucket: R2Bucket,
  nhApiUrl: string,
  kv: KVNamespace
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
    return handleNHCommand(
      token,
      message.chat.id,
      input,
      message,
      bucket,
      nhApiUrl,
      kv
    );
  }

  return sendPlainText(
    token,
    message.chat.id,
    "Unknown command. Use /help to see available commands.",
    message
  );
}

async function formatNHResponse(data: NHAPIResponse): Promise<string> {
  const groupedTags = data.tags.reduce((acc, tag) => {
    if (!acc[tag.type]) {
      acc[tag.type] = [];
    }
    acc[tag.type].push(tag.name);
    return acc;
  }, {} as Record<TagTypeEnum, string[]>);

  const title =
    data.title.english || data.title.pretty || data.title.japanese || "N/A";
  const artists = groupedTags[TagTypeEnum.ARTIST]?.join(", ") || "N/A";
  const tags = groupedTags[TagTypeEnum.TAG]?.join(", ") || "N/A";
  const languages = groupedTags[TagTypeEnum.LANGUAGE]?.join(", ") || "N/A";
  const parody = groupedTags[TagTypeEnum.PARODY]?.join(", ") || "Original";
  const category = groupedTags[TagTypeEnum.CATEGORY]?.join(", ") || "N/A";

  return `📖 *Title*: ${title}

📊 *Info*:
• ID: ${data.id}
• Pages: ${data.num_pages}
• Favorites: ${data.num_favorites}
• Category: ${category}
• Parody: ${parody}
• Language: ${languages}
• Artist: ${artists}

🏷️ *Tags*: ${tags}

📅 Upload Date: ${new Date(data.upload_date * 1000).toLocaleDateString()}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  retries = 2
): Promise<Response> {
  const { timeout = 5000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.log(`[NH] Request timed out after ${timeout}ms, aborting...`);
  }, timeout);

  try {
    console.log(`[NH] Attempting fetch (${retries} retries left)`);
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[NH] Request aborted after ${timeout}ms`);
      if (retries > 0) {
        console.log(`[NH] Retrying... (${retries} retries left)`);
        const backoffTime = Math.min(1000 * retries, 2000);
        await new Promise((resolve) => setTimeout(resolve, backoffTime));

        const newTimeout = Math.min(timeout * 1.2, 8000);
        const newOptions = {
          ...options,
          timeout: newTimeout,
        };

        return fetchWithTimeout(url, newOptions, retries - 1);
      }
      throw new Error(`Request timed out after ${4 - retries} attempts`);
    }
    throw error;
  }
}

async function handleNHCommand(
  token: string,
  chatId: number,
  input: string,
  originalMessage: Message,
  bucket: R2Bucket,
  nhApiUrl: string,
  kv: KVNamespace
): Promise<TelegramResponse> {
  const loadingMessage = await sendPlainText(
    token,
    chatId,
    "🔍 Fetching data...",
    originalMessage
  );

  try {
    const id = input.includes("nhentai.net/g/")
      ? input.split("nhentai.net/g/")[1].replace(/\//g, "")
      : input;

    console.log(`[NH] Starting fetch for ID: ${id}`);
    const data = await fetchNHData(nhApiUrl, id);

    // Send basic info first
    const formattedResponse = await formatNHResponse(data);
    await sendMarkdownV2Text(token, chatId, formattedResponse, originalMessage);

    // Handle content based on PDF status
    if (data.pdf_status === PDFStatusEnum.COMPLETED) {
      return await handlePDFDownload(
        token,
        chatId,
        data,
        bucket,
        originalMessage
      );
    } else {
      return await handleTelegraphFallback(
        token,
        chatId,
        data,
        kv,
        originalMessage
      );
    }
  } catch (error) {
    console.error("[NH] Error:", error);
    return sendPlainText(
      token,
      chatId,
      `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      originalMessage
    );
  }
}

async function handleTelegraphFallback(
  token: string,
  chatId: number,
  data: NHAPIResponse,
  kv: KVNamespace,
  originalMessage: Message
): Promise<TelegramResponse> {
  // Get or create Telegraph account
  let account = (await kv.get("telegraph_account", "json")) as TelegraphAccount;

  if (!account) {
    account = await createTelegraphAccount();
    await kv.put("telegraph_account", JSON.stringify(account));
  }

  // Create Telegraph page content
  const content: Node[] = [
    {
      tag: "h4",
      children: [
        data.title.english || data.title.pretty || data.title.japanese,
      ],
    },
  ];

  // Add images
  for (const page of data.images.pages) {
    content.push({
      tag: "figure",
      children: [
        {
          tag: "img",
          attrs: {
            src: page.url,
          },
        },
      ],
    });
  }

  // Create Telegraph page
  const page = await createTelegraphPage(
    account.access_token,
    data.title.english || data.title.pretty || "Untitled",
    content
  );

  return sendMarkdownV2Text(
    token,
    chatId,
    `📖 *Read here*: ${escapeMarkdown(page.url)}\n\n` +
      `ℹ️ PDF is ${
        data.pdf_status === PDFStatusEnum.PROCESSING
          ? "still processing"
          : "not available"
      }. ` +
      `Using Telegraph viewer instead.`,
    originalMessage
  );
}

async function createTelegraphAccount(): Promise<TelegraphAccount> {
  const response = await fetch("https://api.telegra.ph/createAccount", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      short_name: "UMP9Bot",
      author_name: "UMP9",
      author_url: "https://t.me/your_bot_username",
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: TelegraphAccount;
  };
  if (!data.ok || !data.result) {
    throw new Error("Failed to create Telegraph account");
  }

  return data.result;
}

async function createTelegraphPage(
  accessToken: string,
  title: string,
  content: Node[]
): Promise<TelegraphPage> {
  const response = await fetch("https://api.telegra.ph/createPage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      access_token: accessToken,
      title,
      content: JSON.stringify(content),
      return_content: true,
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: TelegraphPage;
  };
  if (!data.ok || !data.result) {
    throw new Error("Failed to create Telegraph page");
  }

  return data.result;
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

async function fetchNHData(
  nhApiUrl: string,
  id: string
): Promise<NHAPIResponse> {
  const response = await fetch(`${nhApiUrl}/get?id=${id}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status: ${response.status}`);
  }

  return response.json();
}

async function handlePDFDownload(
  token: string,
  chatId: number,
  data: NHAPIResponse,
  bucket: R2Bucket,
  originalMessage: Message
): Promise<TelegramResponse> {
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

export default app;
