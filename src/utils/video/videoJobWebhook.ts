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

    if (status === 'completed' && result?.recipe) {
      // Format and send the recipe
      const recipe = result.recipe;
      
      // Log the raw recipe data for debugging
      logger.debug("Raw recipe data from backend", {
        recipe: JSON.stringify(recipe, null, 2),
        title: recipe.title,
        ingredientsCount: recipe.ingredients?.length || 0,
        instructionsCount: recipe.instructions?.length || 0,
        hasTitle: !!recipe.title,
        hasIngredients: Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0,
        hasInstructions: Array.isArray(recipe.instructions) && recipe.instructions.length > 0,
        rawIngredients: recipe.ingredients,
        rawInstructions: recipe.instructions,
        // Check if ingredients have proper data
        firstIngredient: recipe.ingredients?.[0],
        firstInstruction: recipe.instructions?.[0],
      });

      const formattedRecipe = formatRecipeMessage({
        title: recipe.title || recipe.recipe_title || "Recipe from Video",
        ingredients: (recipe.ingredients || []).map(ing => ({
          item: ing.name || ing.item || "",
          amount: ing.amount && ing.unit ? `${ing.amount} ${ing.unit}`.trim() : (ing.amount || ""),
          preparation: ing.notes || ing.preparation || "",
        })),
        equipment: [], // Default empty array as equipment data is not provided by the API
        instructions: (recipe.instructions || []).map(inst => ({
          step: inst.step || inst.step_number || 0,
          description: inst.instruction || inst.action || "",
          duration: inst.time || inst.duration || "",
        })),
        prepTime: recipe.prep_time,
        cookTime: recipe.cook_time,
        totalTime: recipe.total_time,
        servings: recipe.servings,
        difficulty: recipe.difficulty,
        notes: recipe.notes,
      });

      // Update the original message with the recipe
      await editMessageText(
        {
          chat_id: chat_id,
          message_id: message_id,
          text: formattedRecipe,
          parse_mode: "MarkdownV2",
        },
        bot_token,
      );

      logger.info("Successfully updated message with recipe", {
        jobId: job_id,
        chatId: chat_id,
        recipeTitle: recipe.title,
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
  return (
    payload &&
    typeof payload.job_id === 'string' &&
    (payload.status === 'completed' || payload.status === 'failed') &&
    payload.callback_data &&
    typeof payload.callback_data.chat_id === 'number' &&
    typeof payload.callback_data.message_id === 'number' &&
    typeof payload.callback_data.bot_token === 'string'
  );
}