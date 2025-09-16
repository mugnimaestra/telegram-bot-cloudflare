import { User, Chat } from '@/types/telegram';

/**
 * Authentication mode for the userbot
 */
export type AuthMode = 'bot' | 'user';

/**
 * Configuration for the userbot client
 */
export interface UserbotConfig {
  /** Telegram API ID */
  apiId: number;
  /** Telegram API Hash */
  apiHash: string;
  /** Bot token (required for bot mode) */
  botToken?: string;
  /** Phone number (required for user mode) */
  phoneNumber?: string;
  /** Password (optional for user mode, required for 2FA) */
  password?: string;
  /** Authentication mode */
  authMode?: AuthMode;
  /** Session storage path */
  sessionPath?: string;
  /** Device information */
  deviceInfo?: {
    deviceModel: string;
    systemVersion: string;
    appVersion: string;
    langCode: string;
  };
  /** Connection settings */
  connectionSettings?: {
    timeout?: number;
    retryDelay?: number;
    maxRetries?: number;
  };
}

/**
 * Session information for the userbot
 */
export interface UserbotSession {
  /** Session string for persistence */
  sessionString: string;
  /** Timestamp when session was created */
  createdAt: number;
  /** Timestamp when session expires (optional) */
  expiresAt?: number;
  /** Whether the session is currently valid */
  isValid: boolean;
  /** User ID associated with the session */
  userId?: number;
  /** Bot ID associated with the session (bot mode) */
  botId?: number;
  /** Session metadata */
  metadata?: {
    authKey: string;
    dcId: number;
    ipAddress?: string;
    port?: number;
  };
}

/**
 * Message handling interface for userbot
 */
export interface UserbotMessage {
  /** Unique message identifier */
  id: string;
  /** Message text content */
  text: string;
  /** Message sender (optional) */
  from?: User;
  /** Chat where the message was sent */
  chat: Chat;
  /** Timestamp when message was sent */
  date: number;
  /** Message edit date (optional) */
  editDate?: number;
  /** Message media content (optional) */
  media?: {
    type: 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation';
    fileId: string;
    fileUniqueId: string;
    fileSize?: number;
    width?: number;
    height?: number;
    duration?: number;
    thumbnail?: string;
    fileName?: string;
    mimeType?: string;
  };
  /** Reply to message ID (optional) */
  replyToMessageId?: number;
  /** Message entities (formatting) */
  entities?: Array<{
    type: 'bold' | 'italic' | 'code' | 'pre' | 'text_link' | 'text_mention';
    offset: number;
    length: number;
    url?: string;
    user?: User;
  }>;
  /** Forward information (optional) */
  forwardInfo?: {
    from?: User;
    date: number;
    channel?: Chat;
    signature?: string;
  };
}

/**
 * Event handler interface for userbot events
 */
export interface UserbotEventHandler {
  /** Event name/type */
  event: string;
  /** Handler function for the event */
  handler: (data: any, context?: UserbotContext) => Promise<void> | void;
  /** Optional filter function to determine if handler should run */
  filter?: (data: any, context?: UserbotContext) => boolean | Promise<boolean>;
  /** Handler priority (lower numbers run first) */
  priority?: number;
  /** Whether handler should run once */
  once?: boolean;
}

/**
 * Context object passed to event handlers
 */
export interface UserbotContext {
  /** Userbot client instance */
  client: any;
  /** Session information */
  session: UserbotSession;
  /** Configuration */
  config: UserbotConfig;
  /** Event metadata */
  metadata?: {
    eventName: string;
    timestamp: number;
    eventId?: string;
  };
}

/**
 * Authentication result interface
 */
export interface AuthResult {
  /** Whether authentication was successful */
  success: boolean;
  /** Session information (if successful) */
  session?: UserbotSession;
  /** Error message (if failed) */
  error?: string;
  /** Error code (if failed) */
  errorCode?: string;
}

/**
 * Userbot status information
 */
export interface UserbotStatus {
  /** Current status */
  status: 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'authenticated' | 'error';
  /** Status message */
  message?: string;
  /** Last activity timestamp */
  lastActivity?: number;
  /** Connection uptime (if connected) */
  uptime?: number;
  /** Error information (if in error state) */
  error?: {
    code: string;
    message: string;
    timestamp: number;
    retryable: boolean;
  };
}

/**
 * Type guard to validate UserbotConfig
 */
export function isUserbotConfig(config: any): config is UserbotConfig {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.apiId === 'number' &&
    typeof config.apiHash === 'string' &&
    (config.botToken === undefined || typeof config.botToken === 'string') &&
    (config.phoneNumber === undefined || typeof config.phoneNumber === 'string') &&
    (config.password === undefined || typeof config.password === 'string') &&
    (config.authMode === undefined || config.authMode === 'bot' || config.authMode === 'user')
  );
}

/**
 * Type guard to validate UserbotSession
 */
export function isUserbotSession(session: any): session is UserbotSession {
  return (
    session &&
    typeof session === 'object' &&
    typeof session.sessionString === 'string' &&
    typeof session.createdAt === 'number' &&
    (session.expiresAt === undefined || typeof session.expiresAt === 'number') &&
    typeof session.isValid === 'boolean'
  );
}

/**
 * Type guard to validate UserbotMessage
 */
export function isUserbotMessage(message: any): message is UserbotMessage {
  return (
    message &&
    typeof message === 'object' &&
    typeof message.id === 'string' &&
    typeof message.text === 'string' &&
    (message.from === undefined || typeof message.from === 'object') &&
    typeof message.chat === 'object' &&
    typeof message.date === 'number'
  );
}

/**
 * Type guard to validate UserbotEventHandler
 */
export function isUserbotEventHandler(handler: any): handler is UserbotEventHandler {
  return (
    handler &&
    typeof handler === 'object' &&
    typeof handler.event === 'string' &&
    typeof handler.handler === 'function' &&
    (handler.filter === undefined || typeof handler.filter === 'function') &&
    (handler.priority === undefined || typeof handler.priority === 'number') &&
    (handler.once === undefined || typeof handler.once === 'boolean')
  );
}

/**
 * Union type for authentication credentials
 */
export type AuthCredentials = 
  | { type: 'bot'; botToken: string }
  | { type: 'user'; phoneNumber: string; password?: string };

/**
 * Get authentication credentials from config
 */
export function getAuthCredentials(config: UserbotConfig): AuthCredentials | null {
  if (config.botToken) {
    return { type: 'bot', botToken: config.botToken };
  }
  
  if (config.phoneNumber) {
    return { 
      type: 'user', 
      phoneNumber: config.phoneNumber,
      password: config.password 
    };
  }
  
  return null;
}

/**
 * Validate configuration for specific auth mode
 */
export function validateConfigForMode(config: UserbotConfig, mode: AuthMode): boolean {
  if (mode === 'bot') {
    return !!config.botToken;
  }
  
  if (mode === 'user') {
    return !!config.phoneNumber;
  }
  
  return false;
}

/**
 * Event types that can be handled by the userbot
 */
export type UserbotEventType = 
  | 'message'
  | 'edited_message'
  | 'deleted_message'
  | 'callback_query'
  | 'inline_query'
  | 'chosen_inline_result'
  | 'shipping_query'
  | 'pre_checkout_query'
  | 'poll'
  | 'poll_answer'
  | 'chat_member_updated'
  | 'chat_join_request'
  | 'error'
  | 'connected'
  | 'disconnected'
  | 'auth_success'
  | 'auth_failure';

/**
 * Message filter interface for selective message handling
 */
export interface MessageFilter {
  /** Chat IDs to include (empty means all) */
  chatIds?: number[];
  /** User IDs to include (empty means all) */
  userIds?: number[];
  /** Message text patterns to match */
  textPatterns?: RegExp[];
  /** Message types to include */
  messageTypes?: ('text' | 'media' | 'document' | 'sticker' | 'audio' | 'video')[];
  /** Minimum date timestamp */
  since?: number;
  /** Maximum date timestamp */
  until?: number;
  /** Custom filter function */
  customFilter?: (message: UserbotMessage) => boolean | Promise<boolean>;
}