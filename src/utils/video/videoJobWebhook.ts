/**
 * Webhook handler for video analysis job completion notifications
 */

import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import { editMessageText } from "@/utils/telegram/fetchers/editMessageText";
import { formatRecipeMessage } from "./formatRecipe";
import { logger } from "@/utils/logger";
import {
  processWebhookDelivery,
  classifyWebhookError,
  markWebhookProcessed,
  handleAutomaticWebhookRetry,
  moveToDeadLetterQueue
} from "./webhookRetryHandler";
import { createWebhookDeliveryStatus, updateWebhookDeliveryStatus } from "./webhookDeliveryStatus";
import { getWebhookDeliveryStatus } from "./webhookDeliveryStatus";

export async function handleVideoJobWebhook(
  payload: VideoAnalysisWebhookPayload,
  webhookSecret: string,
  providedSecret: string,
  kvNamespace?: KVNamespace,
  webhookUrl?: string,
): Promise<{ success: boolean; error?: string; webhookDeliveryId?: string }> {
  try {
    // Verify webhook authenticity
    if (providedSecret !== webhookSecret) {
      logger.warn("Video job webhook received with invalid secret");
      return { success: false, error: "Invalid webhook secret" };
    }

    logger.info("Processing video job webhook", {
      jobId: payload.job_id,
      status: payload.status,
      chatId: payload.callback_data.chat_id,
      messageId: payload.callback_data.message_id,
    });

    const { job_id, status, result, error, error_type, error_details, callback_data } = payload;
    const { chat_id, message_id, bot_token } = callback_data;

    if (status === 'completed' && result) {
      // Use simplified recipe format directly
      logger.info("Using simplified recipe format from backend", {
        jobId: job_id,
        recipeTitle: result.recipe_title,
        textLength: result.recipe_text.length,
        recipeReady: result.recipe_ready,
      });

      await editMessageText(
        {
          chat_id: chat_id,
          message_id: message_id,
          text: result.recipe_text,
          parse_mode: "MarkdownV2",
        },
        bot_token,
      );

      logger.info("Successfully updated message with simplified recipe format", {
        jobId: job_id,
        chatId: chat_id,
        recipeTitle: result.recipe_title,
      });

    } else if (status === 'failed') {
      // Update message with error
      const errorMessage = error || 'Unknown error occurred';
      
      // Handle different error types with specific user guidance
      let errorDetails = '';
      let suggestedActions = [
        '• Sending a clearer cooking video',
        '• Using a shorter video clip',
        '• Ensuring ingredients and steps are visible'
      ];

      if (error_type === 'size_context_limit') {
        // Handle size/context limitation errors with more specific guidance
        errorDetails = `\n📊 *Size/Context Limitation Detected*\n`;
        
        if (error_details?.max_size_mb) {
          errorDetails += `• Maximum file size: ${error_details.max_size_mb}MB\n`;
        }
        if (error_details?.max_duration_seconds) {
          errorDetails += `• Maximum duration: ${error_details.max_duration_seconds} seconds\n`;
        }
        if (error_details?.max_frames) {
          errorDetails += `• Maximum frames: ${error_details.max_frames}\n`;
        }

        // Use suggested actions from the service if available
        if (error_details?.suggested_actions && error_details.suggested_actions.length > 0) {
          suggestedActions = error_details.suggested_actions.map(action => `• ${action}`);
        } else {
          suggestedActions = [
            '• Use a shorter video (under 2 minutes recommended)',
            '• Ensure good lighting and clear visibility of ingredients',
            '• Focus on key cooking steps only',
            '• Reduce video resolution if file size is too large'
          ];
        }
      } else if (error_type === 'api_error') {
        // Handle Go API specific errors
        errorDetails = `\n🔧 *API Error Detected*\n`;
        
        if (error_details?.estimated_tokens) {
          errorDetails += `• Estimated tokens required: ${error_details.estimated_tokens}\n`;
        }
        if (error_details?.largest_model_capacity) {
          errorDetails += `• Largest model capacity: ${error_details.largest_model_capacity}\n`;
        }
        if (error_details?.model_name) {
          errorDetails += `• Model: ${error_details.model_name}\n`;
        }

        // Use suggestions from the Go API if available, otherwise fallback to suggested_actions
        if (error_details?.suggestions && error_details.suggestions.length > 0) {
          suggestedActions = error_details.suggestions.map(action => `• ${action}`);
        } else if (error_details?.suggested_actions && error_details.suggested_actions.length > 0) {
          suggestedActions = error_details.suggested_actions.map(action => `• ${action}`);
        } else {
          suggestedActions = [
            '• Try again with a shorter video',
            '• Ensure the video clearly shows cooking steps',
            '• Check if the video format is supported',
            '• Contact support if the issue persists'
          ];
        }
      }

      await editMessageText(
        {
          chat_id: chat_id,
          message_id: message_id,
          text: `❌ Video analysis failed\\.\n\n` +
                `Job ID: \`${job_id}\`\n` +
                `Error: ${errorMessage.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&')}${errorDetails}\n\n` +
                `💡 *Try:*\n` +
                suggestedActions.join('\n'),
        },
        bot_token,
      );

      logger.error("Video analysis job failed", {
        jobId: job_id,
        chatId: chat_id,
        error: errorMessage,
        errorType: error_type,
        errorDetails: error_details,
      });
    }

    // Handle webhook delivery tracking and retry logic if KV namespace is provided
    if (kvNamespace && webhookUrl) {
      try {
        // Create webhook delivery status record
        const deliveryStatus = await createWebhookDeliveryStatus(
          job_id,
          job_id,
          payload,
          webhookUrl,
          kvNamespace
        );

        // Mark webhook as processed since we're handling it directly
        await markWebhookProcessed(payload, kvNamespace);
        
        // Get the current delivery status to preserve timestamps
        const currentStatus = await getWebhookDeliveryStatus(job_id, kvNamespace);
        
        // Update delivery status as delivered since we've successfully processed it
        await updateWebhookDeliveryStatus(job_id, {
          status: 'delivered',
          timestamps: {
            created: currentStatus?.timestamps.created || Date.now(),
            lastAttempt: Date.now(),
            delivered: Date.now()
          }
        }, kvNamespace);

        logger.info("Webhook delivery processed successfully", {
          jobId: job_id,
          deliveryId: currentStatus?.id
        });

        // Clean up job metadata from KV storage
        try {
          await kvNamespace.delete(`job:${job_id}`);
          logger.debug("Cleaned up job from KV storage", { jobId: job_id });
        } catch (kvError) {
          logger.warn("Failed to clean up job from KV", {
            jobId: job_id,
            error: kvError instanceof Error ? kvError.message : String(kvError),
          });
        }

        return {
          success: true,
          webhookDeliveryId: currentStatus?.id
        };

      } catch (deliveryError) {
        const errorMessage = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
        logger.error("Failed to process webhook delivery tracking", {
          jobId: job_id,
          error: errorMessage
        });

        // Still process the webhook normally even if tracking fails
        try {
          await markWebhookProcessed(payload, kvNamespace);
        } catch (markError) {
          logger.warn("Failed to mark webhook as processed", {
            jobId: job_id,
            error: markError instanceof Error ? markError.message : String(markError)
          });
        }

        // Clean up job metadata from KV storage
        try {
          await kvNamespace.delete(`job:${job_id}`);
          logger.debug("Cleaned up job from KV storage", { jobId: job_id });
        } catch (kvError) {
          logger.warn("Failed to clean up job from KV", {
            jobId: job_id,
            error: kvError instanceof Error ? kvError.message : String(kvError),
          });
        }

        return { success: true };
      }
    } else {
      // Clean up job metadata from KV storage if no webhook URL provided
      if (kvNamespace) {
        try {
          await kvNamespace.delete(`job:${job_id}`);
          logger.debug("Cleaned up job from KV storage", { jobId: job_id });
        } catch (kvError) {
          logger.warn("Failed to clean up job from KV", {
            jobId: job_id,
            error: kvError instanceof Error ? kvError.message : String(kvError),
          });
        }
      }

      return { success: true };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error("Failed to process video job webhook", {
      error: errorMessage,
      jobId: payload.job_id,
      chatId: payload.callback_data?.chat_id,
    });

    // Try to update webhook delivery status with error if KV namespace is provided
    if (kvNamespace && webhookUrl) {
      try {
        const errorClass = classifyWebhookError(error);
        const currentStatus = await getWebhookDeliveryStatus(payload.job_id, kvNamespace);
        await updateWebhookDeliveryStatus(payload.job_id, {
          status: 'failed',
          timestamps: {
            created: currentStatus?.timestamps.created || Date.now(),
            lastAttempt: Date.now()
          },
          error: {
            message: errorMessage,
            type: errorClass.type,
            code: errorClass.code
          }
        }, kvNamespace);
      } catch (statusError) {
        logger.warn("Failed to update webhook delivery status with error", {
          jobId: payload.job_id,
          error: statusError instanceof Error ? statusError.message : String(statusError)
        });
      }
    }

    return { success: false, error: errorMessage };
  }
}

export function isValidWebhookPayload(payload: any): payload is VideoAnalysisWebhookPayload {
  // Log detailed validation info for debugging
  logger.info("[isValidWebhookPayload] Validating payload", {
    hasPayload: !!payload,
    payloadType: typeof payload,
    jobId: { exists: !!payload?.job_id, type: typeof payload?.job_id, value: payload?.job_id },
    status: { exists: !!payload?.status, type: typeof payload?.status, value: payload?.status },
    hasResult: !!payload?.result,
    hasCallbackData: !!payload?.callback_data,
    chatId: {
      exists: !!payload?.callback_data?.chat_id,
      type: typeof payload?.callback_data?.chat_id,
      value: payload?.callback_data?.chat_id,
      isNumber: typeof payload?.callback_data?.chat_id === 'number',
      canConvertToNumber: !isNaN(Number(payload?.callback_data?.chat_id))
    },
    messageId: {
      exists: !!payload?.callback_data?.message_id,
      type: typeof payload?.callback_data?.message_id,
      value: payload?.callback_data?.message_id,
      isNumber: typeof payload?.callback_data?.message_id === 'number',
      canConvertToNumber: !isNaN(Number(payload?.callback_data?.message_id))
    },
    botToken: {
      exists: !!payload?.callback_data?.bot_token,
      type: typeof payload?.callback_data?.bot_token,
      length: payload?.callback_data?.bot_token?.length
    }
  });

  // Basic structure validation
  if (!payload || typeof payload !== 'object') {
    logger.error("[isValidWebhookPayload] Payload is null, undefined, or not an object", {
      received: payload,
      type: typeof payload
    });
    return false;
  }

  // Validate job_id
  if (typeof payload.job_id !== 'string' || !payload.job_id.trim()) {
    logger.error("[isValidWebhookPayload] Invalid or missing job_id", {
      actualType: typeof payload.job_id,
      value: payload.job_id,
      isEmpty: typeof payload.job_id === 'string' && !payload.job_id.trim()
    });
    return false;
  }

  // Validate status
  if (payload.status !== 'completed' && payload.status !== 'failed') {
    logger.error("[isValidWebhookPayload] Invalid status value", {
      status: payload.status,
      type: typeof payload.status,
      expected: ['completed', 'failed']
    });
    return false;
  }

  // Validate callback_data exists
  if (!payload.callback_data) {
    logger.error("[isValidWebhookPayload] callback_data is missing or null");
    return false;
  }

  // Validate result structure when status is 'completed'
  if (payload.status === 'completed') {
    if (!payload.result) {
      logger.error("[isValidWebhookPayload] result is required when status is 'completed'");
      return false;
    }

    if (typeof payload.result.recipe_text !== 'string' || !payload.result.recipe_text.trim()) {
      logger.error("[isValidWebhookPayload] Invalid or missing recipe_text in result", {
        actualType: typeof payload.result.recipe_text,
        value: payload.result.recipe_text,
        isEmpty: typeof payload.result.recipe_text === 'string' && !payload.result.recipe_text.trim()
      });
      return false;
    }

    if (typeof payload.result.recipe_title !== 'string' || !payload.result.recipe_title.trim()) {
      logger.error("[isValidWebhookPayload] Invalid or missing recipe_title in result", {
        actualType: typeof payload.result.recipe_title,
        value: payload.result.recipe_title,
        isEmpty: typeof payload.result.recipe_title === 'string' && !payload.result.recipe_title.trim()
      });
      return false;
    }

    if (typeof payload.result.recipe_ready !== 'boolean') {
      logger.error("[isValidWebhookPayload] Invalid or missing recipe_ready in result", {
        actualType: typeof payload.result.recipe_ready,
        value: payload.result.recipe_ready
      });
      return false;
    }
  }

  // Validate error structure when status is 'failed'
  if (payload.status === 'failed') {
    // Validate error field
    if (typeof payload.error !== 'string' || !payload.error.trim()) {
      logger.error("[isValidWebhookPayload] Invalid or missing error field when status is 'failed'", {
        actualType: typeof payload.error,
        value: payload.error,
        isEmpty: typeof payload.error === 'string' && !payload.error.trim()
      });
      return false;
    }

    // Validate error_type if present
    if (payload.error_type !== undefined) {
      const validErrorTypes = ['size_context_limit', 'processing_error', 'network_error', 'unknown_error', 'api_error'];
      if (!validErrorTypes.includes(payload.error_type)) {
        logger.error("[isValidWebhookPayload] Invalid error_type value", {
          errorType: payload.error_type,
          type: typeof payload.error_type,
          expected: validErrorTypes
        });
        return false;
      }
      
      logger.info("[isValidWebhookPayload] Valid error_type detected", {
        errorType: payload.error_type
      });
    }

    // Validate error_details if present - accept both original and Go API formats
    if (payload.error_details !== undefined) {
      if (typeof payload.error_details !== 'object' || payload.error_details === null) {
        logger.error("[isValidWebhookPayload] error_details is not an object", {
          actualType: typeof payload.error_details,
          value: payload.error_details
        });
        return false;
      }

      const errorDetails = payload.error_details;
      
      // Check for original format fields
      const hasOriginalFormatFields =
        errorDetails.max_size_mb !== undefined ||
        errorDetails.max_duration_seconds !== undefined ||
        errorDetails.max_frames !== undefined ||
        errorDetails.suggested_actions !== undefined;

      // Check for Go API format fields
      const hasGoApiFormatFields =
        errorDetails.estimated_tokens !== undefined ||
        errorDetails.largest_model_capacity !== undefined ||
        errorDetails.model_name !== undefined ||
        errorDetails.suggestions !== undefined;

      // Validate that error_details contains at least one valid field from either format
      if (!hasOriginalFormatFields && !hasGoApiFormatFields) {
        logger.error("[isValidWebhookPayload] error_details contains no valid fields from either format", {
          errorDetails,
          originalFormatFields: ['max_size_mb', 'max_duration_seconds', 'max_frames', 'suggested_actions'],
          goApiFormatFields: ['estimated_tokens', 'largest_model_capacity', 'model_name', 'suggestions']
        });
        return false;
      }

      // Validate individual fields if they exist
      // Original format fields validation
      if (errorDetails.max_size_mb !== undefined && typeof errorDetails.max_size_mb !== 'number') {
        logger.error("[isValidWebhookPayload] Invalid max_size_mb in error_details", {
          actualType: typeof errorDetails.max_size_mb,
          value: errorDetails.max_size_mb
        });
        return false;
      }

      if (errorDetails.max_duration_seconds !== undefined && typeof errorDetails.max_duration_seconds !== 'number') {
        logger.error("[isValidWebhookPayload] Invalid max_duration_seconds in error_details", {
          actualType: typeof errorDetails.max_duration_seconds,
          value: errorDetails.max_duration_seconds
        });
        return false;
      }

      if (errorDetails.max_frames !== undefined && typeof errorDetails.max_frames !== 'number') {
        logger.error("[isValidWebhookPayload] Invalid max_frames in error_details", {
          actualType: typeof errorDetails.max_frames,
          value: errorDetails.max_frames
        });
        return false;
      }

      if (errorDetails.suggested_actions !== undefined && (!Array.isArray(errorDetails.suggested_actions) ||
          !errorDetails.suggested_actions.every((action: string) => typeof action === 'string'))) {
        logger.error("[isValidWebhookPayload] Invalid suggested_actions in error_details", {
          actualType: typeof errorDetails.suggested_actions,
          value: errorDetails.suggested_actions
        });
        return false;
      }

      // Go API format fields validation
      if (errorDetails.estimated_tokens !== undefined && typeof errorDetails.estimated_tokens !== 'number') {
        logger.error("[isValidWebhookPayload] Invalid estimated_tokens in error_details", {
          actualType: typeof errorDetails.estimated_tokens,
          value: errorDetails.estimated_tokens
        });
        return false;
      }

      if (errorDetails.largest_model_capacity !== undefined && typeof errorDetails.largest_model_capacity !== 'number') {
        logger.error("[isValidWebhookPayload] Invalid largest_model_capacity in error_details", {
          actualType: typeof errorDetails.largest_model_capacity,
          value: errorDetails.largest_model_capacity
        });
        return false;
      }

      if (errorDetails.model_name !== undefined && (typeof errorDetails.model_name !== 'string' || !errorDetails.model_name.trim())) {
        logger.error("[isValidWebhookPayload] Invalid model_name in error_details", {
          actualType: typeof errorDetails.model_name,
          value: errorDetails.model_name,
          isEmpty: typeof errorDetails.model_name === 'string' && !errorDetails.model_name.trim()
        });
        return false;
      }

      if (errorDetails.suggestions !== undefined && (!Array.isArray(errorDetails.suggestions) ||
          !errorDetails.suggestions.every((suggestion: string) => typeof suggestion === 'string'))) {
        logger.error("[isValidWebhookPayload] Invalid suggestions in error_details", {
          actualType: typeof errorDetails.suggestions,
          value: errorDetails.suggestions
        });
        return false;
      }

      logger.info("[isValidWebhookPayload] Valid error_details detected", {
        hasOriginalFormatFields,
        hasGoApiFormatFields,
        errorDetails
      });
    }
  }

  // Validate callback_data.chat_id
  const chatId = payload.callback_data.chat_id;
  if (typeof chatId !== 'number' && (typeof chatId !== 'string' || isNaN(Number(chatId)) || !String(chatId).trim())) {
    logger.error("[isValidWebhookPayload] chat_id is not a valid number", {
      actualType: typeof chatId,
      value: chatId,
      canConvert: typeof chatId === 'string' && !isNaN(Number(chatId)),
      isEmpty: typeof chatId === 'string' && !String(chatId).trim()
    });
    return false;
  }

  // Validate callback_data.message_id
  const messageId = payload.callback_data.message_id;
  if (typeof messageId !== 'number' && (typeof messageId !== 'string' || isNaN(Number(messageId)) || !String(messageId).trim())) {
    logger.error("[isValidWebhookPayload] message_id is not a valid number", {
      actualType: typeof messageId,
      value: messageId,
      canConvert: typeof messageId === 'string' && !isNaN(Number(messageId)),
      isEmpty: typeof messageId === 'string' && !String(messageId).trim()
    });
    return false;
  }

  // Validate callback_data.bot_token
  if (typeof payload.callback_data.bot_token !== 'string' || !payload.callback_data.bot_token.trim()) {
    logger.error("[isValidWebhookPayload] bot_token is not a valid string", {
      actualType: typeof payload.callback_data.bot_token,
      value: payload.callback_data.bot_token,
      isEmpty: typeof payload.callback_data.bot_token === 'string' && !payload.callback_data.bot_token.trim()
    });
    return false;
  }

  // Type coercion for numeric fields to ensure compatibility
  if (typeof payload.callback_data.chat_id === 'string') {
    const originalValue = payload.callback_data.chat_id;
    payload.callback_data.chat_id = Number(payload.callback_data.chat_id);
    logger.info("[isValidWebhookPayload] Converted chat_id from string to number", {
      originalValue,
      newValue: payload.callback_data.chat_id
    });
  }

  if (typeof payload.callback_data.message_id === 'string') {
    const originalValue = payload.callback_data.message_id;
    payload.callback_data.message_id = Number(payload.callback_data.message_id);
    logger.info("[isValidWebhookPayload] Converted message_id from string to number", {
      originalValue,
      newValue: payload.callback_data.message_id
    });
  }

  logger.info("[isValidWebhookPayload] Validation passed for simplified format", {
    jobId: payload.job_id,
    status: payload.status,
    hasRecipeText: !!payload.result?.recipe_text,
    recipeTitle: payload.result?.recipe_title,
    recipeReady: payload.result?.recipe_ready
  });
  return true;
}