/**
 * Webhook delivery status tracking and management utilities
 */

import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import { logger } from "@/utils/logger";

/**
 * Webhook delivery status interface based on the design document
 */
export interface WebhookDeliveryStatus {
  id: string; // Unique delivery ID (UUID)
  jobId: string; // Associated video analysis job ID
  webhookId: string; // ID from go-chutes-cooking-analyzer service
  status: 'pending' | 'delivered' | 'failed' | 'retrying' | 'dead_letter';
  attempts: number; // Number of delivery attempts
  maxAttempts: number; // Maximum allowed attempts (default: 3)
  timestamps: {
    created: number; // Initial delivery timestamp
    lastAttempt: number; // Last attempt timestamp
    nextRetry?: number; // Next scheduled retry timestamp
    delivered?: number; // Successful delivery timestamp
    failed?: number; // Final failure timestamp
  };
  payload: VideoAnalysisWebhookPayload; // Original webhook payload
  response?: {
    status: number;
    statusText: string;
    body?: string;
  };
  error?: {
    message: string;
    type: 'network' | 'server' | 'client' | 'timeout';
    code?: string;
  };
  retryCount: number; // Number of retries performed
  webhookUrl: string; // Target webhook URL
  headers?: Record<string, string>; // Additional headers for delivery
}

/**
 * Retry attempt record interface
 */
export interface RetryAttemptRecord {
  id: string; // Unique retry ID
  deliveryId: string; // Reference to parent delivery record
  attemptNumber: number; // Sequence number of this attempt
  timestamp: number; // When this attempt was made
  delay: number; // Delay used for this attempt (ms)
  success: boolean;
  response?: {
    status: number;
    statusText: string;
    body?: string;
    duration: number; // Request duration in ms
  };
  error?: {
    message: string;
    type: 'network' | 'server' | 'client' | 'timeout';
    code?: string;
    duration: number; // Time until failure in ms
  };
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  jitter: true
};

/**
 * Generate a unique webhook delivery ID
 */
export function generateDeliveryId(): string {
  return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(attempt: number, config = DEFAULT_RETRY_CONFIG): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  
  if (config.jitter) {
    // Add ±25% random jitter
    const jitterFactor = 0.75 + Math.random() * 0.5;
    return Math.floor(cappedDelay * jitterFactor);
  }
  
  return cappedDelay;
}

/**
 * Format webhook delivery status for user display
 */
export function formatWebhookDeliveryStatus(status: WebhookDeliveryStatus): string {
  const statusEmoji = {
    pending: '⏳',
    delivered: '✅',
    failed: '❌',
    retrying: '🔄',
    dead_letter: '💀'
  }[status.status];

  let message = `${statusEmoji} *Webhook Delivery Status*\n\n`;
  message += `Job ID: \`${status.jobId}\`\n`;
  message += `Status: ${status.status}\n`;
  message += `Attempts: ${status.attempts}/${status.maxAttempts}\n`;
  
  if (status.timestamps.lastAttempt) {
    const lastAttempt = new Date(status.timestamps.lastAttempt);
    message += `Last Attempt: ${lastAttempt.toLocaleString()}\n`;
  }
  
  if (status.status === 'retrying' && status.timestamps.nextRetry) {
    const nextRetry = new Date(status.timestamps.nextRetry);
    message += `Next Retry: ${nextRetry.toLocaleString()}\n`;
  }
  
  if (status.timestamps.delivered) {
    const delivered = new Date(status.timestamps.delivered);
    message += `Delivered: ${delivered.toLocaleString()}\n`;
  }
  
  if (status.error) {
    message += `\n❌ Error: ${status.error.message}\n`;
    message += `Error Type: ${status.error.type}\n`;
    if (status.error.code) {
      message += `Error Code: ${status.error.code}\n`;
    }
  }
  
  if (status.response) {
    message += `\n📡 Response: ${status.response.status} ${status.response.statusText}\n`;
  }
  
  if (status.status === 'failed' && status.attempts < status.maxAttempts) {
    message += `\n💡 *Actions:*\n`;
    message += `• Retry manually: /retry_webhook ${status.jobId}\n`;
  }
  
  if (status.status === 'dead_letter') {
    message += `\n💀 *Permanently Failed*\n`;
    message += `• Contact support for assistance\n`;
  }
  
  return message;
}

/**
 * Get webhook delivery status from KV storage
 */
export async function getWebhookDeliveryStatus(
  jobId: string,
  kvNamespace: KVNamespace
): Promise<WebhookDeliveryStatus | null> {
  try {
    const key = `webhook:delivery:${jobId}`;
    const result = await kvNamespace.get(key);
    
    if (!result) {
      logger.debug("No webhook delivery status found", { jobId });
      return null;
    }
    
    const status: WebhookDeliveryStatus = JSON.parse(result);
    logger.debug("Retrieved webhook delivery status", { jobId, status: status.status });
    
    return status;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get webhook delivery status", { error: errorMessage, jobId });
    throw new Error(`Failed to retrieve webhook delivery status: ${errorMessage}`);
  }
}

/**
 * Update webhook delivery status in KV storage
 */
export async function updateWebhookDeliveryStatus(
  jobId: string,
  status: Partial<WebhookDeliveryStatus>,
  kvNamespace: KVNamespace
): Promise<void> {
  try {
    const key = `webhook:delivery:${jobId}`;
    
    // Get existing status or create new one
    let existingStatus: WebhookDeliveryStatus | null = null;
    try {
      existingStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    } catch (error) {
      logger.warn("Failed to get existing status, creating new one", { jobId, error });
    }
    
    const updatedStatus: WebhookDeliveryStatus = existingStatus ? {
      ...existingStatus,
      ...status,
      timestamps: {
        ...existingStatus.timestamps,
        ...status.timestamps
      }
    } : {
      id: generateDeliveryId(),
      jobId,
      webhookId: status.webhookId || '',
      status: status.status || 'pending',
      attempts: status.attempts || 0,
      maxAttempts: status.maxAttempts || DEFAULT_RETRY_CONFIG.maxAttempts,
      timestamps: {
        created: Date.now(),
        lastAttempt: Date.now(),
        ...status.timestamps
      },
      payload: status.payload || {} as VideoAnalysisWebhookPayload,
      retryCount: status.retryCount || 0,
      webhookUrl: status.webhookUrl || '',
      headers: status.headers,
      response: status.response,
      error: status.error
    };
    
    // Update last attempt timestamp
    updatedStatus.timestamps.lastAttempt = Date.now();
    
    await kvNamespace.put(key, JSON.stringify(updatedStatus), {
      expirationTtl: 604800 // 7 days
    });
    
    logger.info("Updated webhook delivery status", { 
      jobId, 
      status: updatedStatus.status,
      attempts: updatedStatus.attempts 
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to update webhook delivery status", { error: errorMessage, jobId });
    throw new Error(`Failed to update webhook delivery status: ${errorMessage}`);
  }
}

/**
 * Create a new webhook delivery status record
 */
export async function createWebhookDeliveryStatus(
  jobId: string,
  webhookId: string,
  payload: VideoAnalysisWebhookPayload,
  webhookUrl: string,
  kvNamespace: KVNamespace,
  headers?: Record<string, string>
): Promise<WebhookDeliveryStatus> {
  const status: WebhookDeliveryStatus = {
    id: generateDeliveryId(),
    jobId,
    webhookId,
    status: 'pending',
    attempts: 0,
    maxAttempts: DEFAULT_RETRY_CONFIG.maxAttempts,
    timestamps: {
      created: Date.now(),
      lastAttempt: Date.now()
    },
    payload,
    retryCount: 0,
    webhookUrl,
    headers
  };
  
  await updateWebhookDeliveryStatus(jobId, status, kvNamespace);
  return status;
}

/**
 * Delete webhook delivery status from KV storage
 */
export async function deleteWebhookDeliveryStatus(
  jobId: string,
  kvNamespace: KVNamespace
): Promise<void> {
  try {
    const key = `webhook:delivery:${jobId}`;
    await kvNamespace.delete(key);
    logger.info("Deleted webhook delivery status", { jobId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to delete webhook delivery status", { error: errorMessage, jobId });
    throw new Error(`Failed to delete webhook delivery status: ${errorMessage}`);
  }
}