/**
 * Video message handler for cooking recipe extraction using external Go service
 */

import type { Message, TelegramResponse } from "@/types/telegram";
import type { R2Bucket } from "@cloudflare/workers-types";
import { formatRecipeMessage } from "./formatRecipe";
import { uploadVideoToR2 } from "./uploadVideoToR2";
import { callVideoAnalysisService } from "./callVideoAnalysisService";
import { sendMarkdownV2Text } from "@/utils/telegram/sendMarkdownV2Text";
import { apiUrl } from "@/utils/telegram/apiUrl";
import { editMessageText } from "@/utils/telegram/fetchers/editMessageText";
import { logger } from "@/utils/logger";
import { fetchWithRetry } from "./fetchWithRetry";

// Limits for Cloudflare Workers constraints
const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // Increased to 10MB for R2 storage (less processing overhead)


interface TelegramFileInfo {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface TelegramFileResponse {
  ok: boolean;
  result: TelegramFileInfo;
  description?: string;
}

export async function handleVideoAnalysis(
  token: string,
  message: Message,
  bucket: R2Bucket | null,
  bucketName: string,
  publicUrlBase: string,
  serviceUrl: string,
): Promise<TelegramResponse> {
  // Extract chatId early for error handling
  const chatId = message?.chat?.id;
  let processingMsg: TelegramResponse | null = null;
  
  try {
    // Boundary checks (moved before accessing properties to avoid TypeError)
  if (!message || !message.chat) {
    logger.error("Invalid message object received");
    return { ok: false, description: "Invalid message received" };
  }

  if (!token) {
    logger.error("Telegram token is missing");
    return {
      ok: false,
      description: "Configuration error: Telegram token missing",
    };
  }

  if (!bucket) {
    logger.error("R2 bucket is missing");
    return {
      ok: false,
      description: "Configuration error: R2 bucket missing",
    };
  }

  if (!serviceUrl) {
    logger.error("Video analysis service URL is missing");
    return {
      ok: false,
      description: "Configuration error: Video analysis service URL missing",
    };
  }

  logger.info("Starting video analysis request", {
    chatId: chatId,
    userId: message.from?.id,
    hasVideo:
      !!message.video || !!message.document?.mime_type?.startsWith("video/"),
    fileSize: message.video?.file_size || message.document?.file_size,
  });

  // Check if message contains video
  const isVideo =
    message.video || message.document?.mime_type?.startsWith("video/");
  if (!isVideo) {
    await sendMarkdownV2Text(
      token,
      chatId,
      "🎬 Please send a cooking video to analyze\\. You can:\n" +
        "• Send a video directly\n" +
        "• Use /recipe command then send a video\n" +
        "• Forward a cooking video from another chat",
    );
    return { ok: false, description: "Please send a cooking video" };
  }

  // Check file size with strict Cloudflare Workers limits
  const fileSize = message.video?.file_size || message.document?.file_size || 0;
  if (fileSize > MAX_VIDEO_SIZE) {
    await sendMarkdownV2Text(
      token,
      chatId,
      `❌ Video is too large \\(${Math.round(fileSize / 1024 / 1024)}MB\\)\\.\n\n` +
      `📋 *Cloudflare Workers Limits:*\n` +
      `• Maximum video size: 3MB\n` +
      `• Memory constraints prevent larger files\n\n` +
      `💡 *Try:*\n` +
      `• Compress your video\n` +
      `• Use a shorter clip\n` +
      `• Record at lower resolution`,
    );
    return { ok: false, description: "Video too large for Workers environment" };
  }

  // Send processing message
  processingMsg = await sendMarkdownV2Text(
    token,
    chatId,
    "🎬 Analyzing cooking video\\.\\.\\.\n" +
      "⏳ This may take 30\\-60 seconds depending on video length\\.\n" +
      "🤖 AI is watching and extracting recipe details\\.\\.\\.",
  );

    // Get video file info
    const fileId = message.video?.file_id || message.document?.file_id;
    if (!fileId) {
      throw new Error("Could not extract recipe");
    }

    logger.info("Processing video file", { fileId, sizeBytes: fileSize });

    // Get file path from Telegram
    logger.debug("Requesting file path from Telegram API");
    const fileResponse = await fetchWithRetry(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
      {},
      3,
      10000,
    );
    const fileData = (await fileResponse.json()) as TelegramFileResponse;

    if (!fileData.ok || !fileData.result?.file_path) {
      throw new Error("Could not extract recipe");
    }

    // Download video from Telegram
    const videoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    logger.debug("Downloading video from Telegram", {
      path: fileData.result.file_path,
      expectedSize: fileSize
    });

    const videoResponse = await fetchWithRetry(
      videoUrl,
      {},
      3,
      60000, // 60s for download
    );
    if (!videoResponse.ok) {
      throw new Error("Could not extract recipe");
    }

    // Download video buffer
    const videoBuffer = await videoResponse.arrayBuffer();

    // Safety check for buffer size
    if (videoBuffer.byteLength > MAX_VIDEO_SIZE) {
      throw new Error(`Video file too large: ${Math.round(videoBuffer.byteLength / 1024 / 1024)}MB. Maximum: ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)}MB`);
    }

    logger.info("Video downloaded successfully", {
      bufferSize: videoBuffer.byteLength,
      sizeMB: Math.round(videoBuffer.byteLength / 1024 / 1024 * 100) / 100
    });

    // Update status message
    if (processingMsg.result && "message_id" in processingMsg.result) {
      try {
        await editMessageText(
          {
            chat_id: chatId,
            message_id: processingMsg.result.message_id,
            text: "📤 Uploading video to storage...",
          },
          token,
        );
      } catch {
        // Ignore edit failure, continue with processing
      }
    }

    // Upload video to R2 storage
    const uploadResult = await uploadVideoToR2(
      videoBuffer,
      bucket,
      bucketName,
      publicUrlBase,
      message.document?.file_name || message.video?.file_name,
    );

    if (!uploadResult.success) {
      throw new Error(`Failed to upload video: ${uploadResult.error}`);
    }

    const publicUrl = uploadResult.publicUrl!;

    logger.info("Video uploaded successfully", {
      publicUrl,
      fileName: uploadResult.fileName,
      chatId,
    });

    // Update status message
    if (processingMsg.result && "message_id" in processingMsg.result) {
      try {
        await editMessageText(
          {
            chat_id: chatId,
            message_id: processingMsg.result.message_id,
            text: "🤖 AI is analyzing the cooking steps and ingredients...",
          },
          token,
        );
      } catch {
        // Ignore edit failure, continue with processing
      }
    }

    // Call external video analysis service
    try {
      const analysisResult = await callVideoAnalysisService(serviceUrl, {
        videoUrl: publicUrl,
        userId: message.from?.id,
        chatId: chatId,
      });

      if (!analysisResult.success || !analysisResult.recipe) {
        throw new Error(analysisResult.error || "Could not extract recipe from the video. Please ensure the video clearly shows cooking steps and ingredients.");
      }

      const recipe = analysisResult.recipe;

      logger.info("Successfully extracted recipe from video", {
        title: recipe.title,
        chatId,
      });

      // Format and send response
      const formattedRecipe = formatRecipeMessage(recipe);

      // Delete processing message
      if (processingMsg.result && "message_id" in processingMsg.result) {
        await fetch(
          apiUrl(token, "deleteMessage", {
            chat_id: chatId,
            message_id: processingMsg.result.message_id,
          }),
        );
      }

      // Send the formatted recipe
      const result = await sendMarkdownV2Text(token, chatId, formattedRecipe);

      // Optionally save to artifact or create a document
      if (recipe.ingredients.length > 5 || recipe.instructions.length > 5) {
        // Could create a PDF or save to storage for later retrieval
        logger.info("Recipe is detailed, could save for future reference", {
          ingredientCount: recipe.ingredients.length,
          instructionCount: recipe.instructions.length,
        });
      }

      return result;
    } catch (serviceError) {
      // Handle specific service errors
      const errorMessage = serviceError instanceof Error ? serviceError.message : String(serviceError);

      logger.error("Video analysis service failed", {
        error: errorMessage.substring(0, 300),
        chatId,
        publicUrl,
      });

      // Throw with the specific error message for better user feedback
      throw new Error(errorMessage);
    }
  } catch (error) {
    logger.error("Video analysis handler encountered an error", {
      error: (error instanceof Error ? error.message : String(error)).substring(0, 300),
      chatId,
    });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    // Edit processing message to show error
    if (processingMsg && processingMsg.result && "message_id" in processingMsg.result) {
      try {
        await editMessageText(
          {
            chat_id: chatId,
            message_id: processingMsg.result.message_id,
            text: `❌ Failed to analyze video\n\nError: ${errorMessage}\n\nPlease try:\n• Sending a shorter video\n• Ensuring the video shows cooking clearly\n• Using a video under ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024)}MB`,
          },
          token,
        );
      } catch {
        // Ignore edit failure, error has already been logged above
      }
    }

    return { ok: false, description: errorMessage };
  }
}
