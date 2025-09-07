/**
 * Manual webhook retry functionality using the /retry-webhook/:id endpoint from go-chutes-cooking-analyzer
 */

import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import type { WebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { getWebhookDeliveryStatus, updateWebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { logger } from "@/utils/logger";

/**
 * Interface for the retry webhook request
 */
export interface RetryWebhookRequest {
  webhookId: string;
  reason?: 'manual' | 'system' | 'admin';
  metadata?: Record<string, any>;
}

/**
 * Interface for the retry webhook response from go-chutes-cooking-analyzer
 */
export interface RetryWebhookResponse {
  success: boolean;
  message: string;
  retryId?: string;
  scheduledAt?: number;
}

/**
 * Interface for manual retry result
 */
export interface ManualRetryResult {
  success: boolean;
  message: string;
  retryId?: string;
  scheduledAt?: Date;
  deliveryStatus?: WebhookDeliveryStatus;
}

/**
 * Call the /retry-webhook/:id endpoint to manually retry a webhook delivery
 */
export async function retryWebhookDelivery(
  serviceUrl: string,
  webhookId: string,
  reason: 'manual' | 'system' | 'admin' = 'manual',
  metadata?: Record<string, any>
): Promise<ManualRetryResult> {
  try {
    logger.info("Attempting manual webhook retry", { serviceUrl, webhookId, reason });

    // Prepare the retry request
    const retryRequest: RetryWebhookRequest = {
      webhookId,
      reason,
      metadata
    };

    // Call the retry endpoint
    const response = await fetch(`${serviceUrl}/retry-webhook/${webhookId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(retryRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Failed to call retry webhook endpoint", {
        serviceUrl,
        webhookId,
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });

      return {
        success: false,
        message: `Failed to retry webhook: ${response.status} ${response.statusText} - ${errorText}`
      };
    }

    const retryResponse: RetryWebhookResponse = await response.json();

    logger.info("Webhook retry endpoint response received", {
      webhookId,
      success: retryResponse.success,
      message: retryResponse.message,
      retryId: retryResponse.retryId,
      scheduledAt: retryResponse.scheduledAt
    });

    return {
      success: retryResponse.success,
      message: retryResponse.message,
      retryId: retryResponse.retryId,
      scheduledAt: retryResponse.scheduledAt ? new Date(retryResponse.scheduledAt) : undefined
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Exception during webhook retry", {
      serviceUrl,
      webhookId,
      error: errorMessage
    });

    return {
      success: false,
      message: `Exception during webhook retry: ${errorMessage}`
    };
  }
}

/**
 * Manually retry a webhook delivery with full status management
 */
export async function manualRetryWebhookWithStatus(
  serviceUrl: string,
  jobId: string,
  kvNamespace: KVNamespace,
  reason: 'manual' | 'system' | 'admin' = 'manual',
  metadata?: Record<string, any>
): Promise<ManualRetryResult> {
  try {
    logger.info("Starting manual webhook retry with status management", { jobId, reason });

    // Get current delivery status
    const deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    if (!deliveryStatus) {
      return {
        success: false,
        message: "No webhook delivery status found for this job"
      };
    }

    // Check if webhook is in a retryable state
    if (deliveryStatus.status === 'delivered') {
      return {
        success: false,
        message: "Webhook has already been delivered successfully",
        deliveryStatus
      };
    }

    if (deliveryStatus.status === 'dead_letter') {
      return {
        success: false,
        message: "Webhook is in dead letter queue and cannot be retried automatically",
        deliveryStatus
      };
    }

    // Call the retry endpoint
    const retryResult = await retryWebhookDelivery(serviceUrl, deliveryStatus.webhookId, reason, metadata);

    if (retryResult.success) {
      // Update delivery status to reflect the retry
      await updateWebhookDeliveryStatus(jobId, {
        status: 'retrying',
        attempts: deliveryStatus.attempts + 1,
        timestamps: {
          created: deliveryStatus.timestamps.created,
          lastAttempt: Date.now(),
          nextRetry: retryResult.scheduledAt?.getTime()
        },
        retryCount: deliveryStatus.retryCount + 1
      }, kvNamespace);

      logger.info("Manual webhook retry successful", {
        jobId,
        webhookId: deliveryStatus.webhookId,
        retryId: retryResult.retryId,
        scheduledAt: retryResult.scheduledAt
      });

      return {
        ...retryResult,
        deliveryStatus: await getWebhookDeliveryStatus(jobId, kvNamespace) || deliveryStatus
      };
    } else {
      // Update delivery status to reflect the failed retry
      await updateWebhookDeliveryStatus(jobId, {
        status: 'failed',
        timestamps: {
          created: deliveryStatus.timestamps.created,
          lastAttempt: Date.now()
        },
        error: {
          message: retryResult.message,
          type: 'server'
        }
      }, kvNamespace);

      logger.error("Manual webhook retry failed", {
        jobId,
        webhookId: deliveryStatus.webhookId,
        error: retryResult.message
      });

      return {
        ...retryResult,
        deliveryStatus: await getWebhookDeliveryStatus(jobId, kvNamespace) || deliveryStatus
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Exception during manual webhook retry with status", {
      jobId,
      error: errorMessage
    });

    return {
      success: false,
      message: `Exception during manual webhook retry: ${errorMessage}`
    };
  }
}

/**
 * Reset retry count and attempt a fresh retry
 */
export async function resetAndRetryWebhook(
  serviceUrl: string,
  jobId: string,
  kvNamespace: KVNamespace,
  reason: 'manual' | 'system' | 'admin' = 'manual',
  metadata?: Record<string, any>
): Promise<ManualRetryResult> {
  try {
    logger.info("Resetting webhook retry count and retrying", { jobId, reason });

    // Get current delivery status
    const deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    if (!deliveryStatus) {
      return {
        success: false,
        message: "No webhook delivery status found for this job"
      };
    }

    // Reset retry counters and attempt again
    await updateWebhookDeliveryStatus(jobId, {
      status: 'pending',
      attempts: 0,
      timestamps: {
        created: deliveryStatus.timestamps.created,
        lastAttempt: Date.now()
      },
      retryCount: 0,
      error: undefined,
      response: undefined
    }, kvNamespace);

    logger.info("Webhook retry count reset", { jobId });

    // Now attempt the retry
    return await manualRetryWebhookWithStatus(serviceUrl, jobId, kvNamespace, reason, metadata);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Exception during webhook reset and retry", {
      jobId,
      error: errorMessage
    });

    return {
      success: false,
      message: `Exception during webhook reset and retry: ${errorMessage}`
    };
  }
}

/**
 * Check if a webhook can be retried
 */
export async function canRetryWebhook(
  jobId: string,
  kvNamespace: KVNamespace
): Promise<{ canRetry: boolean; reason?: string; deliveryStatus?: WebhookDeliveryStatus }> {
  try {
    const deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    
    if (!deliveryStatus) {
      return { canRetry: false, reason: "No webhook delivery status found" };
    }

    // Check status-based conditions
    switch (deliveryStatus.status) {
      case 'delivered':
        return { canRetry: false, reason: "Webhook already delivered successfully", deliveryStatus };
      
      case 'dead_letter':
        return { canRetry: false, reason: "Webhook is in dead letter queue", deliveryStatus };
      
      case 'retrying':
        return { canRetry: true, reason: "Webhook is currently being retried", deliveryStatus };
      
      case 'failed':
        if (deliveryStatus.attempts >= deliveryStatus.maxAttempts) {
          return { canRetry: false, reason: "Maximum retry attempts exceeded", deliveryStatus };
        }
        return { canRetry: true, reason: "Webhook failed but can be retried", deliveryStatus };
      
      case 'pending':
        return { canRetry: true, reason: "Webhook is pending delivery", deliveryStatus };
      
      default:
        return { canRetry: false, reason: `Unknown webhook status: ${deliveryStatus.status}`, deliveryStatus };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to check webhook retry eligibility", {
      jobId,
      error: errorMessage
    });

    return { canRetry: false, reason: `Failed to check retry eligibility: ${errorMessage}` };
  }
}

/**
 * Format manual retry result for user display
 */
export function formatManualRetryResult(result: ManualRetryResult): string {
  if (result.success) {
    let message = "✅ *Webhook Retry Scheduled*\n\n";
    
    if (result.retryId) {
      message += `Retry ID: \`${result.retryId}\`\n`;
    }
    
    if (result.scheduledAt) {
      message += `Scheduled for: ${result.scheduledAt.toLocaleString()}\n`;
    }
    
    message += `\n${result.message}`;
    
    return message;
  } else {
    return `❌ *Webhook Retry Failed*\n\n${result.message}`;
  }
}

/**
 * Get retry statistics for a job
 */
export async function getWebhookRetryStats(
  jobId: string,
  kvNamespace: KVNamespace
): Promise<{ 
  totalAttempts: number; 
  successfulAttempts: number; 
  failedAttempts: number;
  lastAttempt?: Date;
  nextRetry?: Date;
  status: string;
}> {
  try {
    const deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    
    if (!deliveryStatus) {
      return {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        status: 'not_found'
      };
    }

    // Count retry attempts from KV storage
    let successfulAttempts = 0;
    let failedAttempts = 0;
    let lastAttemptDate: Date | undefined;

    try {
      // This would require iterating through retry keys, which is complex in KV
      // For now, we'll use the delivery status information
      successfulAttempts = deliveryStatus.status === 'delivered' ? 1 : 0;
      failedAttempts = deliveryStatus.attempts - successfulAttempts;
      
      if (deliveryStatus.timestamps.lastAttempt) {
        lastAttemptDate = new Date(deliveryStatus.timestamps.lastAttempt);
      }
    } catch (error) {
      logger.warn("Failed to get detailed retry statistics", { jobId, error });
    }

    return {
      totalAttempts: deliveryStatus.attempts,
      successfulAttempts,
      failedAttempts,
      lastAttempt: lastAttemptDate,
      nextRetry: deliveryStatus.timestamps.nextRetry ? new Date(deliveryStatus.timestamps.nextRetry) : undefined,
      status: deliveryStatus.status
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get webhook retry statistics", {
      jobId,
      error: errorMessage
    });

    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      status: 'error'
    };
  }
}