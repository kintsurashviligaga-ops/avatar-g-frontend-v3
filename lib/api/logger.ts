/**
 * Structured Logging Utility
 * Provides safe logging without exposing sensitive information
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Production-safe logger
 * - Does NOT log secrets
 * - Does NOT log stack traces in production
 * - Formats errors safely
 */
export class Logger {
  private name: string;
  private isDev = process.env.NODE_ENV === 'development';

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Debug level - only in development
   */
  debug(message: string, context?: Record<string, unknown>) {
    if (!this.isDev) return;
    this.log('debug', message, context);
  }

  /**
   * Info level - general information
   */
  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  /**
   * Warn level - something unexpected but not critical
   */
  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  /**
   * Error level - something failed
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>) {
    const sanitized = this.sanitizeError(error);
    this.log('error', message, { ...context, error: sanitized });
  }

  /**
   * Log with full entry metadata
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message: `[${this.name}] ${message}`,
      context: context ? this.sanitizeContext(context) : undefined,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }

    // TODO: Send to external service (Sentry, DataDog, etc) in production
  }

  /**
   * Sanitize error before logging
   * Remove stack trace in production
   */
  private sanitizeError(error: unknown) {
    if (!(error instanceof Error)) {
      return { message: String(error) };
    }

    return {
      message: error.message,
      name: error.name,
      ...(this.isDev && { stack: error.stack }),
    };
  }

  /**
   * Sanitize context before logging
   * Remove suspected secrets
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      // Skip suspicious keys
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('auth') ||
        key.toLowerCase().includes('api_key')
      ) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Skip large objects
      if (typeof value === 'object' && value !== null) {
        const stringified = JSON.stringify(value);
        if (stringified.length > 1000) {
          sanitized[key] = `[Object length: ${stringified.length}]`;
          continue;
        }
      }

      sanitized[key] = value;
    }

    return sanitized;
  }
}

/**
 * Create a named logger
 */
export function createLogger(name: string): Logger {
  return new Logger(name);
}

// Export default logger for general use
export const logger = new Logger('Avatar-G');
