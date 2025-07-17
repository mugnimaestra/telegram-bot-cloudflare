import { Message, Chat } from '../../types/telegram';

/**
 * Configuration for RSCM API service
 */
export interface RSCMConfig {
  api_url: string;
  services: Record<string, ServiceConfig>;
  check_interval_seconds: number;
}

/**
 * Service-specific configuration
 */
export interface ServiceConfig {
  user_nm: string;
  key: string;
  poli_id: string;
  fungsi: string;
}

/**
 * Represents a doctor's consultation schedule
 */
export interface ConsultationSchedule {
  doctorName: string;
  startTime: string;
  endTime: string;
  quota: number;
  date: string;
}

/**
 * API request payload
 */
export interface RSCMRequestPayload {
  user_nm: string;
  key: string;
  poli_id: string;
  fungsi: string;
  appointment_date: string;
}

/**
 * API response format
 */
export interface RSCMApiResponse {
  status: string;
  pesan?: string;
  data?: Array<{
    actor: Array<{
      display: string;
    }>;
    consultationDay: {
      start: string;
      end: string;
      quota: string;
    };
  }>;
}

/**
 * Processed appointment result
 */
export interface AppointmentResult {
  schedules: ConsultationSchedule[];
  earliestMorning?: ConsultationSchedule;
  service: string;
  date: string;
}

/**
 * Command options for RSCM appointment checker
 */
export interface RSCMCommandOptions {
  service: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Error types for RSCM operations
 */
export enum RSCMErrorType {
  INVALID_SERVICE = 'INVALID_SERVICE',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Custom error class for RSCM operations
 */
export class RSCMError extends Error {
  public readonly timestamp: string;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    public readonly type: RSCMErrorType,
    message: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RSCMError';
    this.timestamp = new Date().toISOString();
    this.code = code;
    this.details = details;
    
    // Ensure proper inheritance
    Object.setPrototypeOf(this, RSCMError.prototype);
  }

  /**
   * Create a timeout error
   */
  static timeout(message: string = "Request timed out"): RSCMError {
    return new RSCMError(RSCMErrorType.TIMEOUT_ERROR, message, "TIMEOUT");
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(message: string = "Rate limit exceeded"): RSCMError {
    return new RSCMError(RSCMErrorType.RATE_LIMIT_ERROR, message, "RATE_LIMIT");
  }

  /**
   * Create a configuration error
   */
  static configuration(message: string, details?: Record<string, unknown>): RSCMError {
    return new RSCMError(RSCMErrorType.CONFIGURATION_ERROR, message, "CONFIG_ERROR", details);
  }

  /**
   * Create a validation error
   */
  static validation(message: string, details?: Record<string, unknown>): RSCMError {
    return new RSCMError(RSCMErrorType.VALIDATION_ERROR, message, "VALIDATION_ERROR", details);
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Extended Telegram context for RSCM command handler
 */
export interface TelegramContext {
  message: Message;
  chat: Chat;
  reply: (text: string, options?: { parse_mode?: string }) => Promise<Message | boolean>;
  telegram: {
    editMessageText: (
      chatId: number,
      messageId: number,
      inlineMessageId: string | undefined,
      text: string,
      options?: { parse_mode?: string }
    ) => Promise<Message | boolean>;
  };
}