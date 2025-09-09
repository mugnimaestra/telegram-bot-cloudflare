/**
 * Tests for webhook retry handler functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyWebhookError,
  generateWebhookHash,
  checkDuplicateWebhook,
  markWebhookProcessed,
  handleAutomaticWebhookRetry,
  moveToDeadLetterQueue
} from './webhookRetryHandler';
import type { VideoAnalysisWebhookPayload } from '@/types/videoJob';

// Mock the logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock KV namespace
const createMockKVNamespace = () => {
  const store = new Map<string, string>();
  
  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      return store.get(key) || null;
    }),
    put: vi.fn().mockImplementation(async (key: string, value: string, options?: any) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key);
      return Promise.resolve();
    })
  } as unknown as KVNamespace;
};

describe('webhookRetryHandler', () => {
  let mockKV: KVNamespace;
  let mockPayload: VideoAnalysisWebhookPayload;

  beforeEach(() => {
    mockKV = createMockKVNamespace();
    mockPayload = {
      job_id: 'test-job-123',
      status: 'completed',
      result: {
        recipe_text: '# Test Recipe\n\n## Ingredients\n- Ingredient 1\n- Ingredient 2\n\n## Instructions\n1. Step 1\n2. Step 2',
        recipe_title: 'Test Recipe',
        recipe_ready: true
      },
      callback_data: {
        chat_id: 123456789,
        message_id: 987654321,
        bot_token: 'test-token'
      }
    };
  });

  describe('classifyWebhookError', () => {
    it('should classify network errors correctly', () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      
      const classified = classifyWebhookError(networkError);
      
      expect(classified.type).toBe('network');
      expect(classified.retryable).toBe(true);
      expect(classified.severity).toBe('medium');
    });

    it('should classify timeout errors correctly', () => {
      const timeoutError = new Error('Timeout error');
      timeoutError.name = 'TimeoutError';
      
      const classified = classifyWebhookError(timeoutError);
      
      expect(classified.type).toBe('timeout');
      expect(classified.retryable).toBe(true);
      expect(classified.severity).toBe('medium');
    });

    it('should classify 5xx server errors as retryable', () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response;
      
      const classified = classifyWebhookError(null, mockResponse);
      
      expect(classified.type).toBe('server');
      expect(classified.retryable).toBe(true);
      expect(classified.code).toBe('500');
    });

    it('should classify 4xx client errors as non-retryable', () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      } as Response;
      
      const classified = classifyWebhookError(null, mockResponse);
      
      expect(classified.type).toBe('client');
      expect(classified.retryable).toBe(false);
      expect(classified.code).toBe('400');
    });

    it('should classify 429 rate limit errors as retryable', () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      } as Response;
      
      const classified = classifyWebhookError(null, mockResponse);
      
      expect(classified.type).toBe('client');
      expect(classified.retryable).toBe(true);
      expect(classified.code).toBe('429');
    });
  });

  describe('generateWebhookHash', () => {
    it('should generate consistent hash for same payload', () => {
      const hash1 = generateWebhookHash(mockPayload);
      const hash2 = generateWebhookHash(mockPayload);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for different payloads', () => {
      const differentPayload = {
        ...mockPayload,
        job_id: 'different-job'
      };
      
      const hash1 = generateWebhookHash(mockPayload);
      const hash2 = generateWebhookHash(differentPayload);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('checkDuplicateWebhook', () => {
    it('should return false for new webhook', async () => {
      const result = await checkDuplicateWebhook(mockPayload, mockKV);
      
      expect(result.isDuplicate).toBe(false);
      expect(result.dedupeRecord).toBeDefined();
      expect(result.dedupeRecord?.processed).toBe(false);
    });

    it('should return true for already processed webhook', async () => {
      // First call - should create record
      await checkDuplicateWebhook(mockPayload, mockKV);
      
      // Second call - should detect as duplicate
      const result = await checkDuplicateWebhook(mockPayload, mockKV);
      
      expect(result.isDuplicate).toBe(false); // Still false because not marked as processed
    });

    it('should handle KV storage errors gracefully', async () => {
      const errorKV = {
        get: vi.fn().mockRejectedValue(new Error('KV error')),
        put: vi.fn().mockRejectedValue(new Error('KV error'))
      } as unknown as KVNamespace;
      
      const result = await checkDuplicateWebhook(mockPayload, errorKV);
      
      expect(result.isDuplicate).toBe(false);
      expect(result.dedupeRecord).toBeUndefined();
    });
  });

  describe('markWebhookProcessed', () => {
    it('should mark webhook as processed', async () => {
      // First create a dedupe record
      await checkDuplicateWebhook(mockPayload, mockKV);
      
      // Then mark it as processed
      await markWebhookProcessed(mockPayload, mockKV);
      
      // Check that it's now marked as processed
      const result = await checkDuplicateWebhook(mockPayload, mockKV);
      expect(result.isDuplicate).toBe(true);
      expect(result.dedupeRecord?.processed).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const errorKV = {
        get: vi.fn().mockResolvedValue('{"processed": false}'),
        put: vi.fn().mockRejectedValue(new Error('KV error'))
      } as unknown as KVNamespace;
      
      // Should not throw error
      await expect(markWebhookProcessed(mockPayload, errorKV)).resolves.not.toThrow();
    });
  });

  describe('handleAutomaticWebhookRetry', () => {
    it('should schedule retry for failed webhook', async () => {
      // First, create a delivery status record
      await mockKV.put('webhook:delivery:test-job-123', JSON.stringify({
        id: 'delivery-123',
        jobId: 'test-job-123',
        webhookId: 'webhook-123',
        status: 'failed',
        attempts: 1,
        maxAttempts: 3,
        timestamps: {
          created: Date.now(),
          lastAttempt: Date.now()
        },
        payload: mockPayload,
        retryCount: 0,
        webhookUrl: 'https://example.com/webhook'
      }));

      const result = await handleAutomaticWebhookRetry('test-job-123', mockKV);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Retry scheduled for attempt 2');
      expect(result.nextRetryTime).toBeDefined();
      expect(result.nextRetryTime).toBeGreaterThan(Date.now());
    });

    it('should return error when delivery status not found', async () => {
      const result = await handleAutomaticWebhookRetry('non-existent-job', mockKV);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('No delivery status found for job');
    });

    it('should move to dead letter when max attempts exceeded', async () => {
      // Create a delivery status record with max attempts reached
      await mockKV.put('webhook:delivery:test-job-123', JSON.stringify({
        id: 'delivery-123',
        jobId: 'test-job-123',
        webhookId: 'webhook-123',
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        timestamps: {
          created: Date.now(),
          lastAttempt: Date.now()
        },
        payload: mockPayload,
        retryCount: 3,
        webhookUrl: 'https://example.com/webhook'
      }));

      const result = await handleAutomaticWebhookRetry('test-job-123', mockKV);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Max retry attempts exceeded, moved to dead letter queue');
    });
  });

  describe('moveToDeadLetterQueue', () => {
    it('should move webhook to dead letter queue', async () => {
      // Create a delivery status record
      await mockKV.put('webhook:delivery:test-job-123', JSON.stringify({
        id: 'delivery-123',
        jobId: 'test-job-123',
        webhookId: 'webhook-123',
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
        timestamps: {
          created: Date.now(),
          lastAttempt: Date.now()
        },
        payload: mockPayload,
        retryCount: 3,
        webhookUrl: 'https://example.com/webhook',
        error: {
          message: 'Test error',
          type: 'network'
        }
      }));

      const result = await moveToDeadLetterQueue('test-job-123', mockKV, 'max_attempts_exceeded');
      
      expect(result.success).toBe(true);
      expect(result.deadLetterId).toBeDefined();
      expect(result.deadLetterId).toContain('dead_test-job-123');
    });

    it('should return error when delivery status not found', async () => {
      const result = await moveToDeadLetterQueue('non-existent-job', mockKV, 'max_attempts_exceeded');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No delivery status found for job');
    });
  });
});