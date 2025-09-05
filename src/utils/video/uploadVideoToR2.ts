/**
 * Utility to upload video files to Cloudflare R2 storage
 */

import { logger } from "@/utils/logger";

export interface R2UploadResult {
  success: boolean;
  publicUrl?: string;
  fileName?: string;
  error?: string;
}

/**
 * Upload video to R2 storage and return public URL
 */
export async function uploadVideoToR2(
  videoBuffer: ArrayBuffer,
  bucket: R2Bucket,
  bucketName: string,
  publicUrlBase: string,
  originalFileName?: string,
): Promise<R2UploadResult> {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = originalFileName
      ? originalFileName.split('.').pop()?.toLowerCase()
      : 'mp4';
    const fileName = `videos/${timestamp}-${randomId}.${fileExtension}`;

    logger.info("Uploading video to R2", {
      fileName,
      sizeMB: Math.round(videoBuffer.byteLength / 1024 / 1024 * 100) / 100,
      bucketName
    });

    // Upload to R2
    const uploadResult = await bucket.put(fileName, videoBuffer, {
      httpMetadata: {
        contentType: `video/${fileExtension}`,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    if (!uploadResult) {
      throw new Error("R2 upload failed - no result returned");
    }

    // Generate public URL
    const publicUrl = `${publicUrlBase}/${fileName}`;

    logger.info("Successfully uploaded video to R2", {
      publicUrl,
      fileName,
      sizeMB: Math.round(videoBuffer.byteLength / 1024 / 1024 * 100) / 100
    });

    return {
      success: true,
      publicUrl,
      fileName,
    };

  } catch (error) {
    logger.error("Failed to upload video to R2", {
      error: error instanceof Error ? error.message : String(error),
      sizeMB: Math.round(videoBuffer.byteLength / 1024 / 1024 * 100) / 100
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown upload error",
    };
  }
}
