/**
 * Utilities for formatting webhook delivery status messages for user display
 */

import type { WebhookDeliveryStatus } from "./webhookDeliveryStatus";
import type { DeadLetterEntry } from "./webhookRetryHandler";
import { logger } from "@/utils/logger";

/**
 * Format webhook delivery status with appropriate emojis and user-friendly messages
 */
export function formatWebhookStatusMessage(
  webhookStatus: WebhookDeliveryStatus,
  includeActions: boolean = true
): string {
  const statusEmoji = {
    pending: '⏳',
    delivered: '✅',
    failed: '❌',
    retrying: '🔄',
    dead_letter: '💀'
  }[webhookStatus.status];

  let message = `${statusEmoji} *Webhook Delivery Status*\n\n`;
  message += `Job ID: \`${webhookStatus.jobId}\`\n`;
  message += `Status: ${formatWebhookStatusText(webhookStatus.status)}\n`;
  message += `Attempts: ${webhookStatus.attempts}/${webhookStatus.maxAttempts}\n`;
  
  // Add timestamps
  if (webhookStatus.timestamps.lastAttempt) {
    const lastAttempt = new Date(webhookStatus.timestamps.lastAttempt);
    message += `Last Attempt: ${lastAttempt.toLocaleString()}\n`;
  }
  
  if (webhookStatus.status === 'retrying' && webhookStatus.timestamps.nextRetry) {
    const nextRetry = new Date(webhookStatus.timestamps.nextRetry);
    message += `Next Retry: ${nextRetry.toLocaleString()}\n`;
  }
  
  if (webhookStatus.status === 'delivered' && webhookStatus.timestamps.delivered) {
    const delivered = new Date(webhookStatus.timestamps.delivered);
    message += `Delivered: ${delivered.toLocaleString()}\n`;
  }

  // Add error information if available
  if (webhookStatus.error) {
    message += `\n❌ *Error Details*\n`;
    message += `Type: ${formatErrorType(webhookStatus.error.type)}\n`;
    message += `Message: ${webhookStatus.error.message}\n`;
    if (webhookStatus.error.code) {
      message += `Code: ${webhookStatus.error.code}\n`;
    }
  }

  // Add response information if available
  if (webhookStatus.response) {
    message += `\n📡 *Response*\n`;
    message += `Status: ${webhookStatus.response.status} ${webhookStatus.response.statusText}\n`;
    if (webhookStatus.response.body) {
      // Truncate long response bodies
      const body = webhookStatus.response.body.length > 100 
        ? webhookStatus.response.body.substring(0, 100) + '...' 
        : webhookStatus.response.body;
      message += `Body: ${body}\n`;
    }
  }

  // Add action suggestions
  if (includeActions) {
    message += `\n💡 *Actions*\n`;
    message += getActionSuggestions(webhookStatus);
  }

  return message;
}

/**
 * Format webhook status text to be more user-friendly
 */
function formatWebhookStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'Pending Delivery',
    delivered: 'Delivered Successfully',
    failed: 'Failed',
    retrying: 'Retrying',
    dead_letter: 'Permanently Failed'
  };
  
  return statusMap[status] || status;
}

/**
 * Format error type to be more user-friendly
 */
function formatErrorType(type: string): string {
  const errorTypeMap: Record<string, string> = {
    network: 'Network Error',
    server: 'Server Error',
    client: 'Client Error',
    timeout: 'Timeout Error'
  };
  
  return errorTypeMap[type] || type;
}

/**
 * Get action suggestions based on webhook status
 */
function getActionSuggestions(webhookStatus: WebhookDeliveryStatus): string {
  switch (webhookStatus.status) {
    case 'pending':
      return '⏳ Webhook delivery is pending. Please wait for the system to process it.\n' +
             '• Check status later: /status ' + webhookStatus.jobId + '\n' +
             '• View webhook details: /webhook_status ' + webhookStatus.jobId;
    
    case 'delivered':
      return '✅ Webhook delivered successfully!\n' +
             '• View job details: /status ' + webhookStatus.jobId;
    
    case 'failed':
      if (webhookStatus.attempts < webhookStatus.maxAttempts) {
        return '🔄 Webhook delivery failed but can be retried.\n' +
               '• Retry manually: /retry_webhook ' + webhookStatus.jobId + '\n' +
               '• Reset and retry: /retry_webhook ' + webhookStatus.jobId + ' reset\n' +
               '• View job details: /status ' + webhookStatus.jobId;
      } else {
        return '💀 Maximum retry attempts exceeded.\n' +
               '• Webhook moved to dead letter queue.\n' +
               '• View dead letter queue: /dead_letter_queue\n' +
               '• Contact support for assistance.';
      }
    
    case 'retrying':
      return '🔄 Webhook is currently being retried.\n' +
             '• Next attempt scheduled automatically.\n' +
             '• View job details: /status ' + webhookStatus.jobId + '\n' +
             '• View webhook details: /webhook_status ' + webhookStatus.jobId;
    
    case 'dead_letter':
      return '💀 Webhook delivery permanently failed.\n' +
             '• Retry from dead letter: /retry_dead_letter ' + webhookStatus.jobId + '\n' +
             '• View dead letter queue: /dead_letter_queue\n' +
             '• Contact support for assistance.';
    
    default:
      return '❓ Unknown webhook status.\n' +
             '• View job details: /status ' + webhookStatus.jobId + '\n' +
             '• Contact support for assistance.';
  }
}

/**
 * Format retry attempt information with timestamps and error details
 */
export function formatRetryAttemptInfo(
  attemptNumber: number,
  timestamp: number,
  success: boolean,
  error?: string,
  responseStatus?: number,
  duration?: number
): string {
  const date = new Date(timestamp);
  const statusEmoji = success ? '✅' : '❌';
  
  let message = `${statusEmoji} *Attempt ${attemptNumber}*\n`;
  message += `Time: ${date.toLocaleString()}\n`;
  
  if (duration) {
    message += `Duration: ${duration}ms\n`;
  }
  
  if (responseStatus) {
    message += `Response: ${responseStatus}\n`;
  }
  
  if (error) {
    message += `Error: ${error}\n`;
  }
  
  message += success ? 'Status: Success\n' : 'Status: Failed\n';
  
  return message;
}

/**
 * Format dead letter queue entry for user display
 */
export function formatDeadLetterEntry(entry: DeadLetterEntry): string {
  const reasonEmoji = {
    max_attempts_exceeded: '🔄',
    permanent_failure: '❌',
    invalid_payload: '⚠️',
    manual: '👤'
  }[entry.reason] || '❓';

  const date = new Date(entry.timestamp);
  
  let message = `${reasonEmoji} *Dead Letter Entry*\n\n`;
  message += `Entry ID: \`${entry.id}\`\n`;
  message += `Job ID: \`${entry.jobId}\`\n`;
  message += `Reason: ${formatDeadLetterReason(entry.reason)}\n`;
  message += `Added: ${date.toLocaleString()}\n`;
  message += `Retry Attempts: ${entry.retryAttempts}\n`;
  
  if (entry.finalError) {
    message += `\n❌ *Final Error*\n`;
    message += `Type: ${formatErrorType(entry.finalError.type)}\n`;
    message += `Message: ${entry.finalError.message}\n`;
    if (entry.finalError.code) {
      message += `Code: ${entry.finalError.code}\n`;
    }
  }
  
  message += `\n💡 *Actions*\n`;
  message += `• Retry this entry: /retry_dead_letter ${entry.id}\n`;
  message += `• View all dead letter entries: /dead_letter_queue`;
  
  return message;
}

/**
 * Format dead letter reason to be more user-friendly
 */
function formatDeadLetterReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    max_attempts_exceeded: 'Maximum Retry Attempts Exceeded',
    permanent_failure: 'Permanent Failure',
    invalid_payload: 'Invalid Payload',
    manual: 'Manual Addition'
  };
  
  return reasonMap[reason] || reason;
}

/**
 * Create a summary message for webhook status
 */
export function formatWebhookSummary(webhookStatus: WebhookDeliveryStatus): string {
  const statusEmoji = {
    pending: '⏳',
    delivered: '✅',
    failed: '❌',
    retrying: '🔄',
    dead_letter: '💀'
  }[webhookStatus.status];

  const summary = `${statusEmoji} ${formatWebhookStatusText(webhookStatus.status)}`;
  
  if (webhookStatus.attempts > 0) {
    return `${summary} (${webhookStatus.attempts}/${webhookStatus.maxAttempts})`;
  }
  
  return summary;
}

/**
 * Format webhook retry statistics
 */
export function formatWebhookRetryStats(
  totalAttempts: number,
  successfulAttempts: number,
  failedAttempts: number,
  lastAttempt?: Date,
  nextRetry?: Date
): string {
  let message = '📊 *Webhook Retry Statistics*\n\n';
  message += `Total Attempts: ${totalAttempts}\n`;
  message += `Successful: ${successfulAttempts}\n`;
  message += `Failed: ${failedAttempts}\n`;
  
  if (lastAttempt) {
    message += `Last Attempt: ${lastAttempt.toLocaleString()}\n`;
  }
  
  if (nextRetry) {
    message += `Next Retry: ${nextRetry.toLocaleString()}\n`;
  }
  
  // Calculate success rate
  const successRate = totalAttempts > 0 ? Math.round((successfulAttempts / totalAttempts) * 100) : 0;
  message += `Success Rate: ${successRate}%\n`;
  
  return message;
}

/**
 * Format a confirmation message for clearing the dead letter queue
 */
export function formatClearDeadLetterConfirmation(stats: { totalEntries: number }): string {
  return `⚠️ *Confirm Dead Letter Queue Clear*\n\n` +
         `You are about to clear ${stats.totalEntries} entries from the dead letter queue.\n\n` +
         `❗ *This action cannot be undone!*\n\n` +
         `Entries will be permanently deleted and cannot be recovered.\n\n` +
         `To confirm, reply with:\n` +
         `\`/clear_dead_letter confirm\`\n\n` +
         `To cancel, simply ignore this message or send any other command.`;
}

/**
 * Format webhook retry result message
 */
export function formatWebhookRetryResult(
  success: boolean,
  jobId: string,
  message?: string,
  retryId?: string,
  scheduledAt?: Date
): string {
  if (success) {
    let resultMessage = '✅ *Webhook Retry Scheduled*\n\n';
    resultMessage += `Job ID: \`${jobId}\`\n`;
    
    if (retryId) {
      resultMessage += `Retry ID: \`${retryId}\`\n`;
    }
    
    if (scheduledAt) {
      resultMessage += `Scheduled for: ${scheduledAt.toLocaleString()}\n`;
    }
    
    if (message) {
      resultMessage += `\n${message}`;
    }
    
    resultMessage += `\n💡 *Next Steps*\n`;
    resultMessage += `• Monitor progress: /status ${jobId}\n`;
    resultMessage += `• Check webhook status: /webhook_status ${jobId}`;
    
    return resultMessage;
  } else {
    return `❌ *Webhook Retry Failed*\n\n` +
           `Job ID: \`${jobId}\`\n` +
           `Error: ${message || 'Unknown error'}\n\n` +
           `💡 *Suggestions*\n` +
           `• Check webhook status: /webhook_status ${jobId}\n` +
           `• Try reset and retry: /retry_webhook ${jobId} reset\n` +
           `• Contact support if the issue persists`;
  }
}