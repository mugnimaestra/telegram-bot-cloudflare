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
import { handleRSCMCommand } from "@/utils/rscm";
import type { TelegramContext } from "@/utils/rscm/types";
import { logger } from "@/utils/rscm/logger";
import { extractNHId } from "@/utils/nh/extractNHId";
import { fetchGalleryData } from "@/utils/nh/fetchNHData";
import { createGalleryTelegraphPage } from "@/utils/telegraph/createGalleryTelegraphPage";
import { createPdfFromGallery } from "@/utils/pdf/createPdfFromGallery"; // Added for PDF generation
import { sendDocument } from "@/utils/telegram/fetchers/sendDocument"; // Added for sending PDF

const WEBHOOK = "/endpoint";
const STATUS_CHECK_LIMIT = 10; // Maximum number of status checks

type Variables = {
  baseUrl: string;
};

// Convert TelegramResponse to Message | boolean
async function convertResponse(
  response: TelegramResponse
): Promise<Message | boolean> {
  if (!response.ok) return false;
  if (typeof response.result === "boolean") return response.result;
  return response.result as Message;
}

function getHelpMessage(firstName?: string): string {
  const greeting = firstName ? `Hello ${escapeMarkdown(firstName)}\\! ` : "";
  return `${greeting}Welcome to UMP9 Bot 🤖

*Available Commands:*

🔍 *Basic Commands:*
\`/help\` - Show this message
\`/ping\` - Check if bot is alive

📚 *NH Commands:*
\`/nh <id>\` - Fetch data and generate PDF/Telegraph viewer
Example: \`/nh 546408\` or \`/nh https://nhentai\\.net/g/546408/\`
\`/read <id_or_url>\` - Fetch data and generate Telegraph viewer only
Example: \`/read 546408\` or \`/read https://nhentai\\.net/g/546408/\`
\`/getpdf <id_or_url>\` - Fetch data and generate a PDF document
Example: \`/getpdf 546408\` or \`/getpdf https://nhentai\\.net/g/546408/\`

🏥 *RSCM Commands:*
\`/rscm <service>\` - Check RSCM appointment availability
Available services:
• \`URJT Geriatri\`
• \`IPKT Jantung\`

*Features:*
• Automatic PDF generation with status tracking
• Interactive status check and download buttons
• Telegraph viewer fallback
• Fast R2 storage delivery
• Markdown formatted responses
• Group chat support
• Real-time RSCM appointment checking

*PDF Features:*
• Check PDF generation status
• Download PDF directly when ready
• Status check limit: ${STATUS_CHECK_LIMIT} times per gallery

Bot Version: 1\\.2\\.0`;
}

const app = new Hono<{
  Bindings: Env;
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
          console.error(
            "[Webhook] Error handling NH command:",
            response.description
          );
        }
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error handling NH command:", error);
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/rscm")) {
      console.log("[Webhook] Processing command: /rscm");
      try {
        if (!update.message) {
          throw new Error("Message is missing");
        }

        // Store message in constant to ensure TypeScript knows it's defined
        const message = update.message;

        const ctx: TelegramContext = {
          message,
          chat: message.chat,
          reply: async (text: string, options?: { parse_mode?: string }) =>
            convertResponse(
              await sendMarkdownV2Text(
                c.env.ENV_BOT_TOKEN,
                message.chat.id,
                text
              )
            ),
          telegram: {
            editMessageText: async (
              chatId: number,
              messageId: number,
              inlineMessageId: string | undefined,
              text: string,
              options?: { parse_mode?: string }
            ) =>
              convertResponse(
                await fetch(
                  apiUrl(c.env.ENV_BOT_TOKEN, "editMessageText", {
                    chat_id: chatId,
                    message_id: messageId,
                    text,
                    parse_mode: options?.parse_mode,
                  })
                ).then((res) => res.json())
              ),
          },
        };

        // Set logger production mode based on environment
        logger.setProduction(c.env.NODE_ENV === "production");

        // Pass environment variables to handleRSCMCommand
        const rscmEnv = {
          RSCM_CONFIG: c.env.RSCM_CONFIG,
          RSCM_API_URL: c.env.RSCM_API_URL,
          RSCM_CHECK_INTERVAL: c.env.RSCM_CHECK_INTERVAL,
          RSCM_SERVICES: c.env.RSCM_SERVICES,
        };

        await handleRSCMCommand(ctx, rscmEnv);
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error handling RSCM command:", error);
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/read")) {
      console.log("[Webhook] Processing command: /read");
      try {
        if (!update.message) {
          throw new Error("Message is missing");
        }
        const message = update.message; // Ensure message is defined
        const text = message.text;
        const chatId = message.chat.id;
        const botToken = c.env.ENV_BOT_TOKEN;

        if (!text) { // Add check for text
          console.error("[Webhook] /read command received without text.");
          return new Response("OK", { status: 200 }); // Or send an error message
        }

        const galleryId = extractNHId(text.substring(6).trim()); // Remove "/read "

        if (!galleryId) {
          await sendPlainText(botToken, chatId, "Invalid nhentai URL or gallery ID.");
          return new Response("OK", { status: 200 });
        }

        // Send initial "Processing..." message (optional, can be removed if not desired)
        // const processingMessage = await sendPlainText(botToken, chatId, `Processing gallery ${galleryId}...`);

        const galleryData = await fetchGalleryData(galleryId);

        if (!galleryData) {
          await sendPlainText(botToken, chatId, "Failed to fetch gallery data.");
          return new Response("OK", { status: 200 });
        }

        // Create Telegraph page
        const telegraphUrl = await createGalleryTelegraphPage(galleryData);

        if (telegraphUrl) {
          await sendMarkdownV2Text(
            botToken,
            chatId,
            `📖 *Read here*: ${escapeMarkdown(telegraphUrl)}`,
            message // Pass original message for reply context
          );
        } else {
          await sendPlainText(
            botToken,
            chatId,
            "❌ Error: Failed to create Telegraph page."
          );
        }

        // Optionally delete the "Processing..." message if it was sent
        // if (processingMessage && typeof processingMessage !== 'boolean' && processingMessage.message_id) {
        //    // TODO: Implement message deletion if desired
        //    // await deleteMessage(botToken, chatId, processingMessage.message_id);
        // }

        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error handling /read command:", error);
        // Send generic error message
        if (update.message?.chat?.id && c.env.ENV_BOT_TOKEN) {
            await sendPlainText(c.env.ENV_BOT_TOKEN, update.message.chat.id, "An error occurred while processing the /read command.");
        }
        return new Response("OK", { status: 200 }); // Acknowledge receipt even on error
      }
    } else if (update.message?.text?.startsWith("/getpdf")) {
      console.log("[Webhook] Processing command: /getpdf");
      try {
        if (!update.message) {
          throw new Error("Message is missing");
        }
        const message = update.message;
        const text = message.text;
        const chatId = message.chat.id;
        const botToken = c.env.ENV_BOT_TOKEN;

        if (!text) {
          console.error("[Webhook] /getpdf command received without text.");
          return new Response("OK", { status: 200 });
        }

        const galleryId = extractNHId(text.substring(8).trim()); // Remove "/getpdf "

        if (!galleryId) {
          await sendPlainText(botToken, chatId, "Invalid nhentai URL or gallery ID.");
          return new Response("OK", { status: 200 });
        }

        // Send initial "Generating PDF..." message
        const processingMessage = await sendPlainText(botToken, chatId, `⏳ Generating PDF for gallery ${galleryId}... This might take a while.`);

        const galleryData = await fetchGalleryData(galleryId);

        if (!galleryData) {
          await sendPlainText(botToken, chatId, `❌ Error: Failed to fetch gallery data for ID ${galleryId}.`);
          return new Response("OK", { status: 200 });
        }

        // Create PDF
        const pdfBytes = await createPdfFromGallery(galleryData.images);

        if (!pdfBytes) {
          await sendPlainText(botToken, chatId, `❌ Error: Failed to generate PDF for gallery ${galleryId}. Some images might be missing or unsupported.`);
          return new Response("OK", { status: 200 });
        }

        // Send PDF document
        const fileName = `${galleryData.title || galleryId}.pdf`; // Use galleryData.title directly
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const sendParams = {
          chat_id: chatId.toString(), // Ensure chat_id is a string
          document: pdfBlob,
          filename: fileName,
          // caption: `PDF for ${galleryData.title}`, // Optional caption
          // message_thread_id: message.message_thread_id?.toString(), // Optional thread ID
        };
        const sendResult = await sendDocument(sendParams, botToken);

        if (!sendResult.ok) {
            console.error(`[Webhook] Failed to send PDF for ${galleryId}. Status: ${sendResult.ok}`); // Log status instead of description
            await sendPlainText(botToken, chatId, `❌ Error: Failed to send the generated PDF for gallery ${galleryId}.`);
        } else {
            console.log(`[Webhook] Successfully sent PDF for ${galleryId}`);
            // Optionally delete the "Generating..." message if needed and possible
            // if (processingMessage && typeof processingMessage !== 'boolean' && processingMessage.message_id) {
            //    // await deleteMessage(botToken, chatId, processingMessage.message_id);
            // }
        }

        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error handling /getpdf command:", error);
        // Send generic error message
        if (update.message?.chat?.id && c.env.ENV_BOT_TOKEN) {
            await sendPlainText(c.env.ENV_BOT_TOKEN, update.message.chat.id, "An error occurred while processing the /getpdf command.");
        }
        return new Response("OK", { status: 200 }); // Acknowledge receipt even on error
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
  async (c: Context<{ Bindings: Env }>) => {
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
  async (c: Context<{ Bindings: Env }>) => {
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

export default app;
