import { Hono } from "hono";
import type { Context } from "hono";
import type {
  Update,
  Message,
  TelegramResponse,
  NHAPIResponse,
} from "@/types/telegram";
import type { Env } from "@/types/env";
import type { R2Bucket } from "@cloudflare/workers-types";

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
  // Group tags by type
  const groupedTags = data.tags.reduce((acc, tag) => {
    if (!acc[tag.type]) {
      acc[tag.type] = [];
    }
    acc[tag.type].push(tag.name);
    return acc;
  }, {} as Record<string, string[]>);

  const title =
    data.title.english || data.title.pretty || data.title.japanese || "N/A";
  const artists = groupedTags["artist"]?.join(", ") || "N/A";
  const tags = groupedTags["tag"]?.join(", ") || "N/A";
  const languages = groupedTags["language"]?.join(", ") || "N/A";
  const parody = groupedTags["parody"]?.join(", ") || "Original";
  const category = groupedTags["category"]?.join(", ") || "N/A";

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

async function handleNHCommand(
  token: string,
  chatId: number,
  input: string,
  originalMessage: Message,
  bucket: R2Bucket,
  nhApiUrl: string
): Promise<TelegramResponse> {
  console.log(`[NH] Processing request for ID: ${input}`);

  const loadingMessage = await sendPlainText(
    token,
    chatId,
    "🔍 Please wait, fetching data...",
    originalMessage
  );

  try {
    const id = input.includes("nhentai.net/g/")
      ? input.split("nhentai.net/g/")[1].replace(/\//g, "")
      : input;

    console.log(`[NH] Fetching data for ID: ${id} from ${nhApiUrl}`);

    const response = await fetch(`${nhApiUrl}/get?id=${id}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const data = (await response.json()) as NHAPIResponse;
    console.log(`[NH] Data fetched successfully for ID: ${id}`);

    // Delete the loading message
    const deleteParams: Record<string, any> = {
      chat_id: chatId,
      message_id: loadingMessage.result.message_id,
    };

    if (originalMessage.message_thread_id) {
      deleteParams.message_thread_id = originalMessage.message_thread_id;
    }

    await fetch(apiUrl(token, "deleteMessage", deleteParams));

    // Format and send the info message
    const formattedResponse = await formatNHResponse(data);
    const sendParams: Record<string, any> = {
      chat_id: chatId,
      text: formattedResponse,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };

    if (originalMessage.message_thread_id) {
      sendParams.message_thread_id = originalMessage.message_thread_id;
    }

    const sendResult = await fetch(apiUrl(token, "sendMessage", sendParams));
    const infoResponse = (await sendResult.json()) as TelegramResponse;

    if (!infoResponse.ok) {
      throw new Error("Failed to send info message to user");
    }

    // Send a temporary message while downloading PDF
    const pdfLoadingMessage = await sendPlainText(
      token,
      chatId,
      "📥 Downloading PDF, please wait...",
      originalMessage
    );

    try {
      // Extract the key from the R2 URL
      const r2Url = new URL(data.pdf_url);
      const key = r2Url.pathname.slice(1); // Remove leading slash
      console.log(`[NH] PDF URL: ${data.pdf_url}`);
      console.log(`[NH] Extracted R2 key: ${key}`);

      // List objects in bucket to verify access
      console.log("[NH] Listing bucket objects...");
      try {
        // Try listing with no prefix first to see all objects
        console.log("[NH] Listing all objects in bucket...");
        const allObjects = await bucket.list();
        console.log("[NH] All objects in bucket:", allObjects);

        // Then try with the specific prefix
        const galleryPrefix = key.split("/")[0];
        console.log(`[NH] Listing objects with prefix '${galleryPrefix}'...`);
        const listed = await bucket.list({ prefix: galleryPrefix });
        console.log("[NH] Bucket list result for gallery:", listed);

        // Try to list the specific gallery
        const galleryId = key.split("/")[1];
        console.log(
          `[NH] Listing objects with prefix '${galleryPrefix}/${galleryId}'...`
        );
        const galleryObjects = await bucket.list({
          prefix: `${galleryPrefix}/${galleryId}`,
        });
        console.log("[NH] Gallery objects:", galleryObjects);
      } catch (listError) {
        console.error("[NH] Error listing bucket:", listError);
      }

      // Get the object directly from R2
      console.log(`[NH] Attempting to get object from R2...`);
      const pdfObject = await bucket.get(key);

      console.log("[NH] R2 object metadata:", {
        key: pdfObject?.key,
        size: pdfObject?.size,
        etag: pdfObject?.etag,
        httpEtag: pdfObject?.httpEtag,
      });

      if (!pdfObject) {
        throw new Error(`PDF not found in R2 storage for key: ${key}`);
      }

      // Get the PDF data
      console.log("[NH] Converting R2 object to blob...");
      const pdfBlob = await pdfObject.blob();
      console.log("[NH] PDF blob size:", pdfBlob.size);

      const formData = new FormData();

      // Get the title with correct priority
      const displayTitle =
        data.title.english || data.title.pretty || data.title.japanese || "N/A";

      // Create a clean filename
      const cleanTitle = displayTitle
        .replace(/[^\w\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "_") // Replace spaces with underscores
        .toLowerCase();
      const filename = `${cleanTitle}_${data.id}.pdf`;

      // Add caption to the document
      formData.append("document", pdfBlob, filename);
      formData.append("chat_id", chatId.toString());
      formData.append("caption", `${displayTitle} (ID: ${data.id})`);

      if (originalMessage.message_thread_id) {
        formData.append(
          "message_thread_id",
          originalMessage.message_thread_id.toString()
        );
      }

      // Send PDF as document
      const documentResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendDocument`,
        {
          method: "POST",
          body: formData,
        }
      );

      const documentResult =
        (await documentResponse.json()) as TelegramResponse;

      if (!documentResult.ok) {
        throw new Error("Failed to send PDF document");
      }

      // Delete the PDF loading message
      const deletePdfLoadingParams: Record<string, any> = {
        chat_id: chatId,
        message_id: pdfLoadingMessage.result.message_id,
      };

      if (originalMessage.message_thread_id) {
        deletePdfLoadingParams.message_thread_id =
          originalMessage.message_thread_id;
      }

      await fetch(apiUrl(token, "deleteMessage", deletePdfLoadingParams));

      console.log(`[NH] Response and PDF sent successfully for ID: ${id}`);
      return documentResult;
    } catch (pdfError) {
      console.error("[NH] PDF Error:", pdfError);

      // Update the loading message to show error
      const errorParams: Record<string, any> = {
        chat_id: chatId,
        message_id: pdfLoadingMessage.result.message_id,
        text: `❌ Failed to download PDF: ${
          pdfError instanceof Error ? pdfError.message : "Unknown error"
        }`,
      };

      if (originalMessage.message_thread_id) {
        errorParams.message_thread_id = originalMessage.message_thread_id;
      }

      await fetch(apiUrl(token, "editMessageText", errorParams));
      return infoResponse;
    }
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

      if (originalMessage.message_thread_id) {
        deleteParams.message_thread_id = originalMessage.message_thread_id;
      }

      await fetch(apiUrl(token, "deleteMessage", deleteParams));
    }

    const errorText = `Error: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;

    return sendPlainText(token, chatId, errorText, originalMessage);
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
