/**
 * Dead letter queue management for permanently failed webhook deliveries
 */

import type { VideoAnalysisWebhookPayload } from "@/types/videoJob";
import type { DeadLetterEntry } from "./webhookRetryHandler";
import { logger } from "@/utils/logger";

/**
 * Interface for dead letter queue statistics
 */
export interface DeadLetterQueueStats {
  totalEntries: number;
  entriesByReason: Record<string, number>;
  entriesByDate: Record<string, number>;
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * Interface for dead letter queue processing result
 */
export interface DeadLetterProcessingResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: string[];
  details: Array<{
    deadLetterId: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Add a webhook to the dead letter queue
 */
export async function addToDeadLetterQueue(
  deadLetterEntry: DeadLetterEntry,
  kvNamespace: KVNamespace
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info("Adding entry to dead letter queue", {
      deadLetterId: deadLetterEntry.id,
      jobId: deadLetterEntry.jobId,
      reason: deadLetterEntry.reason
    });

    // Store the dead letter entry
    const deadLetterKey = `webhook:dead:${deadLetterEntry.id}`;
    await kvNamespace.put(deadLetterKey, JSON.stringify(deadLetterEntry), {
      expirationTtl: 7776000 // 90 days
    });

    // Add to the dead letter queue set
    const queueKey = 'webhook:queue:dead';
    const currentQueue = await kvNamespace.get(queueKey);
    const queueSet = new Set(JSON.parse(currentQueue || '[]'));
    queueSet.add(deadLetterEntry.id);
    await kvNamespace.put(queueKey, JSON.stringify([...queueSet]), {
      expirationTtl: 7776000 // 90 days
    });

    logger.info("Successfully added entry to dead letter queue", {
      deadLetterId: deadLetterEntry.id,
      jobId: deadLetterEntry.jobId
    });

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to add entry to dead letter queue", {
      deadLetterId: deadLetterEntry.id,
      jobId: deadLetterEntry.jobId,
      error: errorMessage
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Get a dead letter queue entry by ID
 */
export async function getDeadLetterEntry(
  deadLetterId: string,
  kvNamespace: KVNamespace
): Promise<DeadLetterEntry | null> {
  try {
    const deadLetterKey = `webhook:dead:${deadLetterId}`;
    const result = await kvNamespace.get(deadLetterKey);

    if (!result) {
      logger.debug("Dead letter entry not found", { deadLetterId });
      return null;
    }

    const entry: DeadLetterEntry = JSON.parse(result);
    logger.debug("Retrieved dead letter entry", {
      deadLetterId,
      jobId: entry.jobId,
      reason: entry.reason
    });

    return entry;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get dead letter entry", {
      deadLetterId,
      error: errorMessage
    });

    throw new Error(`Failed to retrieve dead letter entry: ${errorMessage}`);
  }
}

/**
 * Get all dead letter queue entries
 */
export async function getDeadLetterQueueEntries(
  kvNamespace: KVNamespace,
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: DeadLetterEntry[]; total: number }> {
  try {
    const queueKey = 'webhook:queue:dead';
    const queueResult = await kvNamespace.get(queueKey);
    const queueIds: string[] = JSON.parse(queueResult || '[]');

    const total = queueIds.length;
    const paginatedIds = queueIds.slice(offset, offset + limit);

    const entries: DeadLetterEntry[] = [];
    for (const id of paginatedIds) {
      try {
        const entry = await getDeadLetterEntry(id, kvNamespace);
        if (entry) {
          entries.push(entry);
        }
      } catch (error) {
        logger.warn("Failed to retrieve dead letter entry", {
          deadLetterId: id,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue processing other entries
      }
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    logger.info("Retrieved dead letter queue entries", {
      total,
      returned: entries.length,
      limit,
      offset
    });

    return { entries, total };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get dead letter queue entries", {
      error: errorMessage
    });

    throw new Error(`Failed to retrieve dead letter queue entries: ${errorMessage}`);
  }
}

/**
 * Get dead letter queue statistics
 */
export async function getDeadLetterQueueStats(
  kvNamespace: KVNamespace
): Promise<DeadLetterQueueStats> {
  try {
    const { entries } = await getDeadLetterQueueEntries(kvNamespace, 1000); // Get up to 1000 for stats

    const stats: DeadLetterQueueStats = {
      totalEntries: entries.length,
      entriesByReason: {},
      entriesByDate: {}
    };

    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    for (const entry of entries) {
      // Count by reason
      stats.entriesByReason[entry.reason] = (stats.entriesByReason[entry.reason] || 0) + 1;

      // Count by date
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      stats.entriesByDate[date] = (stats.entriesByDate[date] || 0) + 1;

      // Track oldest and newest
      if (!oldestTimestamp || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (!newestTimestamp || entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    if (oldestTimestamp) {
      stats.oldestEntry = new Date(oldestTimestamp);
    }
    if (newestTimestamp) {
      stats.newestEntry = new Date(newestTimestamp);
    }

    logger.info("Retrieved dead letter queue statistics", {
      totalEntries: stats.totalEntries,
      reasons: Object.keys(stats.entriesByReason).length,
      dateRange: `${stats.oldestEntry?.toISOString()} to ${stats.newestEntry?.toISOString()}`
    });

    return stats;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get dead letter queue statistics", {
      error: errorMessage
    });

    throw new Error(`Failed to retrieve dead letter queue statistics: ${errorMessage}`);
  }
}

/**
 * Remove a dead letter queue entry
 */
export async function removeDeadLetterEntry(
  deadLetterId: string,
  kvNamespace: KVNamespace
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.info("Removing dead letter queue entry", { deadLetterId });

    // Remove the entry itself
    const deadLetterKey = `webhook:dead:${deadLetterId}`;
    await kvNamespace.delete(deadLetterKey);

    // Remove from the queue set
    const queueKey = 'webhook:queue:dead';
    const queueResult = await kvNamespace.get(queueKey);
    const queueSet = new Set(JSON.parse(queueResult || '[]'));
    queueSet.delete(deadLetterId);
    await kvNamespace.put(queueKey, JSON.stringify([...queueSet]), {
      expirationTtl: 7776000 // 90 days
    });

    logger.info("Successfully removed dead letter queue entry", { deadLetterId });

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to remove dead letter queue entry", {
      deadLetterId,
      error: errorMessage
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Manually retry a dead letter queue entry
 */
export async function retryDeadLetterEntry(
  serviceUrl: string,
  deadLetterId: string,
  kvNamespace: KVNamespace
): Promise<{ success: boolean; message: string; retryId?: string }> {
  try {
    logger.info("Retrying dead letter queue entry", { deadLetterId });

    // Get the dead letter entry
    const entry = await getDeadLetterEntry(deadLetterId, kvNamespace);
    if (!entry) {
      return { success: false, message: "Dead letter entry not found" };
    }

    // Call the retry endpoint
    const response = await fetch(`${serviceUrl}/retry-webhook/${entry.jobId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookId: entry.jobId,
        reason: 'manual',
        metadata: {
          deadLetterRetry: true,
          originalFailureReason: entry.reason,
          originalError: entry.finalError
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Failed to retry dead letter entry", {
        deadLetterId,
        status: response.status,
        error: errorText
      });

      return { success: false, message: `Failed to retry: ${response.status} ${response.statusText}` };
    }

    const retryResponse: any = await response.json();
    const retryId = retryResponse.retryId as string | undefined;
    const retryMessage = retryResponse.message as string | undefined;

    // Remove from dead letter queue on successful retry
    await removeDeadLetterEntry(deadLetterId, kvNamespace);

    logger.info("Successfully retried dead letter entry", {
      deadLetterId,
      jobId: entry.jobId,
      retryId
    });

    return {
      success: true,
      message: retryMessage || "Retry scheduled successfully",
      retryId
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Exception during dead letter entry retry", {
      deadLetterId,
      error: errorMessage
    });

    return { success: false, message: `Exception during retry: ${errorMessage}` };
  }
}

/**
 * Process multiple dead letter queue entries
 */
export async function processDeadLetterQueue(
  serviceUrl: string,
  kvNamespace: KVNamespace,
  limit: number = 10,
  processAll: boolean = false
): Promise<DeadLetterProcessingResult> {
  try {
    logger.info("Processing dead letter queue", { limit, processAll });

    const { entries, total } = await getDeadLetterQueueEntries(kvNamespace, limit);
    const entriesToProcess = processAll ? entries : entries.slice(0, limit);

    const result: DeadLetterProcessingResult = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      errors: [],
      details: []
    };

    for (const entry of entriesToProcess) {
      try {
        const retryResult = await retryDeadLetterEntry(serviceUrl, entry.id, kvNamespace);
        
        result.details.push({
          deadLetterId: entry.id,
          success: retryResult.success
        });

        if (retryResult.success) {
          result.processedCount++;
        } else {
          result.failedCount++;
          result.errors.push(`${entry.id}: ${retryResult.message}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failedCount++;
        result.errors.push(`${entry.id}: ${errorMessage}`);
        result.details.push({
          deadLetterId: entry.id,
          success: false,
          error: errorMessage
        });
      }
    }

    if (result.failedCount > 0) {
      result.success = false;
    }

    logger.info("Dead letter queue processing completed", {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      totalEntries: total,
      processed: entriesToProcess.length
    });

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to process dead letter queue", {
      error: errorMessage
    });

    return {
      success: false,
      processedCount: 0,
      failedCount: 0,
      errors: [errorMessage],
      details: []
    };
  }
}

/**
 * Clear all entries from the dead letter queue
 */
export async function clearDeadLetterQueue(
  kvNamespace: KVNamespace
): Promise<{ success: boolean; clearedCount: number; error?: string }> {
  try {
    logger.info("Clearing dead letter queue");

    const { entries } = await getDeadLetterQueueEntries(kvNamespace, 1000);
    let clearedCount = 0;

    for (const entry of entries) {
      try {
        await removeDeadLetterEntry(entry.id, kvNamespace);
        clearedCount++;
      } catch (error) {
        logger.warn("Failed to remove dead letter entry during clear", {
          deadLetterId: entry.id,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with other entries
      }
    }

    logger.info("Dead letter queue cleared", { clearedCount, totalEntries: entries.length });

    return { success: true, clearedCount };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to clear dead letter queue", {
      error: errorMessage
    });

    return { success: false, clearedCount: 0, error: errorMessage };
  }
}

/**
 * Format dead letter queue statistics for display
 */
export function formatDeadLetterQueueStats(stats: DeadLetterQueueStats): string {
  let message = "💀 *Dead Letter Queue Statistics*\n\n";
  
  message += `Total Entries: ${stats.totalEntries}\n\n`;
  
  if (stats.oldestEntry && stats.newestEntry) {
    message += `Date Range: ${stats.oldestEntry.toLocaleDateString()} - ${stats.newestEntry.toLocaleDateString()}\n\n`;
  }
  
  message += "*By Reason:*\n";
  for (const [reason, count] of Object.entries(stats.entriesByReason)) {
    const emoji = {
      max_attempts_exceeded: '🔄',
      permanent_failure: '❌',
      invalid_payload: '⚠️',
      manual: '👤'
    }[reason] || '❓';
    
    message += `${emoji} ${reason}: ${count}\n`;
  }
  
  if (Object.keys(stats.entriesByDate).length > 0) {
    message += "\n*Recent Activity:*\n";
    const sortedDates = Object.keys(stats.entriesByDate).sort().slice(-7); // Last 7 days
    for (const date of sortedDates) {
      message += `• ${date}: ${stats.entriesByDate[date]} entries\n`;
    }
  }
  
  return message;
}

/**
 * Format dead letter entry details for display
 */
export function formatDeadLetterEntry(entry: DeadLetterEntry): string {
  const timestamp = new Date(entry.timestamp);
  
  let message = `💀 *Dead Letter Entry*\n\n`;
  message += `ID: \`${entry.id}\`\n`;
  message += `Job ID: \`${entry.jobId}\`\n`;
  message += `Reason: ${entry.reason}\n`;
  message += `Timestamp: ${timestamp.toLocaleString()}\n`;
  message += `Retry Attempts: ${entry.retryAttempts}\n\n`;
  
  message += "*Final Error:*\n";
  message += `Type: ${entry.finalError.type}\n`;
  message += `Message: ${entry.finalError.message}\n`;
  if (entry.finalError.code) {
    message += `Code: ${entry.finalError.code}\n`;
  }
  
  if (entry.metadata) {
    message += "\n*Metadata:*\n";
    if (entry.metadata.severity) {
      message += `Severity: ${entry.metadata.severity}\n`;
    }
    if (entry.metadata.category) {
      message += `Category: ${entry.metadata.category}\n`;
    }
    if (entry.metadata.action) {
      message += `Suggested Action: ${entry.metadata.action}\n`;
    }
  }
  
  return message;
}