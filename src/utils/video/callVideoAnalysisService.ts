/**
 * Service to call external video analysis Go service
 */

import type { CookingRecipe } from "./analyzeVideo";
import { logger } from "@/utils/logger";
import { fetchWithRetry } from "./fetchWithRetry";

export interface VideoAnalysisRequest {
  videoUrl: string;
  userId?: number;
  chatId?: number;
}

export interface VideoAnalysisResponse {
  success: boolean;
  recipe?: CookingRecipe;
  error?: string;
}

/**
 * Call external Go video analysis service
 */
export async function callVideoAnalysisService(
  serviceUrl: string,
  request: VideoAnalysisRequest,
): Promise<VideoAnalysisResponse> {
  try {
    logger.info("Calling video analysis service", {
      serviceUrl,
      videoUrl: request.videoUrl,
      userId: request.userId,
      chatId: request.chatId,
    });

    // Prepare the request payload
    const payload = {
      video_url: request.videoUrl,
      user_id: request.userId,
      chat_id: request.chatId,
    };

    // Make the API call with retry logic
    const response = await fetchWithRetry(`${serviceUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot/1.0',
      },
      body: JSON.stringify(payload),
    }, 3, 120000); // 2 minutes for video analysis

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: "Job not found",
        };
      }
      throw new Error(`Service returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as VideoAnalysisResponse;

    logger.info("Video analysis service response received", {
      success: result.success,
      hasRecipe: !!result.recipe,
      error: result.error,
    });

    if (result.success && result.recipe) {
      // Validate the recipe structure
      const recipe = result.recipe as CookingRecipe;

      if (!recipe.title || !recipe.ingredients || !recipe.instructions) {
        logger.warn("Invalid recipe structure from service", {
          hasTitle: !!recipe.title,
          ingredientsCount: recipe.ingredients?.length,
          instructionsCount: recipe.instructions?.length,
        });

        return {
          success: false,
          error: "Service returned invalid recipe format",
        };
      }

      return {
        success: true,
        recipe,
      };
    } else {
      return {
        success: false,
        error: result.error || "Service failed to analyze video",
      };
    }

  } catch (error) {
    logger.error("Failed to call video analysis service", {
      error: error instanceof Error ? error.message : String(error),
      serviceUrl,
      videoUrl: request.videoUrl,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Service communication failed",
    };
  }
}

