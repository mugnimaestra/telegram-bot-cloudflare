/**
 * Webhook retry handler with automatic retry logic, error classification, and dead letter queue management
 */

import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import type { WebhookDeliveryStatus, RetryAttemptRecord } from "./webhookDeliveryStatus";
import { 
  getWebhookDeliveryStatus, 
  updateWebhookDeliveryStatus, 
  createWebhookDeliveryStatus,
  DEFAULT_RETRY_CONFIG,
  calculateRetryDelay
} from "./webhookDeliveryStatus";
import { logger } from "@/utils/logger";

/**
 * Error classification types
 */
export type WebhookErrorType = 'network' | 'server' | 'client' | 'timeout';

/**
 * Classified webhook error interface
 */
export interface ClassifiedWebhookError {
  type: WebhookErrorType;
  message: string;
  code?: string;
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Dead letter queue entry interface
 */
export interface DeadLetterEntry {
  id: string;
  deliveryId: string;
  jobId: string;
  reason: 'max_attempts_exceeded' | 'permanent_failure' | 'invalid_payload' | 'manual';
  timestamp: number;
  payload: VideoAnalysisWebhookPayload;
  finalError: {
    message: string;
    type: WebhookErrorType;
    code?: string;
  };
  retryAttempts: number;
  metadata?: {
    action?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'temporary' | 'permanent' | 'unknown';
  };
}

/**
 * Deduplication record interface
 */
export interface DeduplicationRecord {
  id: string;
  webhookId: string;
  jobId: string;
  processed: boolean;
  processedAt?: number;
  ttl: number;
}

/**
 * Retry configuration interface
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
}

/**
 * Classify webhook errors based on response or exception
 */
export function classifyWebhookError(error: unknown, response?: Response): ClassifiedWebhookError {
  if (error instanceof Error) {
    // Network errors
    if (error.name === 'NetworkError' || error.message.includes('network') || error.message.includes('fetch')) {
      return {
        type: 'network',
        message: error.message,
        retryable: true,
        severity: 'medium'
      };
    }
    
    // Timeout errors
    if (error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('aborted')) {
      return {
        type: 'timeout',
        message: error.message,
        retryable: true,
        severity: 'medium'
      };
    }
    
    // Other unexpected errors
    return {
      type: 'network',
      message: error.message,
      retryable: true,
      severity: 'high'
    };
  }
  
  if (response) {
    // Server errors (5xx) - retryable
    if (response.status >= 500 && response.status < 600) {
      return {
        type: 'server',
        message: `Server error: ${response.status} ${response.statusText}`,
        code: response.status.toString(),
        retryable: true,
        severity: 'medium'
      };
    }
    
    // Client errors (4xx) - generally not retryable
    if (response.status >= 400 && response.status < 500) {
      // Special case: 408 Request Timeout - retryable
      if (response.status === 408) {
        return {
          type: 'timeout',
          message: `Request timeout: ${response.status} ${response.statusText}`,
          code: response.status.toString(),
          retryable: true,
          severity: 'medium'
        };
      }
      
      // Special case: 429 Too Many Requests - retryable with backoff
      if (response.status === 429) {
        return {
          type: 'client',
          message: `Rate limited: ${response.status} ${response.statusText}`,
          code: response.status.toString(),
          retryable: true,
          severity: 'medium'
        };
      }
      
      // Other client errors - not retryable
      return {
        type: 'client',
        message: `Client error: ${response.status} ${response.statusText}`,
        code: response.status.toString(),
        retryable: false,
        severity: 'high'
      };
    }
  }
  
  // Unknown error
  return {
    type: 'network',
    message: String(error),
    retryable: true,
    severity: 'high'
  };
}

/**
 * Generate a hash for webhook deduplication
 */
export function generateWebhookHash(payload: VideoAnalysisWebhookPayload): string {
  const hashData = {
    jobId: payload.job_id,
    status: payload.status,
    callbackData: payload.callback_data
  };
  
  // Create a simple hash for deduplication
  const hashString = JSON.stringify(hashData);
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    const char = hashString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Check for duplicate webhook processing
 */
export async function checkDuplicateWebhook(
  payload: VideoAnalysisWebhookPayload,
  kvNamespace: KVNamespace
): Promise<{ isDuplicate: boolean; dedupeRecord?: DeduplicationRecord }> {
  try {
    const hash = generateWebhookHash(payload);
    const dedupeKey = `webhook:dedupe:${hash}`;
    
    const existing = await kvNamespace.get(dedupeKey);
    if (existing) {
      const record: DeduplicationRecord = JSON.parse(existing);
      return { isDuplicate: record.processed, dedupeRecord: record };
    }
    
    // Create deduplication record
    const dedupeRecord: DeduplicationRecord = {
      id: hash,
      webhookId: payload.job_id,
      jobId: payload.job_id,
      processed: false,
      ttl: 86400 // 24 hours
    };
    
    await kvNamespace.put(dedupeKey, JSON.stringify(dedupeRecord), {
      expirationTtl: dedupeRecord.ttl
    });
    
    return { isDuplicate: false, dedupeRecord };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to check webhook duplication", { error: errorMessage, jobId: payload.job_id });
    // If deduplication check fails, assume it's not a duplicate to avoid losing webhooks
    return { isDuplicate: false };
  }
}

/**
 * Mark webhook as processed in deduplication record
 */
export async function markWebhookProcessed(
  payload: VideoAnalysisWebhookPayload,
  kvNamespace: KVNamespace
): Promise<void> {
  try {
    const hash = generateWebhookHash(payload);
    const dedupeKey = `webhook:dedupe:${hash}`;
    
    const existing = await kvNamespace.get(dedupeKey);
    if (existing) {
      const record: DeduplicationRecord = JSON.parse(existing);
      record.processed = true;
      record.processedAt = Date.now();
      
      await kvNamespace.put(dedupeKey, JSON.stringify(record), {
        expirationTtl: record.ttl
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to mark webhook as processed", { error: errorMessage, jobId: payload.job_id });
  }
}

/**
 * Handle automatic retry of failed webhook deliveries with exponential backoff
 */
export async function handleAutomaticWebhookRetry(
  jobId: string,
  kvNamespace: KVNamespace,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ success: boolean; message?: string; nextRetryTime?: number }> {
  try {
    logger.info("Starting automatic webhook retry", { jobId });
    
    // Get current delivery status
    const deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    if (!deliveryStatus) {
      return { success: false, message: "No delivery status found for job" };
    }
    
    // Check if retry is needed
    if (deliveryStatus.status !== 'failed' && deliveryStatus.status !== 'retrying') {
      return { success: false, message: `Webhook not in retryable state: ${deliveryStatus.status}` };
    }
    
    // Check max attempts
    if (deliveryStatus.attempts >= deliveryStatus.maxAttempts) {
      // Move to dead letter queue
      await moveToDeadLetterQueue(jobId, kvNamespace, 'max_attempts_exceeded');
      return { success: false, message: "Max retry attempts exceeded, moved to dead letter queue" };
    }
    
    // Calculate next retry time
    const nextAttempt = deliveryStatus.attempts + 1;
    const delay = calculateRetryDelay(nextAttempt, retryConfig);
    const nextRetryTime = Date.now() + delay;
    
    // Update delivery status for retry
    await updateWebhookDeliveryStatus(jobId, {
      status: 'retrying',
      attempts: nextAttempt,
      timestamps: {
        created: deliveryStatus.timestamps.created,
        lastAttempt: Date.now(),
        nextRetry: nextRetryTime
      }
    }, kvNamespace);
    
    logger.info("Scheduled webhook retry", {
      jobId,
      attempt: nextAttempt,
      delay,
      nextRetryTime: new Date(nextRetryTime).toISOString()
    });
    
    return { 
      success: true, 
      message: `Retry scheduled for attempt ${nextAttempt}`,
      nextRetryTime 
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to handle automatic webhook retry", { error: errorMessage, jobId });
    return { success: false, message: errorMessage };
  }
}

/**
 * Execute webhook delivery with retry logic
 */
export async function executeWebhookDelivery(
  webhookUrl: string,
  payload: VideoAnalysisWebhookPayload,
  headers: Record<string, string> = {},
  deliveryId: string,
  kvNamespace: KVNamespace,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ success: boolean; response?: Response; error?: ClassifiedWebhookError }> {
  let lastError: ClassifiedWebhookError | undefined;
  let response: Response | undefined;
  
  // Get delivery status
  const deliveryStatus = await getWebhookDeliveryStatus(deliveryId, kvNamespace);
  if (!deliveryStatus) {
    return { success: false, error: { type: 'network', message: "Delivery status not found", retryable: false, severity: 'high' } };
  }
  
  const attemptNumber = deliveryStatus.attempts + 1;
  
  try {
    // Prepare request headers
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    
    // Execute webhook delivery
    const startTime = Date.now();
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload)
    });
    const duration = Date.now() - startTime;
    
    // Classify the result
    const errorClass = classifyWebhookError(null, response);
    
    // Record retry attempt
    await recordRetryAttempt(deliveryId, attemptNumber, duration, response, errorClass, kvNamespace);
    
    if (response.ok) {
      // Success
      await updateWebhookDeliveryStatus(deliveryId, {
        status: 'delivered',
        timestamps: {
          created: deliveryStatus.timestamps.created,
          lastAttempt: Date.now(),
          delivered: Date.now()
        },
        response: {
          status: response.status,
          statusText: response.statusText
        }
      }, kvNamespace);
      
      logger.info("Webhook delivered successfully", {
        deliveryId,
        jobId: deliveryStatus.jobId,
        attempt: attemptNumber,
        duration
      });
      
      return { success: true, response };
    } else {
      // Failure
      lastError = errorClass;
      await updateWebhookDeliveryStatus(deliveryId, {
        status: 'failed',
        error: {
          message: errorClass.message,
          type: errorClass.type,
          code: errorClass.code
        },
        response: {
          status: response.status,
          statusText: response.statusText
        }
      }, kvNamespace);
      
      logger.warn("Webhook delivery failed", {
        deliveryId,
        jobId: deliveryStatus.jobId,
        attempt: attemptNumber,
        status: response.status,
        error: errorClass.message,
        duration
      });
      
      return { success: false, response, error: errorClass };
    }
    
  } catch (error) {
    const duration = Date.now() - (deliveryStatus.timestamps.lastAttempt || Date.now());
    const errorClass = classifyWebhookError(error);
    lastError = errorClass;
    
    // Record failed retry attempt
    await recordRetryAttempt(deliveryId, attemptNumber, duration, undefined, errorClass, kvNamespace);
    
    // Update delivery status
    await updateWebhookDeliveryStatus(deliveryId, {
      status: 'failed',
      timestamps: {
        created: deliveryStatus.timestamps.created,
        lastAttempt: Date.now()
      },
      error: {
        message: errorClass.message,
        type: errorClass.type,
        code: errorClass.code
      }
    }, kvNamespace);
    
    logger.error("Webhook delivery failed with exception", {
      deliveryId,
      jobId: deliveryStatus.jobId,
      attempt: attemptNumber,
      error: errorClass.message,
      duration
    });
    
    return { success: false, error: errorClass };
  }
}

/**
 * Record a retry attempt
 */
async function recordRetryAttempt(
  deliveryId: string,
  attemptNumber: number,
  duration: number,
  response?: Response,
  error?: ClassifiedWebhookError,
  kvNamespace?: KVNamespace
): Promise<void> {
  if (!kvNamespace) return;
  
  try {
    const retryRecord: RetryAttemptRecord = {
      id: `retry_${deliveryId}_${attemptNumber}_${Date.now()}`,
      deliveryId,
      attemptNumber,
      timestamp: Date.now(),
      delay: 0, // Will be calculated based on attempt number
      success: !error,
      response: response ? {
        status: response.status,
        statusText: response.statusText,
        duration
      } : undefined,
      error: error ? {
        message: error.message,
        type: error.type,
        code: error.code,
        duration
      } : undefined
    };
    
    const retryKey = `webhook:retry:${deliveryId}:${attemptNumber}`;
    await kvNamespace.put(retryKey, JSON.stringify(retryRecord), {
      expirationTtl: 2592000 // 30 days
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to record retry attempt", { error: errorMessage, deliveryId, attemptNumber });
  }
}

/**
 * Move webhook delivery to dead letter queue
 */
export async function moveToDeadLetterQueue(
  jobId: string,
  kvNamespace: KVNamespace,
  reason: 'max_attempts_exceeded' | 'permanent_failure' | 'invalid_payload' | 'manual'
): Promise<{ success: boolean; deadLetterId?: string; error?: string }> {
  try {
    logger.info("Moving webhook to dead letter queue", { jobId, reason });
    
    // Get delivery status
    const deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    if (!deliveryStatus) {
      return { success: false, error: "No delivery status found for job" };
    }
    
    // Create dead letter entry
    const deadLetterId = `dead_${jobId}_${Date.now()}`;
    const deadLetterEntry: DeadLetterEntry = {
      id: deadLetterId,
      deliveryId: deliveryStatus.id,
      jobId,
      reason,
      timestamp: Date.now(),
      payload: deliveryStatus.payload,
      finalError: deliveryStatus.error || {
        message: "Unknown error",
        type: 'network'
      },
      retryAttempts: deliveryStatus.attempts,
      metadata: {
        severity: 'high',
        category: reason === 'max_attempts_exceeded' ? 'temporary' : 'permanent',
        action: reason === 'permanent_failure' ? 'Contact support' : 'Manual review required'
      }
    };
    
    // Store dead letter entry
    const deadLetterKey = `webhook:dead:${deadLetterId}`;
    await kvNamespace.put(deadLetterKey, JSON.stringify(deadLetterEntry), {
      expirationTtl: 7776000 // 90 days
    });
    
    // Add to dead letter queue set
    const queueKey = 'webhook:queue:dead';
    const currentQueue = await kvNamespace.get(queueKey);
    const queueSet = new Set(JSON.parse(currentQueue || '[]'));
    queueSet.add(deadLetterId);
    await kvNamespace.put(queueKey, JSON.stringify([...queueSet]), {
      expirationTtl: 7776000 // 90 days
    });
    
    // Update delivery status
    await updateWebhookDeliveryStatus(jobId, {
      status: 'dead_letter',
      timestamps: {
        created: deliveryStatus.timestamps.created,
        lastAttempt: deliveryStatus.timestamps.lastAttempt,
        failed: Date.now()
      }
    }, kvNamespace);
    
    logger.info("Webhook moved to dead letter queue", {
      jobId,
      deadLetterId,
      reason,
      retryAttempts: deliveryStatus.attempts
    });
    
    return { success: true, deadLetterId };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to move webhook to dead letter queue", { error: errorMessage, jobId });
    return { success: false, error: errorMessage };
  }
}

/**
 * Process webhook delivery with full retry and error handling logic
 */
export async function processWebhookDelivery(
  payload: VideoAnalysisWebhookPayload,
  webhookUrl: string,
  webhookSecret: string,
  kvNamespace: KVNamespace,
  headers?: Record<string, string>
): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
  try {
    const jobId = payload.job_id;
    logger.info("Processing webhook delivery", { jobId });
    
    // Check for duplicates
    const duplicateCheck = await checkDuplicateWebhook(payload, kvNamespace);
    if (duplicateCheck.isDuplicate) {
      logger.info("Duplicate webhook detected, skipping processing", { jobId });
      return { success: true, error: "Duplicate webhook, already processed" };
    }
    
    // Create or get delivery status
    let deliveryStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
    if (!deliveryStatus) {
      deliveryStatus = await createWebhookDeliveryStatus(
        jobId,
        payload.job_id,
        payload,
        webhookUrl,
        kvNamespace,
        headers
      );
    }
    
    // Execute webhook delivery
    const deliveryResult = await executeWebhookDelivery(
      webhookUrl,
      payload,
      headers || {},
      deliveryStatus.id,
      kvNamespace
    );
    
    if (deliveryResult.success) {
      // Mark webhook as processed
      await markWebhookProcessed(payload, kvNamespace);
      return { success: true, deliveryId: deliveryStatus.id };
    } else {
      // Handle failure
      if (deliveryResult.error?.retryable) {
        // Schedule automatic retry
        const retryResult = await handleAutomaticWebhookRetry(jobId, kvNamespace);
        if (!retryResult.success) {
          logger.error("Failed to schedule automatic retry", { 
            jobId, 
            error: retryResult.message 
          });
        }
      } else {
        // Non-retryable error, move to dead letter queue
        await moveToDeadLetterQueue(jobId, kvNamespace, 'permanent_failure');
      }
      
      return { 
        success: false, 
        deliveryId: deliveryStatus.id,
        error: deliveryResult.error?.message 
      };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to process webhook delivery", { error: errorMessage, jobId: payload.job_id });
    return { success: false, error: errorMessage };
  }
}