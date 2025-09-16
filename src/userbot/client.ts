import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Api } from 'telegram/tl';

/**
 * UserbotClient class that wraps the GramJS TelegramClient
 * Provides a simplified interface for Telegram user bot operations
 */
export class UserbotClient {
  private client: TelegramClient;
  private apiId: number;
  private apiHash: string;
  private botToken?: string;
  private session: StringSession;

  /**
   * Create a new UserbotClient instance
   * @param apiId Telegram API ID
   * @param apiHash Telegram API Hash
   * @param botToken Optional bot token for bot mode
   * @param sessionString Optional session string to restore previous session
   */
  constructor(apiId: number, apiHash: string, botToken?: string, sessionString?: string) {
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.botToken = botToken;
    this.session = new StringSession(sessionString || '');
    
    // Initialize TelegramClient with StringSession
    this.client = new TelegramClient(
      this.session,
      this.apiId,
      this.apiHash,
      {
        connectionRetries: 5,
        useWSS: false, // Better compatibility with Cloudflare Workers
      }
    );
  }

  /**
   * Start the client and authenticate
   * @param phoneNumber Optional phone number for user mode
   * @param password Optional password for 2FA
   * @param botToken Optional bot token (overrides constructor token)
   * @returns Promise that resolves when authentication is complete
   */
  async start(phoneNumber?: string, password?: string, botToken?: string): Promise<void> {
    try {
      const token = botToken || this.botToken;
      
      if (token) {
        // Bot mode authentication
        await this.client.start({
          botAuthToken: token,
        });
      } else if (phoneNumber) {
        // User mode authentication
        await this.client.start({
          phoneNumber: async () => phoneNumber,
          password: async () => password || '',
          phoneCode: async () => {
            throw new Error('Phone code verification not implemented - please use bot mode or provide session string');
          },
          onError: (err) => {
            console.error('Authentication error:', err);
            throw err;
          },
        });
      } else {
        throw new Error('Either botToken or phoneNumber must be provided for authentication');
      }
    } catch (error) {
      console.error('Failed to start UserbotClient:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the current session string
   * @returns The session string that can be used to restore the session later
   */
  getSessionString(): string {
    return this.session.save() || '';
  }

  /**
   * Load a session from a session string
   * @param sessionString The session string to load
   */
  loadSession(sessionString: string): void {
    try {
      // Create a new StringSession with the provided string
      this.session = new StringSession(sessionString);
      // Create a new client with the loaded session
      this.client = new TelegramClient(
        this.session,
        this.apiId,
        this.apiHash,
        {
          connectionRetries: 5,
          useWSS: false, // Better compatibility with Cloudflare Workers
        }
      );
    } catch (error) {
      console.error('Failed to load session:', error);
      throw new Error(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the underlying TelegramClient instance
   * @returns The TelegramClient instance
   */
  getClient(): TelegramClient {
    return this.client;
  }

  /**
   * Send a message to a chat
   * @param chatId Chat ID or username
   * @param message Message text
   * @param options Optional message parameters
   * @returns Promise that resolves to the sent message
   */
  async sendMessage(
    chatId: number | string,
    message: string,
    options: {
      parseMode?: 'HTML' | 'Markdown';
      silent?: boolean;
      replyToMsgId?: number;
    } = {}
  ): Promise<Api.Message> {
    try {
      const entity = await this.client.getEntity(chatId);
      const result = await this.client.sendMessage(entity, {
        message,
        parseMode: options.parseMode,
        silent: options.silent,
        replyTo: options.replyToMsgId,
      });
      
      return result;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get information about the current user/bot
   * @returns Promise that resolves to user information
   */
  async getMe(): Promise<Api.User> {
    try {
      return await this.client.getMe();
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw new Error(`Failed to get user info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add an event handler for new messages
   * @param callback Function to handle new message events
   */
  async addMessageHandler(callback: (event: NewMessageEvent) => Promise<void>): Promise<void> {
    try {
      this.client.addEventHandler(callback, new NewMessage({}));
    } catch (error) {
      console.error('Failed to add message handler:', error);
      throw new Error(`Failed to add message handler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if the client is connected
   * @returns True if the client is connected
   */
  isConnected(): boolean {
    return this.client.connected || false;
  }

  /**
   * Disconnect the client
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      throw new Error(`Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Connect the client manually (useful if auto-connect is disabled)
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect:', error);
      throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}