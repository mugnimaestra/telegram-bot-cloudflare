/**
 * Utility to check video analysis job status
 */

import type { VideoAnalysisJobStatus } from "@/types/videoJob";
import { logger } from "@/utils/logger";

export async function checkJobStatus(
  serviceUrl: string,
  jobId: string,
): Promise<{ success: boolean; job?: VideoAnalysisJobStatus; error?: string }> {
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

    return { success: true, job: jobStatus };

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

export function formatJobStatusMessage(job: VideoAnalysisJobStatus): string {
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

  if (job.status === 'failed' && job.error) {
    message += `\n❌ Error: ${job.error}\n`;
  }

  return message;
}