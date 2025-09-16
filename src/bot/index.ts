import { Hono } from "hono";
import type { Context } from "hono";
import type { Update, Message, TelegramResponse, User } from "@/types/telegram";
import type { Env } from "@/types/env";
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
import {
  checkJobStatus,
  formatJobStatusMessage,
  formatWebhookOnlyStatusMessage,
} from "@/utils/video/checkJobStatus";
import { getWebhookStatus } from "@/utils/video/getWebhookStatus";
import {
  handleVideoJobWebhook,
  isValidWebhookPayload,
} from "@/utils/video/videoJobWebhook";
import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import { logger } from "@/utils/logger";
import {
  handleRetryWebhookCommand,
  handleDeadLetterQueueCommand,
  handleRetryDeadLetterCommand,
  handleClearDeadLetterCommand,
  handleWebhookCallbackQuery,
  sendWebhookStatusWithActions
} from "@/utils/video/handleWebhookCommands";
// Userbot imports
import { UserbotClient } from "@/userbot/client";
import { UserbotAuth } from "@/userbot/auth";
import { UserbotHandlers } from "@/userbot/handlers";
import type { UserbotConfig, UserbotContext } from "@/userbot/types";

const WEBHOOK = "/endpoint";
const STATUS_CHECK_LIMIT = 10; // Maximum number of status checks
const GEMINI_TIER_1_DAILY_LIMIT = 1000; // 1000 requests per day for Tier 1

/**
 * Usage data structure for tracking Gemini API usage statistics
 * Stored in KV namespace for persistence across worker instances
 */
interface UsageData {
  /** Number of API requests made today */
  count: number;
  /** Date string in ISO format for tracking daily usage */
  date: string;
  /** Unix timestamp when the daily limit resets (midnight UTC) */
  resetTime: number;
}

/**
 * Context variables interface for the Hono application
 * Contains both bot and userbot related state that needs to be shared across middleware and handlers
 */
type Variables = {
  /** Base URL for the application, used for webhook construction */
  baseUrl: string;
  /** Userbot client instance for Telegram user bot operations
   * Only available when USERBOT_ENABLED is set to "true" and initialization succeeds
   */
  userbotClient?: UserbotClient;
  /** Userbot handlers for managing message and command handlers
   * Provides event handling capabilities for the userbot
   * Only available when userbot initialization succeeds
   */
  userbotHandlers?: UserbotHandlers;
  /** Userbot context containing session and configuration information
   * Contains authentication state, configuration, and metadata for the userbot
   * Only available when userbot initialization succeeds
   */
  userbotContext?: UserbotContext;
};

/**
 * Convert Telegram API response to a standardized format
 * @param response - The raw response from Telegram API
 * @returns Promise resolving to a Message object if successful, false if failed
 * @throws Error if response format is invalid
 */
async function convertResponse(
  response: TelegramResponse,
): Promise<Message | boolean> {
  if (!response.ok) return false;
  if (typeof response.result === "boolean") return response.result;
  return response.result as Message;
}

/**
 * Get Gemini API usage information from KV storage
 * @param namespace - KV namespace for storing usage data (optional)
 * @returns Formatted string with usage statistics and status information
 * @throws Error if KV storage access fails
 */
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
    const hoursUntilReset = Math.ceil(
      (resetTime.getTime() - Date.now()) / (1000 * 60 * 60),
    );

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
    logger.error("[Usage] Failed to get usage data", { error });
    return `❌ *Usage Check Failed*

Unable to retrieve usage statistics. This might be due to:
• Temporary service issue
• KV namespace configuration problem

Try again in a few minutes, or contact support if the issue persists.`;
  }
}

/**
 * Generate help message with available commands and bot information
 * @param firstName - Optional user first name for personalized greeting
 * @returns Formatted help message string with Markdown V2 formatting
 */
function getHelpMessage(firstName?: string, userbotEnabled?: boolean): string {
  const greeting = firstName ? `Hello ${escapeMarkdown(firstName)}\\! ` : "";
  const userbotSection = userbotEnabled ? `

🤖 *Userbot Commands:*
\`/userbot_start\` - Start the userbot client
• Check if userbot is enabled in environment
• Initialize and start the userbot client
• Save session to KV storage
• Send confirmation message to user

\`/userbot_stop\` - Stop the userbot client
• Disconnect the userbot client
• Clear session from KV storage
• Send confirmation message to user

\`/userbot_status\` - Check userbot status
• Check if userbot is enabled and connected
• Display connection status, user info, and session details
• Send status information to user

\`/userbot_info\` - Get userbot user information
• Get user information from the userbot client
• Display user details like username, phone number, etc.
• Send user information to user

\`/userbot_send <peer> <message>\` - Send a message using the userbot
• Validate parameters
• Use the userbot client to send a message
• Send confirmation with message ID to user

\`/userbot_help\` - Display userbot help information
• List all available userbot commands
• Provide usage examples
• Send help message to user` : "";

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
• Upload any cooking video
• AI extracts complete recipes automatically
• Includes ingredients, steps, and techniques
• Asynchronous job-based processing
\`/status <job_id>\` - Check video analysis job status
• View progress and completion status
• Get job details and estimated time remaining
• Includes webhook delivery information

📡 *Webhook Management:*
\`/webhook_status <job_id>\` - Check webhook delivery status
• View webhook delivery attempts and timestamps
• See error details for failed deliveries
• Monitor retry attempts and scheduling
\`/retry_webhook <job_id>\` - Manually retry failed webhook delivery
• Trigger immediate retry for failed webhooks
• Reset retry counters and attempt delivery
• Available for failed webhooks with remaining attempts

📊 *Usage Monitoring:*
\`/usage\` - Check Gemini API usage statistics
• View daily request count and limits
• See remaining requests for today
• Monitor reset times and status${userbotSection}

*Features:*
• Automatic PDF generation with status tracking
• Interactive status check and download buttons
• Telegraph viewer fallback
• Fast R2 storage delivery
• Markdown formatted responses
• Group chat support
• AI\\-powered cooking video analysis
• Enhanced webhook delivery tracking
• Automatic retry with exponential backoff
• Manual webhook retry capabilities${userbotEnabled ? '\n• Userbot functionality with Telegram client integration' : ''}

*Limits:*
• PDF status checks: ${STATUS_CHECK_LIMIT} times per gallery
• Gemini API: ${GEMINI_TIER_1_DAILY_LIMIT} requests per day (resets at midnight UTC)
• Video size: Determined by video analyzer service
• Webhook retries: 3 attempts maximum (configurable)
• Webhook status storage: 7 days${userbotEnabled ? '\n• Userbot session: 30 days (configurable)' : ''}

Bot Version: 1\\.3\\.0`;
}

const app = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// Add bucket check middleware
app.use("*", async (c, next) => {
  // Check bucket binding
  if (!c.env.BUCKET || typeof c.env.BUCKET.get !== "function") {
    logger.error("[Error] R2 Bucket binding is not properly initialized");
  }
  await next();
});

// Store the base URL in context
app.use("*", async (c, next) => {
  c.set("baseUrl", `https://${c.req.header("host")}`);
  await next();
});

/**
 * Middleware to initialize the userbot if enabled
 * Handles session management, authentication, and handler registration
 * Provides comprehensive error handling and logging
 */
app.use("*", async (c, next) => {
  try {
    // Check if userbot is enabled
    if (c.env.USERBOT_ENABLED === "true") {
      logger.info("[Userbot] Initializing userbot...");
      
      // Validate required environment variables
      const apiId = parseInt(c.env.USERBOT_API_ID || "");
      const apiHash = c.env.USERBOT_API_HASH || "";
      const authMode = (c.env.USERBOT_AUTH_MODE || 'bot') as 'bot' | 'user';
      const botToken = c.env.USERBOT_BOT_TOKEN || "";
      const phoneNumber = c.env.TELEGRAM_PHONE_NUMBER || "";
      
      // Common validation for both modes
      if (!apiId || isNaN(apiId) || !apiHash) {
        logger.error("[Userbot] Missing or invalid common required environment variables", {
          hasApiId: !!apiId && !isNaN(apiId),
          hasApiHash: !!apiHash,
          apiId: apiId,
          apiHashLength: apiHash?.length
        });
        await next();
        return;
      }
      
      // Mode-specific validation
      if (authMode === 'bot' && !botToken) {
        logger.error("[Userbot] Missing bot token for bot mode", {
          authMode,
          hasBotToken: !!botToken
        });
        await next();
        return;
      }
      
      if (authMode === 'user' && !phoneNumber) {
        logger.error("[Userbot] Missing phone number for user mode", {
          authMode,
          hasPhoneNumber: !!phoneNumber
        });
        await next();
        return;
      }
      
      // Create userbot configuration based on auth mode
      const userbotConfig: UserbotConfig = {
        apiId,
        apiHash,
        authMode,
        // Mode-specific configuration
        ...(authMode === 'bot' ? { botToken } : {
          phoneNumber: c.env.TELEGRAM_PHONE_NUMBER,
          password: c.env.TELEGRAM_PASSWORD
        })
      };
      
      // Create userbot client with error handling
      let userbotClient: UserbotClient;
      try {
        userbotClient = new UserbotClient(
          apiId,
          apiHash,
          authMode === 'bot' ? botToken : undefined
        );
        logger.info("[Userbot] Userbot client created successfully", { authMode });
      } catch (error) {
        logger.error("[Userbot] Failed to create userbot client", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          authMode
        });
        await next();
        return;
      }
      
      // Try to load existing session from KV with enhanced error handling
      let sessionString: string | null = null;
      try {
        if (c.env.NAMESPACE) {
          sessionString = await UserbotAuth.loadSession(c.env);
          if (sessionString) {
            logger.info("[Userbot] Loaded existing session from KV");
            try {
              userbotClient.loadSession(sessionString);
              logger.info("[Userbot] Session loaded successfully");
            } catch (loadError) {
              logger.error("[Userbot] Failed to load session into client", {
                error: loadError instanceof Error ? loadError.message : String(loadError)
              });
              sessionString = null; // Reset to force new session
            }
          }
        } else {
          logger.warn("[Userbot] KV namespace not available, session persistence disabled");
        }
      } catch (error) {
        logger.error("[Userbot] Failed to load session from KV", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
      }
      
      // Start the userbot client with comprehensive error handling
      let isClientStarted = false;
      try {
        if (authMode === 'bot') {
          await userbotClient.start();
        } else {
          // User mode requires phone number and optional password
          await userbotClient.start(
            c.env.TELEGRAM_PHONE_NUMBER,
            c.env.TELEGRAM_PASSWORD
          );
        }
        isClientStarted = true;
        logger.info("[Userbot] Userbot client started successfully", { authMode });
        
        // Save session if it's new or KV is available
        if (!sessionString && c.env.NAMESPACE) {
          try {
            const newSessionString = userbotClient.getSessionString();
            if (newSessionString) {
              await UserbotAuth.saveSession(c.env, newSessionString);
              logger.info("[Userbot] Saved new session to KV");
            }
          } catch (saveError) {
            logger.error("[Userbot] Failed to save session to KV", {
              error: saveError instanceof Error ? saveError.message : String(saveError)
            });
          }
        }
      } catch (error) {
        logger.error("[Userbot] Failed to start userbot client", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          isRecoverable: error instanceof Error && error.message.includes('Network')
        });
        
        // Try to continue without userbot if authentication fails
        if (error instanceof Error && error.message.includes('Authentication failed')) {
          logger.warn("[Userbot] Authentication failed, continuing without userbot functionality");
          await next();
          return;
        }
      }
      
      // Only proceed with context and handlers if client is started
      if (!isClientStarted) {
        logger.warn("[Userbot] Client not started, skipping userbot initialization");
        await next();
        return;
      }
      
      // Create userbot context with error handling
      let userbotContext: UserbotContext;
      try {
        userbotContext = {
          client: userbotClient.getClient(),
          session: {
            sessionString: userbotClient.getSessionString(),
            createdAt: Date.now(),
            isValid: true
          },
          config: userbotConfig,
          metadata: {
            eventName: 'userbot_init',
            timestamp: Date.now()
          }
        };
        logger.info("[Userbot] Userbot context created successfully");
      } catch (error) {
        logger.error("[Userbot] Failed to create userbot context", {
          error: error instanceof Error ? error.message : String(error)
        });
        await next();
        return;
      }
      
      // Create userbot handlers with error handling
      let userbotHandlers: UserbotHandlers;
      try {
        userbotHandlers = new UserbotHandlers(userbotClient, userbotContext);
        logger.info("[Userbot] Userbot handlers created successfully");
      } catch (error) {
        logger.error("[Userbot] Failed to create userbot handlers", {
          error: error instanceof Error ? error.message : String(error)
        });
        await next();
        return;
      }
      
      // Register default handlers with error handling
      try {
        await userbotHandlers.registerAllHandlers();
        logger.info("[Userbot] Registered default handlers successfully");
      } catch (error) {
        logger.error("[Userbot] Failed to register handlers", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        // Continue without handlers but still provide basic functionality
      }
      
      // Store userbot instances in context
      try {
        c.set("userbotClient", userbotClient);
        c.set("userbotHandlers", userbotHandlers);
        c.set("userbotContext", userbotContext);
        logger.info("[Userbot] Userbot instances stored in context successfully");
      } catch (error) {
        logger.error("[Userbot] Failed to store userbot instances in context", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      logger.info("[Userbot] Userbot initialization completed successfully");
    } else {
      logger.info("[Userbot] Userbot is disabled (USERBOT_ENABLED != 'true')");
    }
  } catch (error) {
    // Catch-all error handler for unexpected errors
    logger.error("[Userbot] Unexpected error during initialization", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      isCritical: true
    });
    
    // Continue with the request even if userbot initialization fails
    // This ensures the main bot functionality remains available
  }
  
  await next();
});

// Video analysis job completion webhook
app.post("/webhook/video-analysis", async (c) => {
  logger.info("[Video Job Webhook] Received completion notification");

  // Log specific headers for debugging (Hono Request doesn't support full header iteration)
  const importantHeaders = {
    'content-type': c.req.header('Content-Type'),
    'content-length': c.req.header('Content-Length'),
    'x-webhook-secret': c.req.header('X-Webhook-Secret'),
    'user-agent': c.req.header('User-Agent')
  };
  logger.info("[Video Job Webhook] Request headers", { headers: importantHeaders });

  // Log request details
  const contentType = c.req.header("Content-Type");
  const userAgent = c.req.header("User-Agent");
  const contentLength = c.req.header("Content-Length");
  
  logger.info("[Video Job Webhook] Request details", {
    contentType,
    userAgent,
    contentLength,
    method: c.req.method,
    url: c.req.url
  });

  // Check environment variables
  logger.info("[Video Job Webhook] Environment check", {
    hasWebhookSecret: !!c.env.WEBHOOK_SECRET,
    webhookSecretLength: c.env.WEBHOOK_SECRET?.length || 0,
    hasNamespace: !!c.env.NAMESPACE
  });

  // Verify webhook secret environment configuration
  if (!c.env.WEBHOOK_SECRET) {
    logger.error("[Video Job Webhook] WEBHOOK_SECRET environment variable not configured");
    return new Response(JSON.stringify({
      error: "Server configuration error",
      message: "WEBHOOK_SECRET environment variable is not configured on the server",
      help: "Please contact the administrator to ensure the webhook secret is properly set"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Verify webhook secret
  const providedSecret = c.req.header("X-Webhook-Secret");
  if (!providedSecret) {
    logger.error("[Video Job Webhook] Missing webhook secret header");
    return new Response(JSON.stringify({
      error: "Authentication failed",
      message: "Missing required 'X-Webhook-Secret' header",
      help: "Ensure your webhook request includes the 'X-Webhook-Secret' header with the correct secret value"
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  logger.info("[Video Job Webhook] Webhook secret validation", {
    providedSecretLength: providedSecret.length,
    expectedSecretLength: c.env.WEBHOOK_SECRET.length,
    secretsMatch: providedSecret === c.env.WEBHOOK_SECRET
  });

  if (providedSecret !== c.env.WEBHOOK_SECRET) {
    logger.error("[Video Job Webhook] Webhook secret mismatch");
    return new Response(JSON.stringify({
      error: "Authentication failed",
      message: "Invalid webhook secret provided",
      help: "Verify that the 'X-Webhook-Secret' header contains the correct secret value"
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload: VideoAnalysisWebhookPayload;
  let rawBody: string = "";
  
  try {
    // Get raw body first for debugging
    rawBody = await c.req.text();
    logger.info("[Video Job Webhook] Raw payload received", {
      payloadSize: rawBody.length,
      payloadPreview: rawBody.substring(0, 500) + (rawBody.length > 500 ? "..." : "")
    });

    // Check payload size (Cloudflare Workers have a 100MB limit, but let's be reasonable)
    const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB limit for webhook payloads
    if (rawBody.length > MAX_PAYLOAD_SIZE) {
      logger.error("[Video Job Webhook] Payload too large", {
        size: rawBody.length,
        maxSize: MAX_PAYLOAD_SIZE,
        sizeInMB: Math.round(rawBody.length / (1024 * 1024)),
        maxSizeInMB: Math.round(MAX_PAYLOAD_SIZE / (1024 * 1024))
      });
      return new Response(JSON.stringify({
        error: "Payload too large",
        message: `Webhook payload size (${Math.round(rawBody.length / (1024 * 1024))}MB) exceeds maximum allowed size (${Math.round(MAX_PAYLOAD_SIZE / (1024 * 1024))}MB)`,
        help: "Reduce the size of your webhook payload or contact support if you need larger payloads"
      }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate JSON structure before parsing
    if (!rawBody.trim().startsWith('{') || !rawBody.trim().endsWith('}')) {
      logger.error("[Video Job Webhook] Invalid JSON structure", {
        startsWithBrace: rawBody.trim().startsWith('{'),
        endsWithBrace: rawBody.trim().endsWith('}'),
        firstChars: rawBody.substring(0, 10),
        lastChars: rawBody.substring(Math.max(0, rawBody.length - 10)),
        trimmedLength: rawBody.trim().length
      });
      return new Response(JSON.stringify({
        error: "Invalid JSON structure",
        message: "Webhook payload must be a valid JSON object starting with '{' and ending with '}'",
        help: "Ensure your webhook payload is properly formatted as a JSON object",
        debug: {
          startsWithBrace: rawBody.trim().startsWith('{'),
          endsWithBrace: rawBody.trim().endsWith('}'),
          firstChars: rawBody.substring(0, 10),
          lastChars: rawBody.substring(Math.max(0, rawBody.length - 10))
        }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse JSON with error handling
    const parsedPayload: unknown = JSON.parse(rawBody);
    payload = parsedPayload as VideoAnalysisWebhookPayload;
    
    // Safe logging without 'any' types
    const isObject = typeof parsedPayload === 'object' && parsedPayload !== null;
    logger.info("[Video Job Webhook] JSON parsing successful", {
      isObject,
      hasJobId: isObject && 'job_id' in parsedPayload,
      hasStatus: isObject && 'status' in parsedPayload,
      hasCallbackData: isObject && 'callback_data' in parsedPayload
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "Unknown";
    const isSyntaxError = error instanceof SyntaxError;
    
    logger.error("[Video Job Webhook] JSON parsing failed", {
      error: errorMessage,
      errorName: errorName,
      rawBodyLength: rawBody.length,
      rawBodyPreview: rawBody.substring(0, 200) || "No body",
      isParseError: isSyntaxError
    });
    
    return new Response(JSON.stringify({
      error: "Invalid JSON format",
      message: "Failed to parse webhook payload as valid JSON",
      help: "Ensure your webhook payload is valid JSON format",
      debug: {
        errorType: errorName,
        errorMessage: isSyntaxError ? errorMessage : "JSON parsing error",
        rawBodyLength: rawBody.length,
        rawBodyPreview: rawBody.substring(0, 200) || "No body",
        isSyntaxError: isSyntaxError
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Log payload structure for debugging - using unknown type for safety
  const unknownPayload = payload as unknown;
  const hasJobId = unknownPayload && typeof unknownPayload === 'object' && 'job_id' in unknownPayload;
  const hasStatus = unknownPayload && typeof unknownPayload === 'object' && 'status' in unknownPayload;
  const hasCallbackData = unknownPayload && typeof unknownPayload === 'object' && 'callback_data' in unknownPayload;
  
  logger.info("[Video Job Webhook] Payload structure", {
    hasJobId,
    hasStatus,
    hasCallbackData,
    payloadType: typeof unknownPayload,
    isObject: typeof unknownPayload === 'object' && unknownPayload !== null
  });

  // Validate payload structure with detailed logging
  if (!isValidWebhookPayload(payload)) {
    logger.error("[Video Job Webhook] Payload validation failed - see isValidWebhookPayload logs for details");
    
    // Provide detailed error information about expected payload structure
    return new Response(JSON.stringify({
      error: "Invalid payload structure",
      message: "Webhook payload does not match expected format",
      help: "Ensure your payload follows the required structure for video analysis webhooks",
      expectedStructure: {
        job_id: "string (required)",
        status: "'completed' or 'failed' (required)",
        callback_data: {
          chat_id: "number (required)",
          message_id: "number (required)",
          bot_token: "string (required)"
        },
        result: {
          recipe_text: "string (required when status='completed')",
          recipe_title: "string (required when status='completed')",
          recipe_ready: "boolean (required when status='completed')"
        },
        error: "string (optional, when status='failed')",
        error_type: "'size_context_limit' | 'processing_error' | 'network_error' | 'unknown_error' (optional)",
        error_details: {
          max_size_mb: "number (optional)",
          max_duration_seconds: "number (optional)",
          max_frames: "number (optional)",
          suggested_actions: "string[] (optional)"
        }
      },
      receivedPayload: {
        hasJobId: hasJobId,
        hasStatus: hasStatus,
        hasCallbackData: hasCallbackData,
        payloadType: typeof unknownPayload,
        isObject: typeof unknownPayload === 'object' && unknownPayload !== null
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  logger.info("[Video Job Webhook] Payload validation passed");

  // Process the webhook
  const result = await handleVideoJobWebhook(
    payload,
    c.env.WEBHOOK_SECRET,
    providedSecret,
    c.env.NAMESPACE,
  );

  if (!result.success) {
    logger.error("[Video Job Webhook] Processing failed", {
      error: result.error,
    });
    
    // Check if it's a "Job not found" error
    if (result.error === "Job not found") {
      logger.warn("[Video Job Webhook] Job not found - likely already processed or expired", {
        jobId: payload.job_id
      });
      // Return 200 OK to acknowledge receipt and prevent retries
      // The job might have been already processed or expired
      return new Response("Job not found - acknowledged", { status: 200 });
    }
    
    // For other errors, return 400 with detailed error information
    return new Response(JSON.stringify({
      error: "Processing failed",
      message: result.error || "Failed to process webhook payload",
      help: "Check the webhook payload format and ensure all required fields are properly formatted",
      debug: {
        jobId: payload.job_id,
        status: payload.status,
        processingError: result.error
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  logger.info("[Video Job Webhook] Successfully processed job completion");
  return new Response("OK", { status: 200 });
});

// Bot webhook handler
app.post(WEBHOOK, async (c) => {
  logger.info("[Webhook] Received update");

  if (
    c.req.header("X-Telegram-Bot-Api-Secret-Token") !== c.env.ENV_BOT_SECRET
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: Update;
  try {
    update = await c.req.json();
  } catch (error) {
    logger.error("[Webhook] Invalid JSON", { error });
    return new Response("Bad Request", { status: 400 });
  }

  // Log all incoming messages for debugging
  if (update.message) {
    logger.info("[Message] Received message", {
      messageId: update.message.message_id,
      chatId: update.message.chat.id,
      chatType: update.message.chat.type,
      userId: update.message.from?.id,
      username: update.message.from?.username,
      text: update.message.text,
      messageType: update.message.text ? 'text' : 'other',
      timestamp: new Date(update.message.date * 1000).toISOString()
    });
  } else if (update.callback_query) {
    logger.info("[Message] Received callback query", {
      callbackQueryId: update.callback_query.id,
      userId: update.callback_query.from.id,
      username: update.callback_query.from.username,
      data: update.callback_query.data,
      message: update.callback_query.message?.message_id
    });
  } else if (update.edited_message) {
    logger.info("[Message] Received edited message", {
      messageId: update.edited_message.message_id,
      chatId: update.edited_message.chat.id,
      chatType: update.edited_message.chat.type,
      userId: update.edited_message.from?.id,
      username: update.edited_message.from?.username,
      text: update.edited_message.text,
      timestamp: new Date(update.edited_message.date * 1000).toISOString()
    });
  }

  try {
    if (update.callback_query) {
      logger.info("[Webhook] Processing callback query", {
        data: update.callback_query.data,
      });
      const success = await handleCallbackQuery(
        c.env.ENV_BOT_TOKEN,
        update.callback_query,
        c.env.NH_API_URL,
      );
      if (!success) {
        logger.error("[Webhook] Error handling callback query");
        return new Response("OK", { status: 200 }); // Still return 200 to acknowledge receipt
      }
      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/nh")) {
      logger.info("[Webhook] Processing command: /nh");
      logger.info("[Webhook] Bucket binding status", {
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
          logger.error("[Webhook] Error handling NH command", {
            description: response.description,
          });
        }
        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling NH command", { error });
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/read")) {
      logger.info("[Webhook] Processing command: /read");
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
          logger.error("[Webhook] /read command received without text");
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
        logger.error("[Webhook] Error handling /read command", { error });
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
      logger.info("[Webhook] Processing command: /getpdf");
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
          logger.error("[Webhook] /getpdf command received without text");
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
          logger.info("[Webhook /getpdf] Initial status message sent", {
            statusMessageId,
          });
        } else {
          logger.error(
            "[Webhook /getpdf] Failed to send initial status message or get its ID",
            { galleryId, response: initialMessageResponse },
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
              logger.warn("[Webhook /getpdf Progress Error]", {
                galleryId,
                error: status.error,
              });
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
            logger.error("[Webhook /getpdf] Failed to edit status message", {
              statusMessageId,
              galleryId,
              error: editError,
            });
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
          logger.error("[Webhook /getpdf] Failed to send PDF", {
            galleryId,
            status: sendResult.ok,
          });
          // Corrected editMessageText call
          if (statusMessageId)
            await editMessageText(
              { chat_id: chatId, message_id: statusMessageId, text: errorMsg },
              botToken,
            );
          else await sendPlainText(botToken, chatId, errorMsg); // Send separately if status updates failed
        } else {
          const successMsg = `✅ Successfully sent PDF for gallery ${galleryId} (${fileName}).`;
          logger.info("[Webhook /getpdf] Successfully sent PDF", { galleryId });
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
        logger.error("[Webhook /getpdf] Initial processing error", { error });
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
            logger.error(
              "[Webhook /getpdf] Failed to send initial processing error message",
              { error: sendError },
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
                logger.warn("[Webhook /getpdf Task Progress Error]", {
                  galleryId,
                  error: status.error,
                });
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
              logger.error(
                "[Webhook /getpdf Task] Failed to edit status message",
                { taskStatusMessageId, galleryId, error: editError },
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
            logger.error("[Webhook /getpdf Task] Failed to send PDF", {
              galleryId,
              status: sendResult.ok,
            });
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
            logger.info("[Webhook /getpdf Task] Successfully sent PDF", {
              galleryId,
            });
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
          logger.error("[Webhook /getpdf Task] Unhandled error", {
            error: taskError,
          });
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
              logger.error(
                "[Webhook /getpdf Task] Failed to edit final error status message",
                { error: editError },
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
      logger.info("[Webhook] Status command received");

      const jobId = update.message.text.split(" ")[1];

      if (!jobId) {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "🔍 *Job Status Check*\n\n" +
            "Please provide a job ID:\n" +
            "`/status <job_id>`\n\n" +
            "Example: `/status abc12345`\n\n" +
            "💡 *Other commands:*\n" +
            "• Check webhook status: `/webhook_status <job_id>`",
        );
        return new Response("OK", { status: 200 });
      }

      try {
        const statusResult = await checkJobStatus(
          c.env.VIDEO_ANALYSIS_SERVICE_URL,
          jobId,
          c.env.NAMESPACE,
        );

        if (!statusResult.success || !statusResult.job) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            `❌ *Job Not Found*\n\n` +
              `Job ID: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n\n` +
              `This job may have:\n` +
              `• Already completed and been cleaned up\n` +
              `• Expired (jobs are kept for 24 hours)\n` +
              `• Never existed\n\n` +
              `💡 *Try:*\n` +
              `• Check webhook status: /webhook_status ${jobId}\n` +
              `• Send a new video for analysis`,
          );
        } else {
          const formattedStatus = formatJobStatusMessage(statusResult.job, statusResult.webhookStatus);
          let replyMarkup: any = undefined;
          
          // Add inline keyboard if webhook status allows for retry actions
          if (statusResult.webhookStatus) {
            // Import the function to create webhook action keyboard
            const { createWebhookActionKeyboard } = await import("../utils/video/handleWebhookCommands");
            const keyboardJson = createWebhookActionKeyboard(statusResult.webhookStatus);
            replyMarkup = JSON.parse(keyboardJson);
          }
          
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            formattedStatus.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&"),
            undefined,
            replyMarkup
          );
        }
      } catch (error) {
        logger.error("[Webhook] Error checking job status", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Status Check Failed*\n\n` +
            `Unable to check status for job: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n\n` +
            `This might be due to:\n` +
            `• Temporary service issue\n` +
            `• Network connectivity problem\n\n` +
            `💡 *Try:*\n` +
            `• Check webhook status: /webhook_status ${jobId}\n` +
            `Please try again in a few minutes\\.`,
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/webhook_status")) {
      logger.info("[Webhook] Webhook status command received");

      const jobId = update.message.text.split(" ")[1];

      if (!jobId) {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "📡 *Webhook Status Check*\n\n" +
            "Please provide a job ID:\n" +
            "`/webhook_status <job_id>`\n\n" +
            "Example: `/webhook_status abc12345`\n\n" +
            "💡 *Other commands:*\n" +
            "• Check job status: `/status <job_id>`\n" +
            "• Retry webhook: `/retry_webhook <job_id>`",
        );
        return new Response("OK", { status: 200 });
      }

      try {
        if (!c.env.NAMESPACE) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            `❌ *Webhook Status Unavailable*\n\n` +
              `Webhook status tracking is not configured\\.\n\n` +
              `This feature requires KV storage to be properly configured\\.\n\n` +
              `💡 *Try:*\n` +
              `• Check job status: /status ${jobId}\n` +
              `• Contact bot administrator for support`,
          );
          return new Response("OK", { status: 200 });
        }

        const webhookStatusResult = await getWebhookStatus(jobId, c.env.NAMESPACE);

        if (!webhookStatusResult.success) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            `❌ *Webhook Status Check Failed*\n\n` +
              `Unable to check webhook status for job: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n\n` +
              `Error: ${webhookStatusResult.error?.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\n\n` +
              `This might be due to:\n` +
              `• KV storage not configured\n` +
              `• Temporary service issue\n\n` +
              `💡 *Try:*\n` +
              `• Check job status: /status ${jobId}\n` +
              `Please try again in a few minutes\\.`,
          );
        } else {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            webhookStatusResult.formattedMessage?.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&") ||
            "📡 *Webhook Status*\n\nNo status information available.",
          );
        }
      } catch (error) {
        logger.error("[Webhook] Error checking webhook status", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Webhook Status Check Failed*\n\n` +
            `Unable to check webhook status for job: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n\n` +
            `This might be due to:\n` +
            `• Temporary service issue\n` +
            `• Network connectivity problem\n\n` +
            `💡 *Try:*\n` +
            `• Check job status: /status ${jobId}\n` +
            `Please try again in a few minutes\\.`,
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/retry_webhook")) {
      logger.info("[Webhook] Retry webhook command received");

      const commandParts = update.message.text.split(" ");
      const jobId = commandParts[1];
      const args = commandParts.slice(2);

      if (!jobId) {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "🔄 *Manual Webhook Retry*\n\n" +
            "Please provide a job ID:\n" +
            "`/retry_webhook <job_id>`\n\n" +
            "Optional: Add 'reset' to clear retry counters:\n" +
            "`/retry_webhook <job_id> reset`\n\n" +
            "Example: `/retry_webhook abc12345`"
        );
        return new Response("OK", { status: 200 });
      }

      try {
        if (!c.env.NAMESPACE) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Configuration Error*\n\n" +
              "KV storage is not properly configured\\.\n\n" +
              "Please contact the bot administrator to resolve this issue\\."
          );
          return new Response("OK", { status: 200 });
        }

        const result = await handleRetryWebhookCommand(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          jobId,
          c.env.VIDEO_ANALYSIS_SERVICE_URL,
          c.env.NAMESPACE,
          args
        );

        if (result.shouldReply && result.message) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            result.message
          );
        }
      } catch (error) {
        logger.error("[Webhook] Error handling retry webhook command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Webhook Retry Failed*\n\n` +
            `Unable to retry webhook for job: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n\n` +
            `This might be due to:\n` +
            `• Temporary service issue\n` +
            `• Network connectivity problem\n\n` +
            `💡 *Try:*\n` +
            `• Check webhook status: /webhook_status ${jobId}\n` +
            `Please try again in a few minutes\\.`
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/dead_letter_queue")) {
      logger.info("[Webhook] Dead letter queue command received");

      const commandParts = update.message.text.split(" ");
      const page = commandParts[1] ? parseInt(commandParts[1]) : 1;

      try {
        if (!c.env.NAMESPACE) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Configuration Error*\n\n" +
              "KV storage is not properly configured\\.\n\n" +
              "Please contact the bot administrator to resolve this issue\\."
          );
          return new Response("OK", { status: 200 });
        }

        const result = await handleDeadLetterQueueCommand(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          c.env.NAMESPACE,
          page
        );

        if (result.shouldReply && result.message) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            result.message
          );
        }
      } catch (error) {
        logger.error("[Webhook] Error handling dead letter queue command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Dead Letter Queue Check Failed*\n\n` +
            `Unable to retrieve dead letter queue information\\.\n\n` +
            `This might be due to:\n` +
            `• Temporary service issue\n` +
            `• KV storage not configured\n\n` +
            `💡 *Try:*\n` +
            `Please try again in a few minutes\\.`
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/retry_dead_letter")) {
      logger.info("[Webhook] Retry dead letter command received");

      const commandParts = update.message.text.split(" ");
      const entryId = commandParts[1];

      if (!entryId) {
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "🔄 *Retry Dead Letter Entry*\n\n" +
            "Please provide an entry ID:\n" +
            "`/retry_dead_letter <entry_id>`\n\n" +
            "💡 *To find entry IDs:*\n" +
            "• View dead letter queue: /dead_letter_queue\n\n" +
            "Example: `/retry_dead_letter dead_12345`"
        );
        return new Response("OK", { status: 200 });
      }

      try {
        if (!c.env.NAMESPACE) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Configuration Error*\n\n" +
              "KV storage is not properly configured\\.\n\n" +
              "Please contact the bot administrator to resolve this issue\\."
          );
          return new Response("OK", { status: 200 });
        }

        const result = await handleRetryDeadLetterCommand(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          entryId,
          c.env.VIDEO_ANALYSIS_SERVICE_URL,
          c.env.NAMESPACE
        );

        if (result.shouldReply && result.message) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            result.message
          );
        }
      } catch (error) {
        logger.error("[Webhook] Error handling retry dead letter command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Dead Letter Retry Failed*\n\n` +
            `Unable to retry dead letter entry: \`${entryId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n\n` +
            `This might be due to:\n` +
            `• Temporary service issue\n` +
            `• Network connectivity problem\n\n` +
            `💡 *Try:*\n` +
            `• Check dead letter queue: /dead_letter_queue\n` +
            `Please try again in a few minutes\\.`
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text?.startsWith("/clear_dead_letter")) {
      logger.info("[Webhook] Clear dead letter command received");

      const commandParts = update.message.text.split(" ");
      const args = commandParts.slice(1);

      try {
        if (!c.env.NAMESPACE) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Configuration Error*\n\n" +
              "KV storage is not properly configured\\.\n\n" +
              "Please contact the bot administrator to resolve this issue\\."
          );
          return new Response("OK", { status: 200 });
        }

        const result = await handleClearDeadLetterCommand(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          c.env.NAMESPACE,
          args
        );

        if (result.shouldReply && result.message) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            result.message
          );
        }
      } catch (error) {
        logger.error("[Webhook] Error handling clear dead letter command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          `❌ *Clear Dead Letter Queue Failed*\n\n` +
            `Unable to clear dead letter queue\\.\n\n` +
            `This might be due to:\n` +
            `• Temporary service issue\n` +
            `• KV storage not configured\n\n` +
            `💡 *Try:*\n` +
            `Please try again in a few minutes\\.`
        );
      }

      return new Response("OK", { status: 200 });
    } else if (update.message?.text === "/recipe") {
      logger.info("[Webhook] Recipe command received, waiting for video");

      await sendMarkdownV2Text(
        c.env.ENV_BOT_TOKEN,
        update.message.chat.id,
        "🎬 *Send me a cooking video\\!*\n\n" +
          "I'll analyze it and extract:\n" +
          "• Complete ingredients list\n" +
          "• Step\\-by\\-step instructions\n" +
          "• Cooking times and temperatures\n" +
          "• Tips and techniques\n\n" +
          "⚠️ *Important:* Video size will be validated by the analyzer service\n" +
          "_Processing is done asynchronously - you'll get a job ID to track progress_",
      );

      return new Response("OK", { status: 200 });
    } else if (
      update.message?.video ||
      update.message?.document?.mime_type?.startsWith("video/")
    ) {
      logger.info("[Webhook] Video received for async analysis");

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
          logger.error("[Webhook] Video analysis failed", {
            description: response.description,
          });
        }

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error in video analysis", { error });
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
        logger.error("[Webhook] Error sending ping response", { error });
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
      logger.info("[Webhook] Usage command received");
      try {
        const usageInfo = await getGeminiUsageInfo(c.env.NAMESPACE);
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          usageInfo,
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error sending usage response", { error });
        try {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Usage Check Failed*\n\nUnable to retrieve usage statistics\\. Please try again later\\.",
          );
        } catch (fallbackError) {
          logger.error("[Webhook] Fallback usage response failed", {
            error: fallbackError,
          });
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
          getHelpMessage(update.message.from?.first_name, c.env.USERBOT_ENABLED === "true"),
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error sending help/start response", { error });
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
            getHelpMessage(undefined, c.env.USERBOT_ENABLED === "true"),
          );
        } catch (error) {
          logger.error("[Webhook] Error sending group welcome message", {
            error,
          });
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
    } else if (update.message?.text?.startsWith("/userbot_start")) {
      logger.info("[Webhook] Userbot start command received");
      
      try {
        // Check if userbot is enabled
        if (c.env.USERBOT_ENABLED !== "true") {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Userbot Disabled*\n\n" +
              "Userbot functionality is not enabled\\.\n\n" +
              "💡 *To enable userbot:*\n" +
              "• Set USERBOT_ENABLED=true in environment variables\n" +
              "• Configure required userbot credentials\n" +
              "• Contact bot administrator for assistance",
          );
          return new Response("OK", { status: 200 });
        }

        // Check if userbot is already initialized
        const userbotClient = c.get("userbotClient");
        const userbotContext = c.get("userbotContext");
        
        if (userbotClient && userbotClient.isConnected()) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "✅ *Userbot Already Started*\n\n" +
              "The userbot client is already running and connected\\.\n\n" +
              "💡 *Available commands:*\n" +
              "• Check status: /userbot_status\n" +
              "• View user info: /userbot_info\n" +
              "• Send message: /userbot_send\n" +
              "• Stop userbot: /userbot_stop",
          );
          return new Response("OK", { status: 200 });
        }

        // Try to initialize userbot
        const apiId = parseInt(c.env.USERBOT_API_ID || "");
        const apiHash = c.env.USERBOT_API_HASH || "";
        const botToken = c.env.USERBOT_BOT_TOKEN || "";
        
        if (!apiId || isNaN(apiId) || !apiHash || !botToken) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Configuration Error*\n\n" +
              "Userbot configuration is incomplete\\.\n\n" +
              "Required environment variables:\n" +
              "• USERBOT_API_ID\n" +
              "• USERBOT_API_HASH\n" +
              "• USERBOT_BOT_TOKEN\n\n" +
              "💡 *Please contact bot administrator to complete configuration*",
          );
          return new Response("OK", { status: 200 });
        }

        // Create new userbot client
        const newUserbotClient = new UserbotClient(apiId, apiHash, botToken);
        
        // Try to load existing session
        let sessionString: string | null = null;
        if (c.env.NAMESPACE) {
          try {
            sessionString = await UserbotAuth.loadSession(c.env);
            if (sessionString) {
              newUserbotClient.loadSession(sessionString);
            }
          } catch (error) {
            logger.warn("[Userbot] Failed to load existing session", { error });
          }
        }

        // Start the client
        await newUserbotClient.start();
        
        // Save session if new
        if (!sessionString && c.env.NAMESPACE) {
          const newSessionString = newUserbotClient.getSessionString();
          if (newSessionString) {
            await UserbotAuth.saveSession(c.env, newSessionString);
          }
        }

        // Create userbot context
        const userbotConfig: UserbotConfig = {
          apiId,
          apiHash,
          botToken,
          authMode: 'bot'
        };
        
        const newUserbotContext: UserbotContext = {
          client: newUserbotClient.getClient(),
          session: {
            sessionString: newUserbotClient.getSessionString(),
            createdAt: Date.now(),
            isValid: true
          },
          config: userbotConfig,
          metadata: {
            eventName: 'userbot_manual_start',
            timestamp: Date.now()
          }
        };

        // Create handlers and register them
        const userbotHandlers = new UserbotHandlers(newUserbotClient, newUserbotContext);
        await userbotHandlers.registerAllHandlers();

        // Update context
        c.set("userbotClient", newUserbotClient);
        c.set("userbotHandlers", userbotHandlers);
        c.set("userbotContext", newUserbotContext);

        // Get user info for confirmation
        const userInfo = await newUserbotClient.getMe();
        
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "✅ *Userbot Started Successfully*\n\n" +
            `🤖 *User:* ${escapeMarkdown(userInfo.firstName || 'Unknown')} ${escapeMarkdown(userInfo.lastName || '')} (@${escapeMarkdown(userInfo.username || 'N/A')})\n` +
            `🆔 *User ID:* ${userInfo.id}\n` +
            `📱 *Phone:* ${userInfo.phone ? escapeMarkdown(userInfo.phone) : 'N/A'}\n` +
            `🔗 *Status:* Connected\n\n` +
            "💡 *Available commands:*\n" +
            "• Check status: /userbot_status\n" +
            "• View user info: /userbot_info\n" +
            "• Send message: /userbot_send\n" +
            "• Stop userbot: /userbot_stop\n" +
            "• View help: /userbot_help",
        );

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling userbot start command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "❌ *Failed to Start Userbot*\n\n" +
            "An error occurred while starting the userbot client\\.\n\n" +
            `🔍 *Error:* ${escapeMarkdown(error instanceof Error ? error.message : String(error))}\n\n` +
            "💡 *Troubleshooting:*\n" +
            "• Check environment configuration\n" +
            "• Verify API credentials\n" +
            "• Try again in a few minutes\n" +
            "• Contact administrator if issue persists",
        );
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/userbot_stop")) {
      logger.info("[Webhook] Userbot stop command received");
      
      try {
        // Check if userbot is enabled
        if (c.env.USERBOT_ENABLED !== "true") {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Userbot Disabled*\n\n" +
              "Userbot functionality is not enabled\\.",
          );
          return new Response("OK", { status: 200 });
        }

        const userbotClient = c.get("userbotClient");
        const userbotContext = c.get("userbotContext");

        if (!userbotClient || !userbotClient.isConnected()) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "ℹ️ *Userbot Not Running*\n\n" +
              "The userbot client is not currently running\\.\n\n" +
              "💡 *To start userbot:*\n" +
              "• Use /userbot_start command\n" +
              "• Ensure userbot is enabled in configuration",
          );
          return new Response("OK", { status: 200 });
        }

        // Disconnect the client
        await userbotClient.disconnect();
        
        // Clear session from KV storage
        if (c.env.NAMESPACE) {
          try {
            await UserbotAuth.clearSession(c.env);
          } catch (error) {
            logger.warn("[Userbot] Failed to clear session from KV", { error });
          }
        }

        // Clear context
        c.set("userbotClient", undefined);
        c.set("userbotHandlers", undefined);
        c.set("userbotContext", undefined);

        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "✅ *Userbot Stopped Successfully*\n\n" +
            "The userbot client has been disconnected\\.\n\n" +
            "🗑️ *Session cleared* from storage\n\n" +
            "💡 *To restart:*\n" +
            "• Use /userbot_start command",
        );

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling userbot stop command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "❌ *Failed to Stop Userbot*\n\n" +
            "An error occurred while stopping the userbot client\\.\n\n" +
            `🔍 *Error:* ${escapeMarkdown(error instanceof Error ? error.message : String(error))}\n\n` +
            "💡 *Try again or contact administrator if issue persists*",
        );
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/userbot_status")) {
      logger.info("[Webhook] Userbot status command received");
      
      try {
        // Check if userbot is enabled
        if (c.env.USERBOT_ENABLED !== "true") {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Userbot Disabled*\n\n" +
              "Userbot functionality is not enabled\\.",
          );
          return new Response("OK", { status: 200 });
        }

        const userbotClient = c.get("userbotClient");
        const userbotContext = c.get("userbotContext");

        if (!userbotClient) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "ℹ️ *Userbot Not Initialized*\n\n" +
              "The userbot client has not been initialized\\.\n\n" +
              "💡 *To start userbot:*\n" +
              "• Use /userbot_start command",
          );
          return new Response("OK", { status: 200 });
        }

        const isConnected = userbotClient.isConnected();
        const hasValidSession = userbotContext?.session?.isValid || false;
        const sessionAge = userbotContext?.session?.createdAt
          ? Math.floor((Date.now() - userbotContext.session.createdAt) / 1000)
          : 0;

        let userInfo = null;
        if (isConnected) {
          try {
            userInfo = await userbotClient.getMe();
          } catch (error) {
            logger.warn("[Userbot] Failed to get user info", { error });
          }
        }

        const statusMessage = `📊 *Userbot Status*

🔌 *Connection Status:* ${isConnected ? '✅ Connected' : '❌ Disconnected'}
🆔 *Session Valid:* ${hasValidSession ? '✅ Yes' : '❌ No'}
⏱️ *Session Age:* ${sessionAge}s

${userInfo ? `
👤 *User Information:*
• *Name:* ${escapeMarkdown(userInfo.firstName || 'Unknown')} ${escapeMarkdown(userInfo.lastName || '')}
• *Username:* @${escapeMarkdown(userInfo.username || 'N/A')}
• *User ID:* ${userInfo.id}
• *Phone:* ${userInfo.phone ? escapeMarkdown(userInfo.phone) : 'N/A'}
• *Bot:* ${userInfo.bot ? 'Yes' : 'No'}
` : '👤 *User Information:* Not available (disconnected)'}

${userbotContext?.metadata ? `
🔧 *System Information:*
• *Last Event:* ${escapeMarkdown(userbotContext.metadata.eventName || 'N/A')}
• *Timestamp:* ${new Date(userbotContext.metadata.timestamp).toLocaleString()}
` : ''}

💡 *Available Commands:*
• Start userbot: /userbot_start
• Stop userbot: /userbot_stop
• View user info: /userbot_info
• Send message: /userbot_send
• View help: /userbot_help`;

        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          statusMessage
        );

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling userbot status command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "❌ *Failed to Get Status*\n\n" +
            "An error occurred while retrieving userbot status\\.\n\n" +
            `🔍 *Error:* ${escapeMarkdown(error instanceof Error ? error.message : String(error))}`,
        );
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/userbot_info")) {
      logger.info("[Webhook] Userbot info command received");
      
      try {
        // Check if userbot is enabled
        if (c.env.USERBOT_ENABLED !== "true") {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Userbot Disabled*\n\n" +
              "Userbot functionality is not enabled\\.",
          );
          return new Response("OK", { status: 200 });
        }

        const userbotClient = c.get("userbotClient");

        if (!userbotClient || !userbotClient.isConnected()) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "ℹ️ *Userbot Not Connected*\n\n" +
              "The userbot client is not currently connected\\.\n\n" +
              "💡 *To start userbot:*\n" +
              "• Use /userbot_start command",
          );
          return new Response("OK", { status: 200 });
        }

        // Get user information
        const userInfo = await userbotClient.getMe();

        const infoMessage = `👤 *Userbot User Information*

🆔 *Basic Information:*
• *First Name:* ${escapeMarkdown(userInfo.firstName || 'N/A')}
• *Last Name:* ${escapeMarkdown(userInfo.lastName || 'N/A')}
• *Username:* @${escapeMarkdown(userInfo.username || 'N/A')}
• *User ID:* ${userInfo.id}
• *Bot Account:* ${userInfo.bot ? 'Yes' : 'No'}

📱 *Contact Information:*
• *Phone Number:* ${userInfo.phone ? escapeMarkdown(userInfo.phone) : 'Not set'}
• *Verified:* ${userInfo.verified ? 'Yes' : 'No'}
• *Restricted:* ${userInfo.restricted ? 'Yes' : 'No'}

🌐 *Language Settings:*
• *Language Code:* ${escapeMarkdown(userInfo.langCode || 'N/A')}

📊 *Account Status:*
• *Status:* ${userInfo.bot ? 'Bot Account' : 'User Account'}
• *Connection:* ✅ Connected
• *Session:* Active

💡 *Available Commands:*
• Check status: /userbot_status
• Send message: /userbot_send
• Stop userbot: /userbot_stop`;

        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          infoMessage
        );

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling userbot info command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "❌ *Failed to Get User Info*\n\n" +
            "An error occurred while retrieving userbot user information\\.\n\n" +
            `🔍 *Error:* ${escapeMarkdown(error instanceof Error ? error.message : String(error))}`,
        );
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/userbot_send")) {
      logger.info("[Webhook] Userbot send command received");
      
      try {
        // Check if userbot is enabled
        if (c.env.USERBOT_ENABLED !== "true") {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Userbot Disabled*\n\n" +
              "Userbot functionality is not enabled\\.",
          );
          return new Response("OK", { status: 200 });
        }

        const userbotClient = c.get("userbotClient");

        if (!userbotClient || !userbotClient.isConnected()) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "ℹ️ *Userbot Not Connected*\n\n" +
              "The userbot client is not currently connected\\.\n\n" +
              "💡 *To start userbot:*\n" +
              "• Use /userbot_start command",
          );
          return new Response("OK", { status: 200 });
        }

        // Parse command: /userbot_send <peer> <message>
        const commandParts = update.message.text.split(' ');
        if (commandParts.length < 3) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Invalid Command Format*\n\n" +
              "Please provide both peer and message\\.\n\n" +
              "📝 *Usage:*\n" +
              "`/userbot_send <peer> <message>`\n\n" +
              "🔍 *Examples:*\n" +
              "• Send to user ID: `/userbot_send 123456789 Hello there\\!`\n" +
              "• Send to username: `/userbot_send username Hello there\\!`\n" +
              "• Send to chat: `/userbot_send -100123456789 Hello group\\!`\n\n" +
              "💡 *Tips:*\n" +
              "• User IDs are numeric\\.\n" +
              "• Usernames start with @\\.\n" +
              "• Chat IDs are negative and usually start with -100",
          );
          return new Response("OK", { status: 200 });
        }

        const peer = commandParts[1];
        const messageText = commandParts.slice(2).join(' ');

        if (!peer || !messageText.trim()) {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Missing Parameters*\n\n" +
              "Both peer and message are required\\.\n\n" +
              "📝 *Usage:*\n" +
              "`/userbot_send <peer> <message>`",
          );
          return new Response("OK", { status: 200 });
        }

        // Parse peer (handle different formats)
        let parsedPeer: number | string = peer;
        if (peer.startsWith('@')) {
          // Username format
          parsedPeer = peer.substring(1);
        } else if (peer.startsWith('-100')) {
          // Supergroup/channel format
          parsedPeer = parseInt(peer);
        } else if (!isNaN(parseInt(peer))) {
          // User ID format
          parsedPeer = parseInt(peer);
        }

        // Send the message
        const sentMessage = await userbotClient.sendMessage(parsedPeer, messageText);

        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "✅ *Message Sent Successfully*\n\n" +
            `📤 *To:* ${escapeMarkdown(peer)}\n` +
            `💬 *Message:* ${escapeMarkdown(messageText)}\n` +
            `🆔 *Message ID:* ${sentMessage.id}\n` +
            `⏰ *Sent at:* ${new Date(sentMessage.date * 1000).toLocaleString()}\n\n` +
            "💡 *The message has been delivered using the userbot client*",
        );

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling userbot send command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "❌ *Failed to Send Message*\n\n" +
            "An error occurred while sending the message\\.\n\n" +
            `🔍 *Error:* ${escapeMarkdown(error instanceof Error ? error.message : String(error))}\n\n` +
            "💡 *Troubleshooting:*\n" +
            "• Verify the peer ID/username is correct\n" +
            "• Ensure the userbot has permission to message the target\n" +
            "• Check if the target exists and is accessible\n" +
            "• Try again in a few minutes",
        );
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/userbot_help")) {
      logger.info("[Webhook] Userbot help command received");
      
      try {
        // Check if userbot is enabled
        if (c.env.USERBOT_ENABLED !== "true") {
          await sendMarkdownV2Text(
            c.env.ENV_BOT_TOKEN,
            update.message.chat.id,
            "❌ *Userbot Disabled*\n\n" +
              "Userbot functionality is not enabled\\.",
          );
          return new Response("OK", { status: 200 });
        }

        const userbotClient = c.get("userbotClient");
        const isConnected = userbotClient?.isConnected() || false;

        const helpMessage = `🤖 *Userbot Help*

📚 *Available Commands:*

🚀 *Start/Stop:*
• \`/userbot_start\` - Start the userbot client
• \`/userbot_stop\` - Stop the userbot client

📊 *Information:*
• \`/userbot_status\` - Check userbot connection status
• \`/userbot_info\` - Get userbot user information

💬 *Messaging:*
• \`/userbot_send <peer> <message>\` - Send a message using the userbot

❓ *Help:*
• \`/userbot_help\` - Show this help message

📝 *Usage Examples:*

*Starting Userbot:*
\`/userbot_start\`

*Checking Status:*
\`/userbot_status\`

*Sending Messages:*
• To user ID: \`/userbot_send 123456789 Hello there\\!\`
• To username: \`/userbot_send @username Hello there\\!\`
• To group: \`/userbot_send -100123456789 Hello group\\!\`

*Getting User Info:*
\`/userbot_info\`

⚙️ *Current Status:*
• Userbot Enabled: ✅ Yes
• Userbot Connected: ${isConnected ? '✅ Yes' : '❌ No'}

💡 *Tips:*
• Userbot must be started before using other commands
• Peer can be user ID, username, or chat ID
• Usernames should include @ symbol
• Group/chat IDs usually start with -100
• Use /userbot_status to check connection

🔧 *Requirements:*
• USERBOT_ENABLED=true
• USERBOT_API_ID
• USERBOT_API_HASH
• USERBOT_BOT_TOKEN`;

        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          helpMessage
        );

        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error handling userbot help command", { error });
        await sendMarkdownV2Text(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "❌ *Failed to Show Help*\n\n" +
            "An error occurred while displaying help information\\.\n\n" +
            `🔍 *Error:* ${escapeMarkdown(error instanceof Error ? error.message : String(error))}`,
        );
        return new Response("OK", { status: 200 });
      }
    } else if (update.message?.text?.startsWith("/")) {
      try {
        await sendPlainText(
          c.env.ENV_BOT_TOKEN,
          update.message.chat.id,
          "Unknown command. Type /help to see available commands.",
        );
        return new Response("OK", { status: 200 });
      } catch (error) {
        logger.error("[Webhook] Error sending unknown command response", {
          error,
        });
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
    logger.error("[Webhook] Error", { error });
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

  logger.info("[Register Webhook] Attempting to register webhook URL", {
    webhookUrl,
  });

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
    logger.info("[Register Webhook] Successfully registered webhook");
  } else {
    logger.error("[Register Webhook] Failed to register webhook", {
      response: r,
    });
  }

  return c.text(r.ok ? "Ok" : JSON.stringify(r, null, 2));
});

// Unregister webhook
app.get("/unRegisterWebhook", async (c: Context<{ Bindings: Env }>) => {
  logger.info("[Unregister Webhook] Attempting to remove webhook");

  const r: TelegramResponse = await (
    await fetch(apiUrl(c.env.ENV_BOT_TOKEN, "setWebhook", { url: "" }))
  ).json();

  if (r.ok) {
    logger.info("[Unregister Webhook] Successfully removed webhook");
  } else {
    logger.error("[Unregister Webhook] Failed to remove webhook", {
      response: r,
    });
  }

  return c.text(r.ok ? "Ok" : JSON.stringify(r, null, 2));
});

// Export the app
export default app;
