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

// Video size validation is now handled by the video analyzer service


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

  // File size validation is now handled by the video analyzer service
  const fileSize = message.video?.file_size || message.document?.file_size || 0;
  logger.info("Video file size", { sizeMB: Math.round(fileSize / 1024 / 1024) });

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

    // Buffer size validation is now handled by the video analyzer service
    logger.info("Video buffer size", { sizeMB: Math.round(videoBuffer.byteLength / 1024 / 1024) });

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
      // Construct the callback URL for async processing
      const callbackUrl = `${publicUrlBase}/webhook/video-analysis`;
      
      // Get the message ID from the processing message
      const messageId = processingMsg.result && "message_id" in processingMsg.result
        ? processingMsg.result.message_id
        : 0;
      
      const analysisResult = await callVideoAnalysisService(serviceUrl, {
        videoUrl: publicUrl,
        userId: message.from?.id,
        chatId: chatId,
        botToken: token,
        callbackUrl: callbackUrl,
        messageId: messageId,
      });

      // With async callback processing, the service should return job acceptance
      if (!analysisResult.success) {
        // Handle different error types with specific user guidance
        if (analysisResult.error_type === 'size_context_limit') {
          let errorDetails = '';
          if (analysisResult.error_details?.max_size_mb) {
            errorDetails += `\n• Maximum file size: ${analysisResult.error_details.max_size_mb}MB`;
          }
          if (analysisResult.error_details?.max_duration_seconds) {
            errorDetails += `\n• Maximum duration: ${analysisResult.error_details.max_duration_seconds} seconds`;
          }
          if (analysisResult.error_details?.max_frames) {
            errorDetails += `\n• Maximum frames: ${analysisResult.error_details.max_frames}`;
          }

          throw new Error(`Video is too large or complex for processing${errorDetails}\n\nPlease try:\n• Using a shorter video (under 2 minutes)\n• Reducing video resolution\n• Focusing on key cooking steps only`);
        }
        
        throw new Error(analysisResult.error || "Could not extract recipe from the video. Please ensure the video clearly shows cooking steps and ingredients.");
      }

      // For async processing, success means the job was accepted
      // The actual recipe will be delivered via webhook callback
      logger.info("Video analysis job accepted for async processing", {
        chatId,
        callbackUrl: callbackUrl,
      });

      // Update status message to indicate async processing
      if (processingMsg.result && "message_id" in processingMsg.result) {
        const messageId = processingMsg.result.message_id;
        try {
          await editMessageText(
            {
              chat_id: chatId,
              message_id: messageId,
              text: "🎬 Video analysis job accepted\\!\n\n⏳ Processing in the background\\.\\.\\.\n📱 I'll send you the recipe when it's ready\\.\n\nThis may take 1\\-3 minutes depending on video length\\.",
            },
            token,
          );
        } catch {
          // Ignore edit failure, continue with processing
        }
      }

      // Return success but don't send recipe yet - it will come via webhook
      return {
        ok: true,
        description: "Video analysis job accepted for processing",
        result: {
          message_id: messageId,
        }
      };
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
            text: `❌ Failed to analyze video\n\nError: ${errorMessage}\n\nPlease try:\n• Sending a clearer video\n• Ensuring the video shows cooking steps\n• The video analyzer service will determine if your video can be processed`,
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
