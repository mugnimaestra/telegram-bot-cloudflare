/**
 * Webhook handler for video analysis job completion notifications
 */

import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import { editMessageText } from "@/utils/telegram/fetchers/editMessageText";
import { formatRecipeMessage } from "./formatRecipe";
import { logger } from "@/utils/logger";

export async function handleVideoJobWebhook(
  payload: VideoAnalysisWebhookPayload,
  webhookSecret: string,
  providedSecret: string,
  kvNamespace?: KVNamespace,
): Promise<{ success: boolean; error?: string }> {
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

    const { job_id, status, result, error, callback_data } = payload;
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
      });

      const formattedRecipe = formatRecipeMessage({
        title: recipe.title || "Recipe from Video",
        ingredients: (recipe.ingredients || []).map(ing => ({
          item: ing.name || "",
          amount: ing.amount && ing.unit ? `${ing.amount} ${ing.unit}`.trim() : (ing.amount || ""),
          preparation: ing.notes || "",
        })),
        equipment: [], // Default empty array as equipment data is not provided by the API
        instructions: (recipe.instructions || []).map(inst => ({
          step: inst.step || 0,
          description: inst.instruction || "",
          duration: inst.time || "",
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
      
      await editMessageText(
        {
          chat_id: chat_id,
          message_id: message_id,
          text: `❌ Video analysis failed\\.\n\n` +
                `Job ID: \`${job_id}\`\n` +
                `Error: ${errorMessage.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&')}\n\n` +
                `💡 *Try:*\n` +
                `• Sending a clearer cooking video\n` +
                `• Using a shorter video clip\n` +
                `• Ensuring ingredients and steps are visible`,
        },
        bot_token,
      );

      logger.error("Video analysis job failed", {
        jobId: job_id,
        chatId: chat_id,
        error: errorMessage,
      });
    }

    // Clean up job metadata from KV storage
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

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error("Failed to process video job webhook", {
      error: errorMessage,
      jobId: payload.job_id,
      chatId: payload.callback_data?.chat_id,
    });

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