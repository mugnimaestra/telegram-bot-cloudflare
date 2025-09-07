/**
 * Handlers for webhook management commands and user interactions
 */

import type { WebhookDeliveryStatus } from "./webhookDeliveryStatus";
import type { DeadLetterEntry } from "./webhookRetryHandler";
import { 
  manualRetryWebhookWithStatus, 
  resetAndRetryWebhook, 
  canRetryWebhook,
  getWebhookRetryStats,
  formatManualRetryResult
} from "./retryWebhookDelivery";
import { 
  getDeadLetterQueueStats, 
  getDeadLetterQueueEntries,
  retryDeadLetterEntry,
  clearDeadLetterQueue,
  formatDeadLetterQueueStats,
  formatDeadLetterEntry
} from "./manageDeadLetterQueue";
import { getWebhookDeliveryStatus } from "./webhookDeliveryStatus";
import {
  getWebhookStatusWithRetry,
  isWebhookRetryable,
  isWebhookFinal
} from "./getWebhookStatus";
import { 
  formatWebhookStatusMessage,
  formatDeadLetterEntry as formatDeadLetterMessage,
  formatClearDeadLetterConfirmation,
  formatWebhookRetryResult,
  formatWebhookRetryStats
} from "./formatWebhookMessage";
import { logger } from "@/utils/logger";
import { sendMarkdownV2Text } from "@/utils/telegram/sendMarkdownV2Text";
import { sendPlainText } from "@/utils/telegram/sendPlainText";
import { escapeMarkdown } from "@/utils/telegram/escapeMarkdown";

/**
 * Interface for command handling result
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
  shouldReply?: boolean;
}

/**
 * Handle /retry_webhook <job_id> command
 */
export async function handleRetryWebhookCommand(
  botToken: string,
  chatId: number,
  jobId: string,
  serviceUrl: string,
  kvNamespace: KVNamespace,
  args: string[] = []
): Promise<CommandResult> {
  try {
    logger.info("Handling retry webhook command", { jobId, args });

    if (!jobId) {
      return {
        success: false,
        message: "🔄 *Manual Webhook Retry*\n\n" +
                 "Please provide a job ID:\n" +
                 "`/retry_webhook <job_id>`\n\n" +
                 "Optional: Add 'reset' to clear retry counters:\n" +
                 "`/retry_webhook <job_id> reset`\n\n" +
                 "Example: `/retry_webhook abc12345`",
        shouldReply: true
      };
    }

    if (!kvNamespace) {
      return {
        success: false,
        message: "❌ *Webhook Retry Unavailable*\n\n" +
                 "Webhook retry functionality is not configured.\n\n" +
                 "This feature requires KV storage to be properly configured.\n\n" +
                 "💡 *Try:*\n" +
                 "• Check job status: /status " + jobId + "\n" +
                 "• Contact bot administrator for support",
        shouldReply: true
      };
    }

    // Check if webhook can be retried
    const retryCheck = await canRetryWebhook(jobId, kvNamespace);
    if (!retryCheck.canRetry) {
      return {
        success: false,
        message: "❌ *Webhook Cannot Be Retried*\n\n" +
                 `Job ID: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n` +
                 `Reason: ${retryCheck.reason}\n\n` +
                 "💡 *Suggestions:*\n" +
                 "• Check webhook status: /webhook_status " + jobId + "\n" +
                 "• Check job status: /status " + jobId + "\n" +
                 "• Contact support if you believe this is an error",
        shouldReply: true
      };
    }

    // Determine if we should reset retry counters
    const shouldReset = args.includes('reset');
    const retryFunction = shouldReset ? resetAndRetryWebhook : manualRetryWebhookWithStatus;

    // Perform the retry
    const retryResult = await retryFunction(
      serviceUrl,
      jobId,
      kvNamespace,
      'manual',
      { command: 'retry_webhook', reset: shouldReset }
    );

    const formattedResult = formatWebhookRetryResult(
      retryResult.success,
      jobId,
      retryResult.message,
      retryResult.retryId,
      retryResult.scheduledAt
    );

    return {
      success: retryResult.success,
      message: formattedResult,
      shouldReply: true
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error handling retry webhook command", { error: errorMessage, jobId });

    return {
      success: false,
      message: "❌ *Webhook Retry Failed*\n\n" +
               `Job ID: \`${jobId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n` +
               `Error: ${errorMessage.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\n\n` +
               "💡 *Suggestions:*\n" +
               "• Check webhook status: /webhook_status " + jobId + "\n" +
               "• Try again in a few minutes\n" +
               "• Contact support if the issue persists",
      shouldReply: true
    };
  }
}

/**
 * Handle /dead_letter_queue command
 */
export async function handleDeadLetterQueueCommand(
  botToken: string,
  chatId: number,
  kvNamespace: KVNamespace,
  page: number = 1,
  limit: number = 10
): Promise<CommandResult> {
  try {
    logger.info("Handling dead letter queue command", { chatId, page, limit });

    if (!kvNamespace) {
      return {
        success: false,
        message: "❌ *Dead Letter Queue Unavailable*\n\n" +
                 "Dead letter queue functionality is not configured.\n\n" +
                 "This feature requires KV storage to be properly configured.\n\n" +
                 "💡 *Try:*\n" +
                 "• Contact bot administrator for support",
        shouldReply: true
      };
    }

    // Get queue statistics
    const stats = await getDeadLetterQueueStats(kvNamespace);
    
    // Get queue entries for the current page
    const offset = (page - 1) * limit;
    const { entries, total } = await getDeadLetterQueueEntries(kvNamespace, limit, offset);

    let message = formatDeadLetterQueueStats(stats);
    
    if (entries.length > 0) {
      message += `\n\n📋 *Recent Entries (Page ${page})*\n\n`;
      
      entries.forEach((entry, index) => {
        message += `${offset + index + 1}. \`${entry.id}\` - ${entry.jobId}\n`;
        message += `   Reason: ${entry.reason} | ${new Date(entry.timestamp).toLocaleDateString()}\n\n`;
      });
      
      // Add pagination if there are more entries
      if (total > limit) {
        const totalPages = Math.ceil(total / limit);
        message += `📄 *Page ${page} of ${totalPages}*\n`;
        
        if (page < totalPages) {
          message += `• View next page: /dead_letter_queue ${page + 1}\n`;
        }
        if (page > 1) {
          message += `• View previous page: /dead_letter_queue ${page - 1}\n`;
        }
      }
      
      message += `\n💡 *Actions:*\n`;
      message += `• Retry entry: /retry_dead_letter <entry_id>\n`;
      message += `• Clear all entries: /clear_dead_letter\n`;
    } else {
      message += `\n✅ *No entries in dead letter queue*\n\n`;
      message += `All webhook deliveries are processing successfully!`;
    }

    return {
      success: true,
      message,
      shouldReply: true
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error handling dead letter queue command", { error: errorMessage, chatId });

    return {
      success: false,
      message: "❌ *Dead Letter Queue Check Failed*\n\n" +
               `Error: ${errorMessage.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\n\n` +
               "💡 *Suggestions:*\n" +
               "• Try again in a few minutes\n" +
               "• Contact support if the issue persists",
      shouldReply: true
    };
  }
}

/**
 * Handle /retry_dead_letter <entry_id> command
 */
export async function handleRetryDeadLetterCommand(
  botToken: string,
  chatId: number,
  entryId: string,
  serviceUrl: string,
  kvNamespace: KVNamespace
): Promise<CommandResult> {
  try {
    logger.info("Handling retry dead letter command", { entryId });

    if (!entryId) {
      return {
        success: false,
        message: "🔄 *Retry Dead Letter Entry*\n\n" +
                 "Please provide an entry ID:\n" +
                 "`/retry_dead_letter <entry_id>`\n\n" +
                 "💡 *To find entry IDs:*\n" +
                 "• View dead letter queue: /dead_letter_queue\n\n" +
                 "Example: `/retry_dead_letter dead_12345`",
        shouldReply: true
      };
    }

    if (!kvNamespace) {
      return {
        success: false,
        message: "❌ *Dead Letter Retry Unavailable*\n\n" +
                 "Dead letter retry functionality is not configured.\n\n" +
                 "This feature requires KV storage to be properly configured.\n\n" +
                 "💡 *Try:*\n" +
                 "• Contact bot administrator for support",
        shouldReply: true
      };
    }

    // Retry the dead letter entry
    const retryResult = await retryDeadLetterEntry(serviceUrl, entryId, kvNamespace);

    if (retryResult.success) {
      let message = "✅ *Dead Letter Entry Retried*\n\n";
      message += `Entry ID: \`${entryId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n`;
      message += `Status: ${retryResult.message}\n`;
      
      if (retryResult.retryId) {
        message += `Retry ID: \`${retryResult.retryId}\`\n`;
      }
      
      message += `\n💡 *Next Steps*\n`;
      message += `• The entry has been removed from the dead letter queue\n`;
      message += `• Monitor retry progress: /webhook_status <job_id>\n`;
      message += `• View remaining queue: /dead_letter_queue`;

      return {
        success: true,
        message,
        shouldReply: true
      };
    } else {
      return {
        success: false,
        message: "❌ *Dead Letter Retry Failed*\n\n" +
                 `Entry ID: \`${entryId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n` +
                 `Error: ${retryResult.message.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\n\n` +
                 "💡 *Suggestions:*\n" +
                 "• Check the entry details: /dead_letter_queue\n" +
                 "• Try again in a few minutes\n" +
                 "• Contact support if the issue persists",
        shouldReply: true
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error handling retry dead letter command", { error: errorMessage, entryId });

    return {
      success: false,
      message: "❌ *Dead Letter Retry Failed*\n\n" +
               `Entry ID: \`${entryId.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\`\n` +
               `Error: ${errorMessage.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\n\n` +
               "💡 *Suggestions:*\n" +
               "• Check the entry details: /dead_letter_queue\n" +
               "• Try again in a few minutes\n" +
               "• Contact support if the issue persists",
      shouldReply: true
    };
  }
}

/**
 * Handle /clear_dead_letter [confirm] command
 */
export async function handleClearDeadLetterCommand(
  botToken: string,
  chatId: number,
  kvNamespace: KVNamespace,
  args: string[] = []
): Promise<CommandResult> {
  try {
    logger.info("Handling clear dead letter command", { chatId, args });

    if (!kvNamespace) {
      return {
        success: false,
        message: "❌ *Clear Dead Letter Queue Unavailable*\n\n" +
                 "Dead letter queue functionality is not configured.\n\n" +
                 "This feature requires KV storage to be properly configured.\n\n" +
                 "💡 *Try:*\n" +
                 "• Contact bot administrator for support",
        shouldReply: true
      };
    }

    const confirm = args.includes('confirm');

    if (!confirm) {
      // Show confirmation message with current stats
      const stats = await getDeadLetterQueueStats(kvNamespace);
      const confirmationMessage = formatClearDeadLetterConfirmation(stats);
      
      return {
        success: true,
        message: confirmationMessage,
        shouldReply: true
      };
    }

    // Perform the clear operation
    const clearResult = await clearDeadLetterQueue(kvNamespace);

    if (clearResult.success) {
      let message = "✅ *Dead Letter Queue Cleared*\n\n";
      message += `Successfully removed ${clearResult.clearedCount} entries from the dead letter queue.\n\n`;
      message += `💡 *Note:*\n`;
      message += `• All entries have been permanently deleted\n`;
      message += `• This action cannot be undone\n`;
      message += `• New failed webhooks may still be added to the queue`;

      return {
        success: true,
        message,
        shouldReply: true
      };
    } else {
      return {
        success: false,
        message: "❌ *Clear Dead Letter Queue Failed*\n\n" +
                 `Error: ${clearResult.error?.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&") || "Unknown error"}\n\n` +
                 "💡 *Suggestions:*\n" +
                 "• Try again in a few minutes\n" +
                 "• Contact support if the issue persists",
        shouldReply: true
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error handling clear dead letter command", { error: errorMessage, chatId });

    return {
      success: false,
      message: "❌ *Clear Dead Letter Queue Failed*\n\n" +
               `Error: ${errorMessage.replace(/[_*\[\]()~`>#+=|{}.!-]/g, "\\$&")}\n\n` +
               "💡 *Suggestions:*\n" +
               "• Try again in a few minutes\n" +
               "• Contact support if the issue persists",
      shouldReply: true
    };
  }
}

/**
 * Handle callback queries from inline keyboards
 */
export async function handleWebhookCallbackQuery(
  botToken: string,
  callbackQuery: any,
  serviceUrl: string,
  kvNamespace: KVNamespace
): Promise<boolean> {
  try {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    logger.info("Handling webhook callback query", { data, chatId });

    // Parse callback data
    const [action, jobId, ...args] = data.split(':');

    let result: CommandResult;

    switch (action) {
      case 'retry_webhook':
        result = await handleRetryWebhookCommand(
          botToken,
          chatId,
          jobId,
          serviceUrl,
          kvNamespace,
          args
        );
        break;

      case 'reset_webhook':
        result = await handleRetryWebhookCommand(
          botToken,
          chatId,
          jobId,
          serviceUrl,
          kvNamespace,
          ['reset']
        );
        break;

      case 'view_webhook_status':
        const webhookStatus = await getWebhookStatusWithRetry(jobId, kvNamespace);
        if (webhookStatus.success && webhookStatus.formattedMessage) {
          result = {
            success: true,
            message: webhookStatus.formattedMessage,
            shouldReply: true
          };
        } else {
          result = {
            success: false,
            message: "❌ *Webhook Status Unavailable*\n\nCould not retrieve webhook status.",
            shouldReply: true
          };
        }
        break;

      default:
        logger.warn("Unknown webhook callback action", { action, data });
        return false;
    }

    // Send the response
    if (result.shouldReply && result.message) {
      // For callback queries, we should use editMessageText instead of sending a new message
      // But for now, we'll acknowledge the callback was handled
      // The actual response will be handled by the callback query handler
      logger.info("Webhook callback query processed", {
        chatId,
        messageId,
        success: result.success
      });
    }

    return true;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error handling webhook callback query", { error: errorMessage });

    return false;
  }
}

/**
 * Create inline keyboard for webhook actions based on status
 */
export function createWebhookActionKeyboard(webhookStatus: WebhookDeliveryStatus): string {
  const keyboard: string[][] = [];
  
  // Add retry button if webhook is retryable
  if (isWebhookRetryable(webhookStatus)) {
    keyboard.push([
      `🔄 Retry Webhook`,
      `retry_webhook:${webhookStatus.jobId}`
    ]);
    
    // Add reset and retry button
    keyboard.push([
      `🔄 Reset & Retry`,
      `reset_webhook:${webhookStatus.jobId}`
    ]);
  }
  
  // Add view status button
  keyboard.push([
    `📊 View Status`,
    `view_webhook_status:${webhookStatus.jobId}`
  ]);
  
  return JSON.stringify({
    inline_keyboard: keyboard.map(row => 
      row.map(text => ({
        text: text.split(':')[0],
        callback_data: text
      }))
    )
  });
}

/**
 * Send a message with webhook status and action buttons
 */
export async function sendWebhookStatusWithActions(
  botToken: string,
  chatId: number,
  webhookStatus: WebhookDeliveryStatus,
  replyToMessage?: any
): Promise<boolean> {
  try {
    const message = formatWebhookStatusMessage(webhookStatus, false);
    const replyMarkup = createWebhookActionKeyboard(webhookStatus);
    
    // For now, we'll send the message without inline keyboard
    // In a full implementation, you would use the Telegram API to send the keyboard
    await sendMarkdownV2Text(botToken, chatId, message, replyToMessage);
    
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error sending webhook status with actions", { error: errorMessage, chatId });
    return false;
  }
}