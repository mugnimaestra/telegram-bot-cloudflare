/**
 * Simple logger utility for the bot
 */

export interface Logger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  setProduction(isProduction: boolean): void;
}

class SimpleLogger implements Logger {
  private isProduction = false;

  setProduction(isProduction: boolean): void {
    this.isProduction = isProduction;
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (!this.isProduction) {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    console.info(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  warn(message: string, meta?: Record<string, any>): void {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  error(message: string, meta?: Record<string, any>): void {
    console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
  }
}

export const logger = new SimpleLogger();