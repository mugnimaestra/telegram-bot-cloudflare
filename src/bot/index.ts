import { Hono } from "hono";
import type { Context } from "hono";
import type { Update, Message, TelegramResponse, User } from "@/types/telegram";
import type { Env } from "@/types/env";
import type { R2Bucket } from "@cloudflare/workers-types";
import { handleNHCommand } from "@/utils/nh/handleNHCommand";
import { handleCallbackQuery } from "@/utils/nh/handleCallbackQuery";
import { sendPlainText } from "@/utils/telegram/sendPlainText";
import { sendMarkdownV2Text } from "@/utils/telegram/sendMarkdownV2Text";
import { escapeMarkdown } from "@/utils/telegram/escapeMarkdown";
import { apiUrl } from "@/utils/telegram/apiUrl";

const WEBHOOK = "/endpoint";
const STATUS_CHECK_LIMIT = 10; // Maximum number of status checks

type Variables = {
  baseUrl: string;
};

function getHelpMessage(firstName?: string): string {
  const greeting = firstName ? `Hello ${escapeMarkdown(firstName)}! ` : "";
  return `${greeting}Welcome to UMP9 Bot 🤖

*Available Commands:*

🔍 *Basic Commands:*
\`/help\` - Show this message
\`/ping\` - Check if bot is alive

📚 *NH Commands:*
\`/nh <id>\` - Fetch data and generate PDF/Telegraph viewer
Example: \`/nh 546408\` or \`/nh https://nhentai\\.net/g/546408/\`

*Features:*
• Automatic PDF generation with status tracking
• Interactive status check and download buttons
• Telegraph viewer fallback
• Fast R2 storage delivery
• Markdown formatted responses
• Group chat support

*PDF Features:*
• Check PDF generation status
• Download PDF directly when ready
• Status check limit: ${STATUS_CHECK_LIMIT} times per gallery

Bot Version: 1\\.2\\.0`;
}

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
    return new Response("Unauthorized", { status: 401 });
  }

  let update: Update;
  try {
    update = await c.req.json();
  } catch (error) {
    console.error("[Webhook] Invalid JSON:", error);
    return new Response("Bad Request", { status: 400 });
  }

  try {
    if (update.callback_query) {
      console.log(
        "[Webhook] Processing callback query:",
        update.callback_query.data
      );
      const success = await handleCallbackQuery(
        c.env.ENV_BOT_TOKEN,
        update.callback_query,
        c.env.NH_API_URL
      );
      if (!success) {
        console.error("[Webhook] Error handling callback query");
        return new Response("OK", { status: 200 }); // Still return 200 to acknowledge receipt
      }
      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/nh")) {
      console.log("[Webhook] Processing command: /nh");
      console.log("[Webhook] Bucket binding status:", {
        hasBucket: !!c.env.BUCKET,
        bucketType: typeof c.env.BUCKET,
        bucketKeys: Object.keys(c.env.BUCKET || {}),
      });
      try {
        const response = await handleNHCommand(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          update.message.text,
          update.message,
          c.env.BUCKET,
          c.env.NH_API_URL
        );
        if (!response.ok) {
          if (response.description?.includes("Network error")) {
            return new Response("Internal Server Error", { status: 500 });
          }
          console.error(
            "[Webhook] Error handling NH command:",
            response.description
          );
        }
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error handling NH command:", error);
        if (
          error instanceof Error &&
          (error.message === "Network error" || error.name === "NetworkError")
        ) {
          return new Response("Internal Server Error", { status: 500 });
        }
        return new Response("Internal Server Error", { status: 500 });
      }
    } else if (update.message?.text === "/ping") {
      try {
        await sendPlainText(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "Pong!"
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error sending ping response:", error);
        if (
          error instanceof Error &&
          (error.message === "Network error" ||
            error.name === "NetworkError" ||
            error.message.includes("Network error"))
        ) {
          return new Response("Internal Server Error", { status: 500 });
        }
        return new Response("Internal Server Error", { status: 500 });
      }
    } else if (
      update.message?.text === "/help" ||
      update.message?.text === "/start"
    ) {
      try {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          getHelpMessage(update.message.from?.first_name)
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error sending help/start response:", error);
        if (
          error instanceof Error &&
          (error.message === "Network error" || error.name === "NetworkError")
        ) {
          return new Response("Internal Server Error", { status: 500 });
        }
        return new Response("Internal Server Error", { status: 500 });
      }
    } else if (update.message?.new_chat_members) {
      const botId = parseInt(c.env.ENV_BOT_TOKEN.split(":")[0]);
      const isAddedToGroup = update.message.new_chat_members.some(
        (member: User) => member.id === botId
      );
      if (isAddedToGroup) {
        try {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            getHelpMessage()
          );
        } catch (error) {
          console.error(
            "[Webhook] Error sending group welcome message:",
            error
          );
          if (
            error instanceof Error &&
            (error.message === "Network error" || error.name === "NetworkError")
          ) {
            return new Response("Internal Server Error", { status: 500 });
          }
          return new Response("Internal Server Error", { status: 500 });
        }
      }
      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/")) {
      try {
        await sendPlainText(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "Unknown command. Type /help to see available commands."
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error(
          "[Webhook] Error sending unknown command response:",
          error
        );
        if (
          error instanceof Error &&
          (error.message === "Network error" || error.name === "NetworkError")
        ) {
          return new Response("Internal Server Error", { status: 500 });
        }
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    if (
      error instanceof Error &&
      (error.message === "Network error" || error.name === "NetworkError")
    ) {
      return new Response("Internal Server Error", { status: 500 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
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
  botToken: string,
  message: Message,
  baseUrl: string,
  bucket: R2Bucket,
  nhApiUrl: string
): Promise<TelegramResponse> {
  try {
    if (message.text === "/ping") {
      const hour = new Date().getHours();
      let greeting = "Hello";
      if (hour < 12) {
        greeting = "Good morning";
      } else if (hour < 18) {
        greeting = "Good afternoon";
      } else {
        greeting = "Good evening";
      }
      const response = await sendPlainText(
        botToken,
        message.chat.id,
        `${greeting}! I'm alive and well! 🤖`,
        message
      );
      if (!response.ok && response.description?.includes("Network error")) {
        throw new Error("Network error");
      }
      return response;
    } else if (message.text === "/start" || message.text === "/help") {
      const response = await sendMarkdownV2Text(
        botToken,
        message.chat.id,
        `${
          message.text === "/start"
            ? `Hello ${escapeMarkdown(message.from?.first_name || "there")}! `
            : ""
        }Welcome to UMP9 Bot 🤖\n\n*Available Commands:*\n\n🔍 *Basic Commands:*\n\`/help\` - Show this message\n\`/ping\` - Check if bot is alive\n\n📚 *NH Commands:*\n\`/nh <id>\` - Fetch data and generate PDF/Telegraph viewer\nExample: \`/nh 546408\` or \`/nh https://nhentai\\.net/g/546408/\`\n\n*Features:*\n• Automatic PDF generation with status tracking\n• Interactive status check and download buttons\n• Telegraph viewer fallback\n• Fast R2 storage delivery\n• Markdown formatted responses\n• Group chat support\n\n*PDF Features:*\n• Check PDF generation status\n• Download PDF directly when ready\n• Status check limit: ${STATUS_CHECK_LIMIT} times per gallery\n\nBot Version: 1\\.2\\.0`,
        message
      );
      if (!response.ok && response.description?.includes("Network error")) {
        throw new Error("Network error");
      }
      return response;
    } else if (message.text?.startsWith("/nh")) {
      const input = message.text.split(" ")[1];
      if (!input) {
        const response = await sendPlainText(
          botToken,
          message.chat.id,
          "Please provide an ID or URL. Example:\n/nh 546408\n/nh https://nhentai.net/g/546408/",
          message
        );
        if (!response.ok && response.description?.includes("Network error")) {
          throw new Error("Network error");
        }
        return response;
      }
      const response = await handleNHCommand(
        botToken,
        message.chat.id,
        input,
        message,
        bucket,
        nhApiUrl
      );
      if (!response.ok && response.description?.includes("Network error")) {
        throw new Error("Network error");
      }
      return response;
    } else {
      const response = await sendPlainText(
        botToken,
        message.chat.id,
        "Unknown command. Use /help to see available commands.",
        message
      );
      if (!response.ok && response.description?.includes("Network error")) {
        throw new Error("Network error");
      }
      return response;
    }
  } catch (error) {
    console.error("[Webhook] Error processing message:", error);
    if (error instanceof Error && error.message === "Network error") {
      throw error;
    }
    throw new Error("Internal server error");
  }
}

export default app;
