import { toJakartaTime } from "./dateUtils";
import { RSCMError } from "./types";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  error?: RSCMError;
}

class RSCMLogger {
  private static instance: RSCMLogger;
  private logs: LogEntry[] = [];
  private isProduction: boolean = false;

  private constructor() {}

  public static getInstance(): RSCMLogger {
    if (!RSCMLogger.instance) {
      RSCMLogger.instance = new RSCMLogger();
    }
    return RSCMLogger.instance;
  }

  public setProduction(isProduction: boolean): void {
    this.isProduction = isProduction;
  }

  private formatTimestamp(): string {
    const jakartaTime = toJakartaTime(new Date());
    return jakartaTime.toISOString().replace("T", " ").split(".")[0];
  }

  private log(level: LogLevel, message: string, data?: any, error?: RSCMError) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      ...(data && { data }),
      ...(error && { error }),
    };

    this.logs.push(entry);

    // Format the console output
    const timestamp = `[${entry.timestamp}]`;
    const levelStr = level.toUpperCase().padEnd(5);
    
    // Enhanced formatting for errors
    let dataStr = "";
    if (error) {
      dataStr = `\nError: ${error.type} [${error.code || 'N/A'}]\n${JSON.stringify(error.toJSON(), null, 2)}`;
    } else if (data) {
      dataStr = `\n${JSON.stringify(data, null, 2)}`;
    }

    // Only add timestamp if there's actual content
    if (message.trim() || dataStr.trim()) {
      console[level === "error" ? "error" : "log"](
        `${timestamp} ${levelStr} ${message}${dataStr}`
      );
    }
  }

  public info(message: string, data?: any) {
    this.log("info", message, data);
  }

  public warn(message: string, data?: any) {
    this.log("warn", message, data);
  }

  public error(message: string, data?: any, error?: RSCMError) {
    this.log("error", message, data, error);
  }

  public debug(message: string, data?: any) {
    if (!this.isProduction) {
      this.log("debug", message, data);
    }
  }

  /**
   * Log an RSCMError with enhanced formatting
   */
  public logError(error: RSCMError, context?: string): void {
    const message = context ? `${context}: ${error.message}` : error.message;
    this.error(message, error.details, error);
  }

  /**
   * Log performance metrics
   */
  public performance(operation: string, duration: number, data?: any): void {
    this.info(`Performance: ${operation} took ${duration}ms`, {
      operation,
      duration,
      ...data,
    });
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
  }
}

export const logger = RSCMLogger.getInstance();
