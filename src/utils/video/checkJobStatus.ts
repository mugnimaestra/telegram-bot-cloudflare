/**
 * Utility to check video analysis job status
 */

import type { VideoAnalysisJobStatus } from "@/types/videoJob";
import type { WebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { getWebhookDeliveryStatus, formatWebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { logger } from "@/utils/logger";

export async function checkJobStatus(
  serviceUrl: string,
  jobId: string,
  kvNamespace?: KVNamespace,
): Promise<{ success: boolean; job?: VideoAnalysisJobStatus; webhookStatus?: WebhookDeliveryStatus; error?: string }> {
  try {
    logger.info("Checking job status", { serviceUrl, jobId });

    const response = await fetch(`${serviceUrl}/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "Job not found" };
      }
      return {
        success: false,
        error: `Service returned ${response.status}: ${response.statusText}`
      };
    }

    const jobStatus = (await response.json()) as VideoAnalysisJobStatus;

    logger.info("Job status retrieved successfully", {
      jobId,
      status: jobStatus.status,
      progress: jobStatus.progress,
    });

    // Try to get webhook delivery status if KV namespace is provided
    let webhookStatus: WebhookDeliveryStatus | undefined;
    if (kvNamespace) {
      try {
        const retrievedStatus = await getWebhookDeliveryStatus(jobId, kvNamespace);
        if (retrievedStatus) {
          webhookStatus = retrievedStatus;
        }
        if (webhookStatus) {
          logger.debug("Retrieved webhook delivery status", {
            jobId,
            webhookStatus: webhookStatus.status,
            attempts: webhookStatus.attempts
          });
        }
      } catch (error) {
        logger.warn("Failed to retrieve webhook delivery status", {
          jobId,
          error: error instanceof Error ? error.message : String(error)
        });
        // Don't fail the entire status check if webhook status retrieval fails
      }
    }

    return { success: true, job: jobStatus, webhookStatus };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error("Failed to check job status", {
      error: errorMessage,
      serviceUrl,
      jobId,
    });

    return { success: false, error: errorMessage };
  }
}

export function formatJobStatusMessage(
  job: VideoAnalysisJobStatus,
  webhookStatus?: WebhookDeliveryStatus
): string {
  const statusEmoji = {
    processing: '🔄',
    completed: '✅',
    failed: '❌',
  }[job.status] || '⏳';

  const createdAt = new Date(job.created_at);
  const updatedAt = new Date(job.updated_at);

  let message = `${statusEmoji} *Job Status*\n\n` +
                `ID: \`${job.id}\`\n` +
                `Status: ${job.status}\n` +
                `Progress: ${job.progress}%\n` +
                `Created: ${createdAt.toLocaleString()}\n` +
                `Updated: ${updatedAt.toLocaleString()}\n`;

  // Add webhook delivery status if available
  if (webhookStatus) {
    message += `\n📡 *Webhook Delivery*\n`;
    message += `Status: ${webhookStatus.status}\n`;
    message += `Attempts: ${webhookStatus.attempts}/${webhookStatus.maxAttempts}\n`;
    
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
    
    if (webhookStatus.error) {
      message += `Error: ${webhookStatus.error.message}\n`;
    }
    
    // Add action buttons if webhook failed but can be retried
    if (webhookStatus.status === 'failed' && webhookStatus.attempts < webhookStatus.maxAttempts) {
      message += `\n💡 *Actions:*\n`;
      message += `• Retry webhook: /retry_webhook ${job.id}\n`;
    }
    
    if (webhookStatus.status === 'dead_letter') {
      message += `\n💀 *Webhook delivery permanently failed*\n`;
      message += `• Contact support for assistance\n`;
    }
  }

  if (job.status === 'processing') {
    const timeElapsed = Math.floor((Date.now() - createdAt.getTime()) / 1000);
    const minutes = Math.floor(timeElapsed / 60);
    const seconds = timeElapsed % 60;
    
    message += `\n⏱️ Running for: ${minutes}m ${seconds}s\n`;
    
    if (job.progress > 0) {
      // Rough ETA calculation based on progress
      const totalEstimatedTime = (timeElapsed / job.progress) * 100;
      const remainingTime = Math.max(0, totalEstimatedTime - timeElapsed);
      const etaMinutes = Math.floor(remainingTime / 60);
      const etaSeconds = Math.floor(remainingTime % 60);
      
      if (etaMinutes > 0 || etaSeconds > 0) {
        message += `📅 ETA: ~${etaMinutes}m ${etaSeconds}s\n`;
      }
    }
  }

  if (job.status === 'completed' && job.result?.recipe) {
    message += `\n🍳 Recipe: "${job.result.recipe.title}"\n`;
    message += `📝 ${job.result.recipe.ingredients?.length || 0} ingredients, ${job.result.recipe.instructions?.length || 0} steps\n`;
  }

  if (job.status === 'failed') {
    if (job.error_type === 'size_context_limit') {
      message += `\n❌ Size/Context Limitation Detected\n`;
      message += `Error: ${job.error || 'Video exceeds processing limits'}\n`;
      
      if (job.error_details?.max_size_mb) {
        message += `• Maximum file size: ${job.error_details.max_size_mb}MB\n`;
      }
      if (job.error_details?.max_duration_seconds) {
        message += `• Maximum duration: ${job.error_details.max_duration_seconds} seconds\n`;
      }
      if (job.error_details?.max_frames) {
        message += `• Maximum frames: ${job.error_details.max_frames}\n`;
      }
      
      message += `\n💡 Suggestions:\n`;
      if (job.error_details?.suggested_actions && job.error_details.suggested_actions.length > 0) {
        job.error_details.suggested_actions.forEach(action => {
          message += `• ${action}\n`;
        });
      } else {
        message += `• Use a shorter video (under 2 minutes)\n`;
        message += `• Reduce video resolution\n`;
        message += `• Focus on key cooking steps only\n`;
      }
    } else if (job.error_type === 'api_error') {
      message += `\n🔧 API Error Detected\n`;
      message += `Error: ${job.error || 'API processing error'}\n`;
      
      if (job.error_details?.estimated_tokens) {
        message += `• Estimated tokens required: ${job.error_details.estimated_tokens}\n`;
      }
      if (job.error_details?.largest_model_capacity) {
        message += `• Largest model capacity: ${job.error_details.largest_model_capacity}\n`;
      }
      if (job.error_details?.model_name) {
        message += `• Model: ${job.error_details.model_name}\n`;
      }
      
      message += `\n💡 Suggestions:\n`;
      if (job.error_details?.suggestions && job.error_details.suggestions.length > 0) {
        job.error_details.suggestions.forEach(suggestion => {
          message += `• ${suggestion}\n`;
        });
      } else if (job.error_details?.suggested_actions && job.error_details.suggested_actions.length > 0) {
        job.error_details.suggested_actions.forEach(action => {
          message += `• ${action}\n`;
        });
      } else {
        message += `• Try again with a shorter video\n`;
        message += `• Ensure the video clearly shows cooking steps\n`;
        message += `• Check if the video format is supported\n`;
        message += `• Contact support if the issue persists\n`;
      }
    } else if (job.error) {
      message += `\n❌ Error: ${job.error}\n`;
    }
  }

  return message;
}

/**
 * Format webhook delivery status for standalone display
 */
export function formatWebhookOnlyStatusMessage(webhookStatus: WebhookDeliveryStatus): string {
  return formatWebhookDeliveryStatus(webhookStatus);
}