/**
 * Async video analysis handler using direct Telegram URLs and job-based processing
 */

import type { Message, TelegramResponse } from "@/types/telegram";
import { sendMarkdownV2Text } from "@/utils/telegram/sendMarkdownV2Text";
import { editMessageText } from "@/utils/telegram/fetchers/editMessageText";
import { apiUrl } from "@/utils/telegram/apiUrl";
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

interface VideoAnalysisJobRequest {
  video_url: string;
  bot_token: string;
  callback: {
    type: 'telegram';
    webhook_url: string;
    chat_id: number;
    message_id: number;
  };
  metadata?: {
    user_id?: number;
    timestamp: number;
  };
}

interface VideoAnalysisJobResponse {
  job_id: string;
  status: string;
  message: string;
}

export async function handleVideoAnalysisAsync(
  token: string,
  message: Message,
  serviceUrl: string,
  webhookUrl: string,
  kvNamespace?: KVNamespace,
): Promise<TelegramResponse> {
  const chatId = message?.chat?.id;
  let processingMsg: TelegramResponse | null = null;
  
  try {
    // Boundary checks
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

    if (!serviceUrl) {
      logger.error("Video analysis service URL is missing");
      return {
        ok: false,
        description: "Configuration error: Video analysis service URL missing",
      };
    }

    logger.info("Starting async video analysis request", {
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
      "🎬 Video uploaded\\!\n" +
        "📋 Creating analysis job\\.\\.\\.\n" +
        "⏳ You'll be notified when complete\\.",
    );

    // Get video file info from Telegram
    const fileId = message.video?.file_id || message.document?.file_id;
    if (!fileId) {
      throw new Error("Could not get video file ID");
    }

    logger.info("Getting video file path from Telegram", { fileId, sizeBytes: fileSize });

    // Get file path from Telegram API
    const fileResponse = await fetchWithRetry(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
      {},
      3,
      10000,
    );
    const fileData = (await fileResponse.json()) as TelegramFileResponse;

    if (!fileData.ok || !fileData.result?.file_path) {
      throw new Error("Could not get video file path from Telegram");
    }

    // Create direct Telegram file URL
    const telegramFileUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    
    logger.info("Got Telegram file URL", {
      filePath: fileData.result.file_path,
      expectedSize: fileSize,
    });

    // Update status message
    if (processingMsg.result && "message_id" in processingMsg.result) {
      try {
        await editMessageText(
          {
            chat_id: chatId,
            message_id: processingMsg.result.message_id,
            text: "🚀 Creating analysis job...",
          },
          token,
        );
      } catch {
        // Ignore edit failure, continue with processing
      }
    }

    // Create job via Go service
    const jobRequest: VideoAnalysisJobRequest = {
      video_url: telegramFileUrl,
      bot_token: token, // Send bot token so Go service can download from Telegram
      callback: {
        type: 'telegram',
        webhook_url: webhookUrl,
        chat_id: chatId,
        message_id: processingMsg.result && "message_id" in processingMsg.result 
          ? processingMsg.result.message_id 
          : 0,
      },
      metadata: {
        user_id: message.from?.id,
        timestamp: Date.now(),
      },
    };

    logger.info("Creating video analysis job", {
      serviceUrl,
      chatId,
      hasWebhookUrl: !!webhookUrl,
    });

    const jobResponse = await fetchWithRetry(
      `${serviceUrl}/analyze`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobRequest),
      },
      3,
      10000,
    );

    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();
      
      // Try to parse error as JSON to check for structured error format
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error_type === 'size_context_limit') {
          let errorDetails = '';
          if (errorData.error_details?.max_size_mb) {
            errorDetails += `\n• Maximum file size: ${errorData.error_details.max_size_mb}MB`;
          }
          if (errorData.error_details?.max_duration_seconds) {
            errorDetails += `\n• Maximum duration: ${errorData.error_details.max_duration_seconds} seconds`;
          }
          if (errorData.error_details?.max_frames) {
            errorDetails += `\n• Maximum frames: ${errorData.error_details.max_frames}`;
          }
          
          throw new Error(`Video is too large or complex for processing${errorDetails}\n\nPlease try:\n• Using a shorter video (under 2 minutes)\n• Reducing video resolution\n• Focusing on key cooking steps only`);
        }
      } catch (parseError) {
        // If JSON parsing fails, continue with original error handling
      }
      
      throw new Error(`Service returned ${jobResponse.status}: ${errorText}`);
    }

    const jobData = (await jobResponse.json()) as VideoAnalysisJobResponse;
    
    logger.info("Video analysis job created successfully", {
      jobId: jobData.job_id,
      status: jobData.status,
      chatId,
    });

    // Store job ID in KV for status checking (optional)
    if (kvNamespace) {
      try {
        await kvNamespace.put(
          `job:${jobData.job_id}`,
          JSON.stringify({
            chatId,
            messageId: processingMsg.result && "message_id" in processingMsg.result 
              ? processingMsg.result.message_id 
              : null,
            userId: message.from?.id,
            createdAt: Date.now(),
          }),
          { expirationTtl: 86400 } // 24 hour TTL
        );
      } catch (kvError) {
        logger.warn("Failed to store job in KV", { 
          jobId: jobData.job_id, 
          error: kvError instanceof Error ? kvError.message : String(kvError) 
        });
      }
    }

    // Update message with job ID and status
    if (processingMsg.result && "message_id" in processingMsg.result) {
      try {
        await editMessageText(
          {
            chat_id: chatId,
            message_id: processingMsg.result.message_id,
            text: `🎬 Analysis Job Created!\n\n` +
                  `Job ID: \`${jobData.job_id}\`\n` +
                  `Status: ⏳ Processing...\n\n` +
                  `You can check status with:\n` +
                  `/status ${jobData.job_id}\n\n` +
                  `⏱️ Processing usually takes from 1 to 5 minutes depends on the duration of the video`,
          },
          token,
        );
      } catch (editError) {
        logger.warn("Failed to update status message", { 
          error: editError instanceof Error ? editError.message : String(editError) 
        });
      }
    }

    return { ok: true };

  } catch (error) {
    logger.error("Async video analysis handler encountered an error", {
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
            text: `❌ Failed to create analysis job\n\n` +
                  `Error: ${errorMessage}\n\n` +
                  `Please try:\n` +
                  `• Sending a shorter video\n` +
                  `• Ensuring the video shows cooking steps\n` +
                  `• The video analyzer service will determine if your video can be processed`,
          },
          token,
        );
      } catch {
        // Ignore edit failure
      }
    }

    return { ok: false, description: errorMessage };
  }
}