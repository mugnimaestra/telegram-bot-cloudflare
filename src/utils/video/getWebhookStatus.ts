/**
 * Utility to get and format webhook delivery status for display to users
 */

import type { WebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { getWebhookDeliveryStatus, formatWebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { logger } from "@/utils/logger";

/**
 * Result structure for webhook status retrieval
 */
export interface WebhookStatusResult {
  success: boolean;
  webhookStatus?: WebhookDeliveryStatus;
  formattedMessage?: string;
  error?: string;
}

/**
 * Get webhook delivery status and format it for user display
 */
export async function getWebhookStatus(
  jobId: string,
  kvNamespace: KVNamespace
): Promise<WebhookStatusResult> {
  try {
    logger.info("Getting webhook delivery status", { jobId });

    if (!kvNamespace) {
      logger.warn("KV namespace not provided for webhook status retrieval");
      return {
        success: false,
        error: "Webhook status tracking is not available"
      };
    }

    const webhookStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);

    if (!webhookStatus) {
      logger.info("No webhook delivery status found", { jobId });
      
      // Return a helpful message when webhook status is not available
      const notFoundMessage = `📡 *Webhook Status*\n\n` +
        `Job ID: \`${jobId}\`\n\n` +
        `❌ *No webhook delivery status found*\n\n` +
        `This could mean:\n` +
        `• The job hasn't triggered webhook delivery yet\n` +
        `• Webhook delivery hasn't been attempted\n` +
        `• The webhook status has expired (stored for 7 days)\n\n` +
        `💡 *Suggestions:*\n` +
        `• Check the job status first: /status ${jobId}\n` +
        `• If the job is completed, webhook delivery should be in progress\n` +
        `• If the job failed, webhook delivery may not have been attempted`;

      return {
        success: true,
        formattedMessage: notFoundMessage
      };
    }

    logger.info("Webhook delivery status retrieved successfully", {
      jobId,
      status: webhookStatus.status,
      attempts: webhookStatus.attempts
    });

    const formattedMessage = formatWebhookDeliveryStatus(webhookStatus);

    return {
      success: true,
      webhookStatus,
      formattedMessage
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error("Failed to get webhook status", {
      error: errorMessage,
      jobId
    });

    return {
      success: false,
      error: `Failed to retrieve webhook status: ${errorMessage}`
    };
  }
}

/**
 * Get webhook status with retry logic for temporary failures
 */
export async function getWebhookStatusWithRetry(
  jobId: string,
  kvNamespace: KVNamespace,
  maxRetries: number = 2,
  retryDelay: number = 1000
): Promise<WebhookStatusResult> {
  let lastError: string | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await getWebhookStatus(jobId, kvNamespace);
      
      if (result.success) {
        return result;
      }
      
      lastError = result.error;
      
      // Don't retry on certain errors
      if (result.error?.includes("not available") || result.error?.includes("not found")) {
        return result;
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn("Webhook status retrieval attempt failed", {
        attempt,
        maxRetries,
        error: lastError,
        jobId
      });
    }
    
    // Wait before retrying (except on the last attempt)
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return {
    success: false,
    error: lastError || "Failed to retrieve webhook status after multiple attempts"
  };
}

/**
 * Format a simple webhook status summary for inclusion in other messages
 */
export function formatWebhookStatusSummary(webhookStatus: WebhookDeliveryStatus): string {
  const statusEmoji = {
    pending: '⏳',
    delivered: '✅',
    failed: '❌',
    retrying: '🔄',
    dead_letter: '💀'
  }[webhookStatus.status];

  const summary = `${statusEmoji} Webhook: ${webhookStatus.status}`;
  
  if (webhookStatus.attempts > 0) {
    return `${summary} (${webhookStatus.attempts}/${webhookStatus.maxAttempts})`;
  }
  
  return summary;
}

/**
 * Check if webhook delivery is in a retryable state
 */
export function isWebhookRetryable(webhookStatus: WebhookDeliveryStatus): boolean {
  return webhookStatus.status === 'failed' && webhookStatus.attempts < webhookStatus.maxAttempts;
}

/**
 * Check if webhook delivery is in a final state
 */
export function isWebhookFinal(webhookStatus: WebhookDeliveryStatus): boolean {
  return webhookStatus.status === 'delivered' || webhookStatus.status === 'dead_letter';
}

/**
 * Get a user-friendly action message based on webhook status
 */
export function getWebhookActionMessage(webhookStatus: WebhookDeliveryStatus): string {
  if (webhookStatus.status === 'delivered') {
    return "✅ Webhook delivered successfully!";
  }
  
  if (webhookStatus.status === 'dead_letter') {
    return "💀 Webhook delivery permanently failed. Contact support for assistance.";
  }
  
  if (webhookStatus.status === 'retrying') {
    if (webhookStatus.timestamps.nextRetry) {
      const nextRetry = new Date(webhookStatus.timestamps.nextRetry);
      return `🔄 Scheduled for retry at ${nextRetry.toLocaleString()}`;
    }
    return "🔄 Webhook retry in progress...";
  }
  
  if (webhookStatus.status === 'failed') {
    if (isWebhookRetryable(webhookStatus)) {
      return `❌ Webhook delivery failed. Retry manually with: /retry_webhook ${webhookStatus.jobId}`;
    }
    return "❌ Webhook delivery failed and cannot be retried.";
  }
  
  return "⏳ Webhook delivery pending...";
}