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
  botToken?: string;
  callbackUrl?: string;
  messageId?: number;
}

export interface VideoAnalysisResponse {
  success: boolean;
  recipe?: CookingRecipe;
  error?: string;
  error_type?:
    | "size_context_limit"
    | "processing_error"
    | "network_error"
    | "unknown_error";
  error_details?: {
    max_size_mb?: number;
    max_duration_seconds?: number;
    max_frames?: number;
    suggested_actions?: string[];
  };
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
      hasBotToken: !!request.botToken,
      callbackUrl: request.callbackUrl,
    });

    // Prepare the request payload with callback structure for async processing
    const payload = {
      video_url: request.videoUrl,
      bot_token: request.botToken,
      callback: request.callbackUrl ? {
        type: 'webhook' as const,
        webhook_url: request.callbackUrl,
        chat_id: request.chatId || 0,
        message_id: request.messageId || 0,
      } : undefined,
      metadata: {
        user_id: request.userId,
        timestamp: Date.now(),
      },
    };

    // Make the API call with retry logic
    logger.debug("callVideoAnalysisService calling fetchWithRetry", {
      url: `${serviceUrl}/analyze`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TelegramBot/1.0",
      },
      body: payload,
    });

    const response = await fetchWithRetry(
      `${serviceUrl}/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TelegramBot/1.0",
        },
        body: JSON.stringify(payload),
      },
      3,
      120000,
    ); // 2 minutes for video analysis

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: "Job not found",
        };
      }
      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || "Invalid request format",
        };
      }
      throw new Error(
        `Service returned ${response.status}: ${response.statusText}`,
      );
    }

    // Handle 202 (Job accepted) response for async processing
    if (response.status === 202) {
      const result = await response.json();
      
      logger.info("Video analysis job accepted for async processing", {
        jobId: result.job_id,
        status: result.status,
        message: result.message,
      });

      return {
        success: true,
        // No recipe yet - it will come via webhook callback
      };
    }

    // Handle other successful responses (though 202 is expected for async processing)
    const result = (await response.json()) as VideoAnalysisResponse;

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
      error:
        error instanceof Error ? error.message : "Service communication failed",
    };
  }
}
