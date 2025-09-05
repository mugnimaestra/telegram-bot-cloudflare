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
import { extractNHId } from "@/utils/nh/extractNHId";
import { fetchGalleryData } from "@/utils/nh/fetchNHData";
import { createGalleryTelegraphPage } from "@/utils/telegraph/createGalleryTelegraphPage";
import {
  createPdfFromGallery,
  type PdfProgressCallback,
  type PdfProgressStatus,
} from "@/utils/pdf/createPdfFromGallery"; // Added for PDF generation and progress types
import { sendDocument } from "@/utils/telegram/fetchers/sendDocument"; // Added for sending PDF
import { editMessageText } from "@/utils/telegram/fetchers/editMessageText"; // Added for editing status messages
import { handleVideoAnalysis } from "@/utils/video/handleVideoAnalysis";
import { handleVideoAnalysisAsync } from "@/utils/video/handleVideoAnalysisAsync";
import { checkJobStatus, formatJobStatusMessage } from "@/utils/video/checkJobStatus";
import { handleVideoJobWebhook, isValidWebhookPayload } from "@/utils/video/videoJobWebhook";
import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";

const WEBHOOK = "/endpoint";
const STATUS_CHECK_LIMIT = 10; // Maximum number of status checks
const GEMINI_TIER_1_DAILY_LIMIT = 1000; // 1000 requests per day for Tier 1

interface UsageData {
  count: number;
  date: string;
  resetTime: number;
}

type Variables = {
  baseUrl: string;
};

// Convert TelegramResponse to Message | boolean
async function convertResponse(
  response: TelegramResponse,
): Promise<Message | boolean> {
  if (!response.ok) return false;
  if (typeof response.result === "boolean") return response.result;
  return response.result as Message;
}

// Get Gemini API usage information
async function getGeminiUsageInfo(namespace?: any): Promise<string> {
  if (!namespace) {
    return "⚠️ Usage tracking unavailable - KV namespace not configured";
  }

  try {
    const usageData = await namespace.get("gemini-daily-usage");

    if (!usageData) {
      return `📊 *Gemini API Usage Stats*

🎯 *Daily Limit:* ${GEMINI_TIER_1_DAILY_LIMIT} requests
✅ *Used Today:* 0 requests
📈 *Remaining:* ${GEMINI_TIER_1_DAILY_LIMIT} requests
⏰ *Next Reset:* Midnight UTC

💡 *Status:* Fresh start! Ready for cooking videos 🎬`;
    }

    const usage: UsageData = JSON.parse(usageData);
    const remaining = Math.max(0, GEMINI_TIER_1_DAILY_LIMIT - usage.count);
    const resetTime = new Date(usage.resetTime * 1000);
    const hoursUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));

    let statusEmoji = "✅";
    let statusText = "Good standing";

    if (remaining === 0) {
      statusEmoji = "🚫";
      statusText = "Limit exceeded";
    } else if (remaining <= 50) {
      statusEmoji = "⚠️";
      statusText = "Approaching limit";
    }

    return `📊 *Gemini API Usage Stats*

🎯 *Daily Limit:* ${GEMINI_TIER_1_DAILY_LIMIT} requests
🔢 *Used Today:* ${usage.count} requests
📈 *Remaining:* ${remaining} requests
⏰ *Reset In:* ${hoursUntilReset} hours
📅 *Reset Time:* ${resetTime.toLocaleString()}

${statusEmoji} *Status:* ${statusText}

💡 *Tips:*
• Each cooking video analysis counts as 1 request
• Limit resets daily at midnight UTC
• Monitor usage: https://makersuite.google.com/app/usage`;

  } catch (error) {
    console.error("[Usage] Failed to get usage data:", error);
    return `❌ *Usage Check Failed*

Unable to retrieve usage statistics. This might be due to:
• Temporary service issue
• KV namespace configuration problem

Try again in a few minutes, or contact support if the issue persists.`;
  }
}

function getHelpMessage(firstName?: string): string {
  const greeting = firstName ? `Hello ${escapeMarkdown(firstName)}\\! ` : "";
  return `${greeting}Welcome to UMP9 Bot 🤖

*Available Commands:*

🔍 *Basic Commands:*
\`/help\` - Show this message
\`/ping\` - Check if bot is alive
\`/usage\` - Check Gemini API usage stats

📚 *NH Commands:*
\`/nh <id>\` - Fetch data and generate PDF/Telegraph viewer
Example: \`/nh 546408\` or \`/nh https://nhentai\\.net/g/546408/\`
\`/read <id_or_url>\` - Fetch data and generate Telegraph viewer only
Example: \`/read 546408\` or \`/read https://nhentai\\.net/g/546408/\`
\`/getpdf <id_or_url>\` - Fetch data and generate a PDF document
Example: \`/getpdf 546408\` or \`/getpdf https://nhentai\\.net/g/546408/\`

🍳 *Cooking Video Analysis:*
\`/recipe\` - Start cooking video analysis mode
• Upload any cooking video (max 10MB)
• AI extracts complete recipes automatically
• Includes ingredients, steps, and techniques
• Asynchronous job-based processing
\`/status <job_id>\` - Check video analysis job status
• View progress and completion status
• Get job details and estimated time remaining

📊 *Usage Monitoring:*
\`/usage\` - Check Gemini API usage statistics
• View daily request count and limits
• See remaining requests for today
• Monitor reset times and status

*Features:*
• Automatic PDF generation with status tracking
• Interactive status check and download buttons
• Telegraph viewer fallback
• Fast R2 storage delivery
• Markdown formatted responses
• Group chat support
• AI\\-powered cooking video analysis

*Limits:*
• PDF status checks: ${STATUS_CHECK_LIMIT} times per gallery
• Gemini API: ${GEMINI_TIER_1_DAILY_LIMIT} requests per day (resets at midnight UTC)
• Video size: 10MB maximum for analysis (R2 storage limits)

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

// Video analysis job completion webhook
app.post("/webhook/video-analysis", async (c) => {
  console.log("[Video Job Webhook] Received completion notification");

  // Verify webhook secret
  const providedSecret = c.req.header("X-Webhook-Secret");
  if (!providedSecret) {
    console.error("[Video Job Webhook] Missing webhook secret");
    return new Response("Missing webhook secret", { status: 401 });
  }

  let payload: VideoAnalysisWebhookPayload;
  try {
    payload = await c.req.json();
  } catch (error) {
    console.error("[Video Job Webhook] Invalid JSON:", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  // Validate payload structure
  if (!isValidWebhookPayload(payload)) {
    console.error("[Video Job Webhook] Invalid payload structure:", payload);
    return new Response("Invalid payload structure", { status: 400 });
  }

  // Process the webhook
  const result = await handleVideoJobWebhook(
    payload,
    c.env.WEBHOOK_SECRET,
    providedSecret,
    c.env.NAMESPACE,
  );

  if (!result.success) {
    console.error("[Video Job Webhook] Processing failed:", result.error);
    return new Response(result.error || "Processing failed", { status: 400 });
  }

  console.log("[Video Job Webhook] Successfully processed job completion");
  return new Response("OK", { status: 200 });
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
        update.callback_query.data,
      );
      const success = await handleCallbackQuery(
        c.env.ENV_BOT_TOKEN,
        update.callback_query,
        c.env.NH_API_URL,
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
          c.env.NH_API_URL,
        );
        if (!response.ok) {
          console.error(
            "[Webhook] Error handling NH command:",
            response.description,
          );
        }
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error handling NH command:", error);
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

        if (!text) {
          // Add check for text
          console.error("[Webhook] /read command received without text.");
          return new Response("OK", { status: 200 }); // Or send an error message
        }

        const galleryId = extractNHId(text.substring(6).trim()); // Remove "/read "

        if (!galleryId) {
          await sendPlainText(
            botToken,
            chatId,
            "Invalid nhentai URL or gallery ID.",
          );
          return new Response("OK", { status: 200 });
        }

        // Send initial "Processing..." message (optional, can be removed if not desired)
        // const processingMessage = await sendPlainText(botToken, chatId, `Processing gallery ${galleryId}...`);

        const galleryData = await fetchGalleryData(galleryId);

        if (!galleryData) {
          await sendPlainText(
            botToken,
            chatId,
            "Failed to fetch gallery data.",
          );
          return new Response("OK", { status: 200 });
        }

        // Create Telegraph page
        const telegraphUrl = await createGalleryTelegraphPage(galleryData);

        if (telegraphUrl) {
          await sendMarkdownV2Text(
            botToken,
            chatId,
            `📖 *Read here*: ${escapeMarkdown(telegraphUrl)}`,
            message, // Pass original message for reply context
          );
        } else {
          await sendPlainText(
            botToken,
            chatId,
            "❌ Error: Failed to create Telegraph page.",
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
          await sendPlainText(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "An error occurred while processing the /read command.",
          );
        }
        return new Response("OK", { status: 200 }); // Acknowledge receipt even on error
      }
    } else if (update.message?.text?.startsWith("/getpdf")) {
      console.log("[Webhook] Processing command: /getpdf");
      let statusMessageId: number | null = null; // Variable to store the status message ID
      const message = update.message; // Ensure message is defined for the scope
      const chatId = message?.chat?.id;
      const botToken = c.env.ENV_BOT_TOKEN;

      try {
        if (!message || !chatId) {
          throw new Error("Message or chat ID is missing");
        }
        const text = message.text;

        if (!text) {
          console.error("[Webhook] /getpdf command received without text.");
          return new Response("OK", { status: 200 });
        }

        const galleryId = extractNHId(text.substring(8).trim()); // Remove "/getpdf "

        if (!galleryId) {
          await sendPlainText(
            botToken,
            chatId,
            "Invalid nhentai URL or gallery ID.",
          );
          return new Response("OK", { status: 200 });
        }

        // --- Send initial status message and capture ID ---
        const initialMessageText = `⏳ Initializing PDF generation for gallery ${galleryId}...`;
        const initialMessageResponse = await sendPlainText(
          botToken,
          chatId,
          initialMessageText,
        );

        // Check if the response is OK and the result is a Message object
        if (
          initialMessageResponse.ok &&
          typeof initialMessageResponse.result === "object" &&
          initialMessageResponse.result !== null &&
          "message_id" in initialMessageResponse.result
        ) {
          statusMessageId = initialMessageResponse.result.message_id;
          console.log(
            `[Webhook /getpdf] Initial status message sent (ID: ${statusMessageId})`,
          );
        } else {
          console.error(
            `[Webhook /getpdf] Failed to send initial status message or get its ID for gallery ${galleryId}. Response:`,
            initialMessageResponse,
          );
          // Proceed without progress updates, or send a final error? For now, proceed.
          // await sendPlainText(botToken, chatId, `❌ Error: Could not initialize status updates for gallery ${galleryId}.`);
          // return new Response("OK", { status: 200 });
        }

        // --- Define Progress Callback ---
        const onProgress: PdfProgressCallback = async (
          status: PdfProgressStatus,
        ) => {
          if (!statusMessageId) return; // Don't try to edit if we don't have the ID

          let progressText = initialMessageText; // Default to initial text

          switch (status.type) {
            case "downloading":
              progressText = `⏳ Downloading image ${status.current}/${status.total} for gallery ${galleryId}...`;
              break;
            case "embedding":
              progressText = `⚙️ Embedding image ${status.current}/${status.total} into PDF for gallery ${galleryId}...`;
              break;
            case "saving":
              progressText = `💾 Saving PDF for gallery ${galleryId}...`;
              break;
            case "error":
              // Keep the last known good status or show a generic error? Let's show the specific error.
              // Note: This might overwrite previous progress. Consider appending errors instead.
              progressText = `⚠️ Error during PDF generation for ${galleryId}: ${status.error || "Unknown error"}`;
              console.warn(
                `[Webhook /getpdf Progress Error] Gallery ${galleryId}: ${status.error}`,
              );
              break;
          }

          try {
            // Avoid editing too frequently if many errors occur rapidly? (Telegram limits apply)
            // Basic check: only edit if text changes? (Could be added)
            await editMessageText(
              {
                chat_id: chatId,
                message_id: statusMessageId,
                text: progressText,
              },
              botToken,
            );
          } catch (editError) {
            console.error(
              `[Webhook /getpdf] Failed to edit status message ${statusMessageId} for gallery ${galleryId}:`,
              editError,
            );
            // Stop trying to edit if it fails? Maybe disable further updates.
            statusMessageId = null; // Stop further edits on error
          }
        };

        // --- Fetch Gallery Data ---
        // Edit status before long operation
        if (statusMessageId)
          await editMessageText(
            {
              chat_id: chatId,
              message_id: statusMessageId,
              text: `🔍 Fetching gallery data for ${galleryId}...`,
            },
            botToken,
          );
        const galleryData = await fetchGalleryData(galleryId);

        if (!galleryData) {
          const errorMsg = `❌ Error: Failed to fetch gallery data for ID ${galleryId}.`;
          if (statusMessageId)
            await editMessageText(
              { chat_id: chatId, message_id: statusMessageId, text: errorMsg },
              botToken,
            );
          else await sendPlainText(botToken, chatId, errorMsg); // Send new message if initial failed
          return new Response("OK", { status: 200 });
        }

        // --- Create PDF with Progress ---
        const pdfBytes = await createPdfFromGallery(
          galleryData.images,
          onProgress,
        );

        if (!pdfBytes) {
          const errorMsg = `❌ Error: Failed to generate PDF for gallery ${galleryId}. Some images might be missing, unsupported, or generation failed.`;
          if (statusMessageId)
            await editMessageText(
              { chat_id: chatId, message_id: statusMessageId, text: errorMsg },
              botToken,
            );
          else await sendPlainText(botToken, chatId, errorMsg);
          return new Response("OK", { status: 200 });
        }
        // --- Send PDF Document ---
        if (statusMessageId)
          await editMessageText(
            {
              chat_id: chatId,
              message_id: statusMessageId,
              text: `📤 Sending PDF for gallery ${galleryId}...`,
            },
            botToken,
          );
        const fileName = `${galleryData.title || galleryId}.pdf`;
        const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
        // Corrected: Removed duplicate declaration
        const sendParams = {
          chat_id: chatId.toString(),
          document: pdfBlob,
          filename: fileName,
          // caption: `PDF for ${galleryData.title}`, // Optional
          // reply_to_message_id: message.message_id // Optional: reply to original command
        };
        const sendResult = await sendDocument(sendParams, botToken);

        // --- Final Status Update ---
        if (!sendResult.ok) {
          const errorMsg = `❌ Error: Failed to send the generated PDF for gallery ${galleryId}.`;
          console.error(
            `[Webhook /getpdf] Failed to send PDF for ${galleryId}. Status: ${sendResult.ok}`,
          );
          // Corrected editMessageText call
          if (statusMessageId)
            await editMessageText(
              { chat_id: chatId, message_id: statusMessageId, text: errorMsg },
              botToken,
            );
          else await sendPlainText(botToken, chatId, errorMsg); // Send separately if status updates failed
        } else {
          const successMsg = `✅ Successfully sent PDF for gallery ${galleryId} (${fileName}).`;
          console.log(
            `[Webhook /getpdf] Successfully sent PDF for ${galleryId}`,
          );
          if (statusMessageId) {
            // Option 1: Edit final status
            // Corrected editMessageText call
            await editMessageText(
              {
                chat_id: chatId,
                message_id: statusMessageId,
                text: successMsg,
              },
              botToken,
            );
            // Option 2: Delete status message (Requires deleteMessage function)
            // try {
            //     await deleteMessage(botToken, chatId, statusMessageId);
            // } catch (deleteError) {
            //     console.error(`[Webhook /getpdf] Failed to delete status message ${statusMessageId}:`, deleteError);
            // }
          }
          // If status message failed initially, we might want to send the success message anyway
          // else { await sendPlainText(botToken, chatId, successMsg); }
        }

        return new Response("OK", { status: 200 });
      } catch (error) {
        // This catch block now only handles errors *before* waitUntil
        console.error("[Webhook /getpdf] Initial processing error:", error);
        const errorMsg = `🆘 An unexpected error occurred before starting PDF generation.`;
        // Attempt to send an error message if possible
        if (chatId && botToken) {
          try {
            // If we have a status message ID, try editing it
            if (statusMessageId) {
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: statusMessageId,
                  text: errorMsg,
                },
                botToken,
              );
            } else {
              // Otherwise, send a new message
              await sendPlainText(botToken, chatId, errorMsg);
            }
          } catch (sendError) {
            console.error(
              "[Webhook /getpdf] Failed to send initial processing error message:",
              sendError,
            );
          }
        }
        // Still acknowledge receipt to Telegram
        return new Response("OK", { status: 200 });
      }

      // --- Define the Asynchronous Task ---
      const generateAndSendPdfTask = async () => {
        let taskStatusMessageId = statusMessageId; // Use a local copy for the async task

        // Safely extract gallery ID
        if (!message?.text) {
          const errorMsg = "Message text is missing in async task.";
          if (taskStatusMessageId)
            await editMessageText(
              {
                chat_id: chatId,
                message_id: taskStatusMessageId,
                text: errorMsg,
              },
              botToken,
            );
          return;
        }

        const galleryId = extractNHId(message.text.substring(8).trim()); // Get gallery ID in task scope

        if (!galleryId) {
          const errorMsg = "Invalid gallery ID in async task.";
          if (taskStatusMessageId)
            await editMessageText(
              {
                chat_id: chatId,
                message_id: taskStatusMessageId,
                text: errorMsg,
              },
              botToken,
            );
          return;
        }

        try {
          // --- Fetch Gallery Data ---
          if (taskStatusMessageId)
            await editMessageText(
              {
                chat_id: chatId,
                message_id: taskStatusMessageId,
                text: `🔍 Fetching gallery data for ${galleryId}...`,
              },
              botToken,
            );
          // Pass NH_API_URL from env
          const galleryData = await fetchGalleryData(galleryId);

          if (!galleryData) {
            const errorMsg = `❌ Error: Failed to fetch gallery data for ID ${galleryId}.`;
            if (taskStatusMessageId)
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: taskStatusMessageId,
                  text: errorMsg,
                },
                botToken,
              );
            else await sendPlainText(botToken, chatId, errorMsg); // Send new message if initial failed
            return; // Stop the async task
          }

          // --- Define Progress Callback ---
          const onProgress: PdfProgressCallback = async (
            status: PdfProgressStatus,
          ) => {
            if (!taskStatusMessageId) return; // Don't try to edit if we don't have the ID

            let progressText = `⏳ Initializing PDF generation for gallery ${galleryId}...`; // Default text

            switch (status.type) {
              case "downloading":
                progressText = `⏳ Downloading image ${status.current}/${status.total} for gallery ${galleryId}...`;
                break;
              case "embedding":
                progressText = `⚙️ Embedding image ${status.current}/${status.total} into PDF for gallery ${galleryId}...`;
                break;
              case "saving":
                progressText = `💾 Saving PDF for gallery ${galleryId}...`;
                break;
              case "error":
                progressText = `⚠️ Error during PDF generation for ${galleryId}: ${status.error || "Unknown error"}`;
                console.warn(
                  `[Webhook /getpdf Task Progress Error] Gallery ${galleryId}: ${status.error}`,
                );
                break;
            }

            try {
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: taskStatusMessageId,
                  text: progressText,
                },
                botToken,
              );
            } catch (editError) {
              console.error(
                `[Webhook /getpdf Task] Failed to edit status message ${taskStatusMessageId} for gallery ${galleryId}:`,
                editError,
              );
              taskStatusMessageId = null; // Stop further edits on error
            }
          };

          // --- Create PDF with Progress ---
          const pdfBytes = await createPdfFromGallery(
            galleryData.images,
            onProgress,
          );

          if (!pdfBytes) {
            const errorMsg = `❌ Error: Failed to generate PDF for gallery ${galleryId}. Some images might be missing, unsupported, or generation failed.`;
            if (taskStatusMessageId)
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: taskStatusMessageId,
                  text: errorMsg,
                },
                botToken,
              );
            else await sendPlainText(botToken, chatId, errorMsg);
            return; // Stop the async task
          }

          // --- Send PDF Document ---
          if (taskStatusMessageId)
            await editMessageText(
              {
                chat_id: chatId,
                message_id: taskStatusMessageId,
                text: `📤 Sending PDF for gallery ${galleryId}...`,
              },
              botToken,
            );
          const fileName = `${galleryData.title || galleryId}.pdf`;
          const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
          const sendParams = {
            chat_id: chatId.toString(),
            document: pdfBlob,
            filename: fileName,
            // caption: `PDF for ${galleryData.title}`, // Optional
            // reply_to_message_id: message.message_id // Optional: reply to original command
          };
          const sendResult = await sendDocument(sendParams, botToken);

          // --- Final Status Update ---
          if (!sendResult.ok) {
            const errorMsg = `❌ Error: Failed to send the generated PDF for gallery ${galleryId}. The file may be too large or invalid.`;
            console.error(
              `[Webhook /getpdf Task] Failed to send PDF for ${galleryId}. Status: ${sendResult.ok}`,
            );
            if (taskStatusMessageId)
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: taskStatusMessageId,
                  text: errorMsg,
                },
                botToken,
              );
            else await sendPlainText(botToken, chatId, errorMsg); // Send separately if status updates failed
          } else {
            const successMsg = `✅ Successfully sent PDF for gallery ${galleryId} (${fileName}).`;
            console.log(
              `[Webhook /getpdf Task] Successfully sent PDF for ${galleryId}`,
            );
            if (taskStatusMessageId) {
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: taskStatusMessageId,
                  text: successMsg,
                },
                botToken,
              );
              // Optionally delete the status message here instead of editing
            }
            // If status message failed initially, we might want to send the success message anyway
            // else { await sendPlainText(botToken, chatId, successMsg); }
          }
        } catch (taskError) {
          // Catch errors within the async task
          console.error("[Webhook /getpdf Task] Unhandled error:", taskError);
          const errorMsg = `🆘 An unexpected error occurred during PDF generation for gallery ${galleryId}.`;
          // Try to edit the status message if possible, otherwise log (avoid sending new message from background task on generic error)
          if (taskStatusMessageId && chatId && botToken) {
            try {
              await editMessageText(
                {
                  chat_id: chatId,
                  message_id: taskStatusMessageId,
                  text: errorMsg,
                },
                botToken,
              );
            } catch (editError) {
              console.error(
                "[Webhook /getpdf Task] Failed to edit final error status message:",
                editError,
              );
            }
          }
          // Avoid sending a new message here for unhandled errors in background
          // else if (chatId && botToken) {
          //     await sendPlainText(botToken, chatId, errorMsg);
          // }
        }
      };

      // --- Schedule the task to run after the response ---
      c.executionCtx.waitUntil(generateAndSendPdfTask());

      // --- Return immediate response to Telegram ---
      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/status")) {
      console.log("[Webhook] Status command received");
      
      const jobId = update.message.text.split(' ')[1];
      
      if (!jobId) {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "🔍 *Job Status Check*\n\n" +
          "Please provide a job ID:\n" +
          "`/status <job_id>`\n\n" +
          "Example: `/status abc12345`",
        );
        return new Response("OK", { status: 200 });
      }

      try {
        const statusResult = await checkJobStatus(
          c.env.VIDEO_ANALYSIS_SERVICE_URL,
          jobId,
        );

        if (!statusResult.success || !statusResult.job) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            `❌ *Job Not Found*\n\n` +
            `Job ID: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&')}\`\n\n` +
            `This job may have:\n` +
            `• Already completed and been cleaned up\n` +
            `• Expired (jobs are kept for 24 hours)\n` +
            `• Never existed\n\n` +
            `💡 Try sending a new video for analysis`,
          );
        } else {
          const formattedStatus = formatJobStatusMessage(statusResult.job);
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            formattedStatus.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&'),
          );
        }
      } catch (error) {
        console.error("[Webhook] Error checking job status:", error);
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Status Check Failed*\n\n` +
          `Unable to check status for job: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&')}\`\n\n` +
          `This might be due to:\n` +
          `• Temporary service issue\n` +
          `• Network connectivity problem\n\n` +
          `Please try again in a few minutes\\.`,
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text === "/recipe") {
      console.log("[Webhook] Recipe command received, waiting for video");

      await sendMarkdownV2Text(
        c.env.ENV_BOT_TOKEN,
        update.message.chat.id,
        "🎬 *Send me a cooking video\\!*\n\n" +
          "I'll analyze it and extract:\n" +
          "• Complete ingredients list\n" +
          "• Step\\-by\\-step instructions\n" +
          "• Cooking times and temperatures\n" +
          "• Tips and techniques\n\n" +
                  "⚠️ *Important:* Maximum video size: 10MB\n" +
        "_Processing is done asynchronously - you'll get a job ID to track progress_",
      );

      return new Response("OK", { status: 200 });
    } else if (
      update.message?.video ||
      update.message?.document?.mime_type?.startsWith("video/")
    ) {
      console.log("[Webhook] Video received for async analysis");

      try {
        // Create webhook URL for job completion notifications
        const baseUrl = c.get("baseUrl") || `https://${c.req.header("host")}`;
        const webhookUrl = `${baseUrl}/webhook/video-analysis`;

        const response = await handleVideoAnalysisAsync(
          c.env.ENV_BOT_TOKEN,
          update.message,
          c.env.VIDEO_ANALYSIS_SERVICE_URL,
          webhookUrl,
          c.env.NAMESPACE,
        );

        if (!response.ok) {
          console.error(
            "[Webhook] Video analysis failed:",
            response.description,
          );
        }

        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error in video analysis:", error);
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text === "/ping") {
      try {
        await sendPlainText(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "Pong!",
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
    } else if (update.message?.text === "/usage") {
      console.log("[Webhook] Usage command received");
      try {
        const usageInfo = await getGeminiUsageInfo(c.env.NAMESPACE);
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          usageInfo,
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("[Webhook] Error sending usage response:", error);
        try {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Usage Check Failed*\n\nUnable to retrieve usage statistics\\. Please try again later\\.",
          );
        } catch (fallbackError) {
          console.error("[Webhook] Fallback usage response failed:", fallbackError);
        }
        return new Response("OK", { status: 200 });
      }
    } else if (
      update.message?.text === "/help" ||
      update.message?.text === "/start"
    ) {
      try {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          getHelpMessage(update.message.from?.first_name),
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
        (member: User) => member.id === botId,
      );
      if (isAddedToGroup) {
        try {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            getHelpMessage(),
          );
        } catch (error) {
          console.error(
            "[Webhook] Error sending group welcome message:",
            error,
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
          "Unknown command. Type /help to see available commands.",
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error(
          "[Webhook] Error sending unknown command response:",
          error,
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
app.get("/registerWebhook", async (c: Context<{ Bindings: Env }>) => {
  const host = c.req.header("host") || "";
  const webhookUrl = `https://${host}${WEBHOOK}`;

  console.log(
    "[Register Webhook] Attempting to register webhook URL:",
    webhookUrl,
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
      }),
    )
  ).json();

  if (r.ok) {
    console.log("[Register Webhook] Successfully registered webhook");
  } else {
    console.error("[Register Webhook] Failed to register webhook:", r);
  }

  return c.text(r.ok ? "Ok" : JSON.stringify(r, null, 2));
});

// Unregister webhook
app.get("/unRegisterWebhook", async (c: Context<{ Bindings: Env }>) => {
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
});

// Export the app
export default app;
