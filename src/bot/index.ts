import { Hono } from "hono";
import type { Context } from "hono";
import type {
  Update,
  Message,
  TelegramResponse,
  NHAPIResponse,
} from "@/types/telegram";
import {
  PDFStatus,
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
  Bindings: {
    ENV_BOT_TOKEN: string;
    ENV_BOT_SECRET: string;
    BUCKET: R2Bucket;
    NH_API_URL: string;
  };
  Variables: Variables;
}>();

// Add bucket check middleware
app.use("*", async (c, next) => {
  // Check bucket binding
  if (!c.env.BUCKET || typeof c.env.BUCKET.get !== "function") {
    console.error("[Error] R2 Bucket binding is not properly initialized");
  }
  await next();
});

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

    // Debug log for bucket
    console.log("[Webhook] Bucket binding status:", {
      hasBucket: "BUCKET" in c.env,
      bucketType: c.env.BUCKET ? typeof c.env.BUCKET : "undefined",
      bucketKeys: c.env.BUCKET ? Object.keys(c.env.BUCKET) : [],
    });

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
      c.env.NH_API_URL
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

// Add Telegraph account and page cache at the top level
let telegraphAccountCache: TelegraphAccount | null = null;
const telegraphPageCache: Map<number, string> = new Map();

async function getOrCreateTelegraphAccount(): Promise<TelegraphAccount> {
  // Return cached account if available
  if (telegraphAccountCache) {
    return telegraphAccountCache;
  }

  // Create new account if no cached account exists
  const account = await createTelegraphAccount();
  telegraphAccountCache = account;
  return account;
}

async function onMessage(
  token: string,
  message: Message,
  baseUrl: string,
  bucket: R2Bucket,
  nhApiUrl: string
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
        `\`/nh <id>\` \\- Fetch data and generate PDF/Telegraph viewer\n` +
        `Example: \`/nh 546408\` or \`/nh https://nhentai\\.net/g/546408/\`\n\n` +
        `*Features:*\n` +
        `• Automatic PDF generation\n` +
        `• Telegraph viewer fallback\n` +
        `• Fast R2 storage delivery\n` +
        `• Markdown formatted responses\n\n` +
        `Bot Version: 1\\.1\\.0`,
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
      nhApiUrl
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
  // Validate data structure
  if (!data || !data.tags || !Array.isArray(data.tags)) {
    console.error("[NH] Invalid data structure:", data);
    throw new Error("Invalid API response format");
  }

  const groupedTags = data.tags.reduce((acc, tag) => {
    if (!acc[tag.type]) {
      acc[tag.type] = [];
    }
    acc[tag.type].push(tag.name);
    return acc;
  }, {} as Record<TagTypeEnum, string[]>);

  // Safely access nested properties
  const title =
    data.title?.english || data.title?.pretty || data.title?.japanese || "N/A";
  const artists = groupedTags[TagTypeEnum.ARTIST]?.join(", ") || "N/A";
  const tags = groupedTags[TagTypeEnum.TAG]?.join(", ") || "N/A";
  const languages = groupedTags[TagTypeEnum.LANGUAGE]?.join(", ") || "N/A";
  const parody = groupedTags[TagTypeEnum.PARODY]?.join(", ") || "Original";
  const category = groupedTags[TagTypeEnum.CATEGORY]?.join(", ") || "N/A";

  return `📖 *Title*: ${escapeMarkdown(title)}

📊 *Info*:
• ID: ${data.id || "N/A"}
• Pages: ${data.num_pages || "N/A"}
• Favorites: ${data.num_favorites || "N/A"}
• Category: ${escapeMarkdown(category)}
• Parody: ${escapeMarkdown(parody)}
• Language: ${escapeMarkdown(languages)}
• Artist: ${escapeMarkdown(artists)}

🏷️ *Tags*: ${escapeMarkdown(tags)}

📅 Upload Date: ${
    data.upload_date
      ? new Date(data.upload_date * 1000).toLocaleDateString()
      : "N/A"
  }`;
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

    // Send basic info first
    const formattedResponse = await formatNHResponse(data);
    await sendMarkdownV2Text(token, chatId, formattedResponse, originalMessage);

    // Delete loading message after sending basic info
    await deleteLoadingMessage();

    // Debug PDF status and URL
    console.log("[NH] PDF Status check:", {
      status: data.pdf_status,
      statusType: typeof data.pdf_status,
      expectedStatus: PDFStatusEnum.COMPLETED,
      isCompleted: data.pdf_status === PDFStatusEnum.COMPLETED,
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
        data,
        originalMessage
      );
    }

    // Try to get the PDF from R2
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
        data,
        originalMessage
      );
    }
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

async function handleTelegraphFallback(
  token: string,
  chatId: number,
  data: NHAPIResponse,
  originalMessage: Message
): Promise<TelegramResponse> {
  try {
    // Check if we have a cached page URL for this content
    const cachedUrl = telegraphPageCache.get(data.id);
    if (cachedUrl) {
      console.log("[NH] Using cached Telegraph page URL for ID:", data.id);
      const statusMessage = getPDFStatusMessage(data.pdf_status);
      return sendMarkdownV2Text(
        token,
        chatId,
        `📖 *Read here*: ${escapeMarkdown(cachedUrl)}\n\n` +
          `ℹ️ ${statusMessage}`,
        originalMessage
      );
    }

    // Use cached or create new Telegraph account
    const account = await getOrCreateTelegraphAccount();

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
              src: page.url || "",
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

    // Cache the page URL
    telegraphPageCache.set(data.id, page.url);
    console.log("[NH] Cached Telegraph page URL for ID:", data.id);

    const statusMessage = getPDFStatusMessage(data.pdf_status);
    return sendMarkdownV2Text(
      token,
      chatId,
      `📖 *Read here*: ${escapeMarkdown(page.url)}\n\n` + `ℹ️ ${statusMessage}`,
      originalMessage
    );
  } catch (error) {
    console.error("[NH] Telegraph error:", error);
    // If there's an error, clear the account cache so we can try with a new account next time
    if (error instanceof Error && error.message.includes("UNAUTHORIZED")) {
      telegraphAccountCache = null;
      // Also clear the page cache since we might need to recreate pages
      telegraphPageCache.clear();
    }
    return sendMarkdownV2Text(
      token,
      chatId,
      `❌ Error: Failed to create Telegraph page`,
      originalMessage
    );
  }
}

function getPDFStatusMessage(status: PDFStatus | undefined): string {
  switch (status) {
    case PDFStatusEnum.PROCESSING:
      return "PDF is being generated\\. Please try again later\\.";
    case PDFStatusEnum.COMPLETED:
      return "PDF is ready and available\\.";
    case PDFStatusEnum.FAILED:
      return "PDF generation failed\\. Using Telegraph viewer instead\\.";
    case PDFStatusEnum.UNAVAILABLE:
      return "PDF service is currently unavailable\\. Using Telegraph viewer instead\\.";
    case PDFStatusEnum.NOT_REQUESTED:
      return "PDF generation not yet requested\\. Using Telegraph viewer instead\\.";
    case PDFStatusEnum.ERROR:
      return "Error occurred during PDF generation\\. Using Telegraph viewer instead\\.";
    default:
      return "PDF is not available\\. Using Telegraph viewer instead\\.";
  }
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
  console.log("[NH] Fetching data from:", `${nhApiUrl}/get?id=${id}`);
  const response = await fetch(`${nhApiUrl}/get?id=${id}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed with status: ${response.status}`);
  }

  const data = await response.json();
  console.log("[NH] API Response:", JSON.stringify(data, null, 2));

  // Validate response structure
  if (!data || typeof data !== "object") {
    throw new Error("Invalid API response format");
  }

  return data as NHAPIResponse;
}

async function handlePDFDownload(
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

export default app;
