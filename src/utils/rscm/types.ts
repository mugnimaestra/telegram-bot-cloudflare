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
}

/**
 * Custom error class for RSCM operations
 */
export class RSCMError extends Error {
  constructor(
    public type: RSCMErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'RSCMError';
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