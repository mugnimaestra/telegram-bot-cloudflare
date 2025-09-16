import { UserbotClient } from './client';
import { 
  UserbotMessage, 
  UserbotEventHandler, 
  UserbotContext, 
  UserbotStatus, 
  MessageFilter,
  UserbotEventType,
  isUserbotMessage,
  isUserbotEventHandler
} from './types';
import { NewMessageEvent } from 'telegram/events';
import { Api } from 'telegram/tl';

/**
 * Command handler interface for specific bot commands
 */
export interface CommandHandler {
  /** Command name (without the / prefix) */
  command: string;
  /** Handler function for the command */
  handler: (message: UserbotMessage, context: UserbotContext) => Promise<void> | void;
  /** Description of the command for help text */
  description: string;
  /** Optional filter function to determine if handler should run */
  filter?: (message: UserbotMessage, context: UserbotContext) => boolean | Promise<boolean>;
  /** Handler priority (lower numbers run first) */
  priority?: number;
}

/**
 * UserbotHandlers class that manages message and command handlers for the userbot
 * Provides a modular and extensible way to handle Telegram events and commands
 */
export class UserbotHandlers {
  private client: UserbotClient;
  private eventHandlers: Map<string, UserbotEventHandler[]> = new Map();
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private messageFilters: MessageFilter[] = [];
  private context: UserbotContext;

  /**
   * Create a new UserbotHandlers instance
   * @param client UserbotClient instance
   * @param context UserbotContext with session and config information
   */
  constructor(client: UserbotClient, context: UserbotContext) {
    this.client = client;
    this.context = context;
  }

  /**
   * Register a message handler for incoming messages
   * @param handler Function to handle incoming messages
   * @param filter Optional filter function to determine if handler should run
   * @param priority Handler priority (lower numbers run first)
   * @returns Promise that resolves when handler is registered
   */
  async registerMessageHandler(
    handler: (message: UserbotMessage, context: UserbotContext) => Promise<void> | void,
    filter?: (message: UserbotMessage, context: UserbotContext) => boolean | Promise<boolean>,
    priority: number = 0
  ): Promise<void> {
    try {
      const eventHandler: UserbotEventHandler = {
        event: 'message',
        handler: async (data: any) => {
          const message = this.convertToUserbotMessage(data);
          if (message && await this.shouldHandleMessage(message, filter)) {
            await handler(message, this.context);
          }
        },
        filter: filter ? (data: any, context?: UserbotContext) => filter(data, context || this.context) : undefined,
        priority
      };

      this.addEventHandler(eventHandler);
      
      // Register with the underlying Telegram client if not already registered
      if (this.eventHandlers.get('message')?.length === 1) {
        await this.client.addMessageHandler(async (event: NewMessageEvent) => {
          await this.handleMessageEvent(event);
        });
      }
    } catch (error) {
      console.error('Failed to register message handler:', error);
      throw new Error(`Failed to register message handler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Register a command handler for specific commands
   * @param commandHandler Command handler configuration
   * @returns Promise that resolves when command handler is registered
   */
  async registerCommandHandler(commandHandler: CommandHandler): Promise<void> {
    try {
      if (!commandHandler.command.startsWith('/')) {
        commandHandler.command = `/${commandHandler.command}`;
      }

      this.commandHandlers.set(commandHandler.command.toLowerCase(), commandHandler);

      // Register a message handler that filters for commands
      await this.registerMessageHandler(
        async (message: UserbotMessage, context: UserbotContext) => {
          const commandText = message.text.trim().toLowerCase();
          const [command] = commandText.split(' ');
          
          if (command === commandHandler.command.toLowerCase()) {
            if (!commandHandler.filter || await commandHandler.filter(message, context)) {
              await commandHandler.handler(message, context);
            }
          }
        },
        async (message: UserbotMessage) => {
          return message.text.trim().toLowerCase().startsWith(commandHandler.command.toLowerCase());
        },
        commandHandler.priority || 0
      );
    } catch (error) {
      console.error(`Failed to register command handler for ${commandHandler.command}:`, error);
      throw new Error(`Failed to register command handler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Register an error handler for userbot errors
   * @param handler Function to handle errors
   * @returns Promise that resolves when error handler is registered
   */
  async registerErrorHandler(
    handler: (error: Error, context: UserbotContext) => Promise<void> | void
  ): Promise<void> {
    try {
      const eventHandler: UserbotEventHandler = {
        event: 'error',
        handler: async (data: any) => {
          const error = data instanceof Error ? data : new Error(String(data));
          await handler(error, this.context);
        },
        priority: 0 // Error handlers should run with high priority
      };

      this.addEventHandler(eventHandler);
    } catch (error) {
      console.error('Failed to register error handler:', error);
      throw new Error(`Failed to register error handler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Register all default handlers (start, help, status, ping)
   * @returns Promise that resolves when all default handlers are registered
   */
  async registerAllHandlers(): Promise<void> {
    try {
      // Register default command handlers
      await this.registerCommandHandler({
        command: '/start',
        description: 'Start the bot and show welcome message',
        handler: this.handleStartCommand.bind(this)
      });

      await this.registerCommandHandler({
        command: '/help',
        description: 'Show available commands and help information',
        handler: this.handleHelpCommand.bind(this)
      });

      await this.registerCommandHandler({
        command: '/status',
        description: 'Show userbot status information',
        handler: this.handleStatusCommand.bind(this)
      });

      await this.registerCommandHandler({
        command: '/ping',
        description: 'Test connectivity with ping/pong',
        handler: this.handlePingCommand.bind(this)
      });

      // Register default error handler
      await this.registerErrorHandler(this.handleDefaultError.bind(this));
    } catch (error) {
      console.error('Failed to register all default handlers:', error);
      throw new Error(`Failed to register default handlers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Unregister a specific event handler
   * @param eventType Event type to unregister
   * @param handler Handler function to remove
   * @returns Promise that resolves when handler is unregistered
   */
  async unregisterHandler(eventType: UserbotEventType, handler: (...args: any[]) => any): Promise<void> {
    try {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        const index = handlers.findIndex(h => h.handler === handler);
        if (index !== -1) {
          handlers.splice(index, 1);
          if (handlers.length === 0) {
            this.eventHandlers.delete(eventType);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to unregister handler for ${eventType}:`, error);
      throw new Error(`Failed to unregister handler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add a message filter for selective message handling
   * @param filter Message filter configuration
   */
  addMessageFilter(filter: MessageFilter): void {
    this.messageFilters.push(filter);
  }

  /**
   * Remove a message filter
   * @param filter Message filter to remove
   */
  removeMessageFilter(filter: MessageFilter): void {
    const index = this.messageFilters.indexOf(filter);
    if (index !== -1) {
      this.messageFilters.splice(index, 1);
    }
  }

  /**
   * Get all registered commands
   * @returns Array of registered command handlers
   */
  getRegisteredCommands(): CommandHandler[] {
    return Array.from(this.commandHandlers.values());
  }

  /**
   * Get userbot status information
   * @returns UserbotStatus object with current status
   */
  getStatus(): UserbotStatus {
    const isConnected = this.client.isConnected();
    const now = Date.now();
    
    return {
      status: isConnected ? 'connected' : 'disconnected',
      message: isConnected ? 'Userbot is connected and ready' : 'Userbot is disconnected',
      lastActivity: now,
      uptime: isConnected ? now - (this.context.metadata?.timestamp || now) : undefined
    };
  }

  /**
   * Handle incoming message events from Telegram
   * @param event NewMessageEvent from Telegram
   */
  private async handleMessageEvent(event: NewMessageEvent): Promise<void> {
    try {
      const handlers = this.eventHandlers.get('message');
      if (!handlers) return;

      const message = this.convertToUserbotMessage(event.message);
      if (!message) return;

      // Sort handlers by priority
      const sortedHandlers = handlers.sort((a, b) => (a.priority || 0) - (b.priority || 0));

      for (const handler of sortedHandlers) {
        try {
          if (!handler.filter || await handler.filter(message, this.context)) {
            await handler.handler(message, this.context);
            
            // If handler is marked as once, remove it after execution
            if (handler.once) {
              await this.unregisterHandler('message' as UserbotEventType, handler.handler);
            }
          }
        } catch (error) {
          console.error('Error in message handler:', error);
          // Trigger error handlers
          await this.triggerErrorHandlers(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } catch (error) {
      console.error('Error handling message event:', error);
      await this.triggerErrorHandlers(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Convert Telegram message to UserbotMessage format
   * @param message Telegram message object
   * @returns UserbotMessage or null if conversion fails
   */
  private convertToUserbotMessage(message: any): UserbotMessage | null {
    try {
      if (!message) return null;

      const userbotMessage: UserbotMessage = {
        id: String(message.id || Date.now()),
        text: message.text || message.message || '',
        chat: message.chat || {},
        date: message.date || Date.now(),
        editDate: message.editDate,
        replyToMessageId: message.replyToMsgId,
        entities: message.entities,
        forwardInfo: message.fwdInfo ? {
          from: message.fwdInfo.from,
          date: message.fwdInfo.date,
          channel: message.fwdInfo.channel,
          signature: message.fwdInfo.postAuthor
        } : undefined
      };

      // Convert media information if present
      if (message.media) {
        userbotMessage.media = {
          type: this.getMediaType(message.media),
          fileId: String(message.media.id || ''),
          fileUniqueId: String(message.media.fileUniqueId || ''),
          fileSize: message.media.size,
          width: message.media.width,
          height: message.media.height,
          duration: message.media.duration,
          fileName: message.media.fileName,
          mimeType: message.media.mimeType
        };
      }

      return userbotMessage;
    } catch (error) {
      console.error('Error converting message to UserbotMessage:', error);
      return null;
    }
  }

  /**
   * Get media type from Telegram media object
   * @param media Telegram media object
   * @returns Media type string
   */
  private getMediaType(media: any): 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'animation' {
    if (media.photo) return 'photo';
    if (media.video) return 'video';
    if (media.document) return 'document';
    if (media.audio) return 'audio';
    if (media.voice) return 'voice';
    if (media.sticker) return 'sticker';
    if (media.animation) return 'animation';
    return 'document';
  }

  /**
   * Check if a message should be handled based on filters
   * @param message UserbotMessage to check
   * @param customFilter Optional custom filter function
   * @returns Promise that resolves to true if message should be handled
   */
  private async shouldHandleMessage(
    message: UserbotMessage, 
    customFilter?: (message: UserbotMessage, context: UserbotContext) => boolean | Promise<boolean>
  ): Promise<boolean> {
    try {
      // Check custom filter first
      if (customFilter && !(await customFilter(message, this.context))) {
        return false;
      }

      // Check registered message filters
      for (const filter of this.messageFilters) {
        if (!(await this.applyMessageFilter(message, filter))) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error in message filtering:', error);
      return false;
    }
  }

  /**
   * Apply a message filter to a message
   * @param message UserbotMessage to filter
   * @param filter Message filter to apply
   * @returns Promise that resolves to true if message passes filter
   */
  private async applyMessageFilter(message: UserbotMessage, filter: MessageFilter): Promise<boolean> {
    try {
      // Check chat IDs
      if (filter.chatIds && filter.chatIds.length > 0) {
        if (!filter.chatIds.includes(message.chat.id)) {
          return false;
        }
      }

      // Check user IDs
      if (filter.userIds && filter.userIds.length > 0) {
        if (!message.from || !filter.userIds.includes(message.from.id)) {
          return false;
        }
      }

      // Check text patterns
      if (filter.textPatterns && filter.textPatterns.length > 0) {
        const textMatch = filter.textPatterns.some(pattern => pattern.test(message.text));
        if (!textMatch) {
          return false;
        }
      }

      // Check message types
      if (filter.messageTypes && filter.messageTypes.length > 0) {
        const messageType = message.media ? message.media.type : 'text';
        if (!filter.messageTypes.includes(messageType as any)) {
          return false;
        }
      }

      // Check date range
      if (filter.since && message.date < filter.since) {
        return false;
      }

      if (filter.until && message.date > filter.until) {
        return false;
      }

      // Check custom filter
      if (filter.customFilter) {
        return await filter.customFilter(message);
      }

      return true;
    } catch (error) {
      console.error('Error applying message filter:', error);
      return false;
    }
  }

  /**
   * Add an event handler to the handlers map
   * @param handler UserbotEventHandler to add
   */
  private addEventHandler(handler: UserbotEventHandler): void {
    if (!isUserbotEventHandler(handler)) {
      throw new Error('Invalid event handler');
    }

    const handlers = this.eventHandlers.get(handler.event) || [];
    handlers.push(handler);
    this.eventHandlers.set(handler.event, handlers);
  }

  /**
   * Trigger error handlers with an error
   * @param error Error to handle
   */
  private async triggerErrorHandlers(error: Error): Promise<void> {
    const handlers = this.eventHandlers.get('error');
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler.handler(error, this.context);
        } catch (handlerError) {
          console.error('Error in error handler:', handlerError);
        }
      }
    }
  }

  /**
   * Handle /start command
   * @param message UserbotMessage
   * @param context UserbotContext
   */
  private async handleStartCommand(message: UserbotMessage, context: UserbotContext): Promise<void> {
    try {
      const welcomeMessage = `👋 Welcome to the Userbot!

I'm a Telegram userbot that can help you with various tasks. Use /help to see available commands.

Current status: ${this.client.isConnected() ? '✅ Connected' : '❌ Disconnected'}`;

      await this.client.sendMessage(message.chat.id, welcomeMessage);
    } catch (error) {
      console.error('Error handling /start command:', error);
      throw error;
    }
  }

  /**
   * Handle /help command
   * @param message UserbotMessage
   * @param context UserbotContext
   */
  private async handleHelpCommand(message: UserbotMessage, context: UserbotContext): Promise<void> {
    try {
      const commands = this.getRegisteredCommands();
      const helpText = commands.length > 0 
        ? commands.map(cmd => `${cmd.command} - ${cmd.description}`).join('\n')
        : 'No commands available.';

      const helpMessage = `📖 Available Commands:

${helpText}

Use any command to interact with the userbot.`;

      await this.client.sendMessage(message.chat.id, helpMessage);
    } catch (error) {
      console.error('Error handling /help command:', error);
      throw error;
    }
  }

  /**
   * Handle /status command
   * @param message UserbotMessage
   * @param context UserbotContext
   */
  private async handleStatusCommand(message: UserbotMessage, context: UserbotContext): Promise<void> {
    try {
      const status = this.getStatus();
      const user = await this.client.getMe();
      
      const statusMessage = `📊 Userbot Status:

Status: ${status.status}
Message: ${status.message}
Connected: ${this.client.isConnected() ? '✅ Yes' : '❌ No'}
User: ${user.firstName || 'Unknown'} ${user.lastName || ''} (@${user.username || 'N/A'})
User ID: ${user.id}
Last Activity: ${new Date(status.lastActivity || Date.now()).toISOString()}
${status.uptime ? `Uptime: ${Math.floor(status.uptime / 1000)}s` : ''}`;

      await this.client.sendMessage(message.chat.id, statusMessage);
    } catch (error) {
      console.error('Error handling /status command:', error);
      throw error;
    }
  }

  /**
   * Handle /ping command
   * @param message UserbotMessage
   * @param context UserbotContext
   */
  private async handlePingCommand(message: UserbotMessage, context: UserbotContext): Promise<void> {
    try {
      const startTime = Date.now();
      await this.client.sendMessage(message.chat.id, '🏓 Pong!');
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      await this.client.sendMessage(
        message.chat.id, 
        `🏓 Pong! Response time: ${responseTime}ms`
      );
    } catch (error) {
      console.error('Error handling /ping command:', error);
      throw error;
    }
  }

  /**
   * Handle default errors
   * @param error Error that occurred
   * @param context UserbotContext
   */
  private async handleDefaultError(error: Error, context: UserbotContext): Promise<void> {
    try {
      console.error('Userbot error:', error);
      
      // In a real implementation, you might want to send error notifications
      // to admin users or log to external monitoring services
      
      // For now, just log the error
      console.error(`Error in userbot context: ${error.message}`);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    } catch (handlerError) {
      console.error('Error in default error handler:', handlerError);
    }
  }
}