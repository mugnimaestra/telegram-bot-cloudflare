import type { Env } from "@/types/env";

/**
 * Session information interface for type safety
 */
interface SessionInfo {
  sessionString: string;
  createdAt: number;
  expiresAt?: number;
}

/**
 * UserbotAuth class provides session management functionality for Telegram userbot authentication
 * Uses Cloudflare KV storage for persistent session storage across worker instances
 */
export class UserbotAuth {
  private static readonly SESSION_KEY = "userbot_session";
  private static readonly SESSION_EXPIRY_KEY = "userbot_session_expiry";
  private static readonly DEFAULT_SESSION_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

  /**
   * Save session string to Cloudflare KV storage
   * @param env Cloudflare Worker environment with KV namespace
   * @param sessionString The session string to save
   * @param ttl Optional time-to-live in seconds (defaults to 30 days)
   * @throws Error if session validation fails or KV storage fails
   */
  static async saveSession(env: Env, sessionString: string, ttl: number = this.DEFAULT_SESSION_TTL): Promise<void> {
    try {
      // Validate session string before saving
      if (!this.validateSession(sessionString)) {
        throw new Error("Invalid session string format");
      }

      // Prepare session data with metadata
      const sessionInfo: SessionInfo = {
        sessionString,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
      };

      // Save session data to KV with expiration
      await env.NAMESPACE?.put(this.SESSION_KEY, JSON.stringify(sessionInfo), {
        expirationTtl: ttl,
      });

      // Also save expiry time separately for quick access
      await env.NAMESPACE?.put(this.SESSION_EXPIRY_KEY, sessionInfo.expiresAt?.toString() || '', {
        expirationTtl: ttl,
      });
    } catch (error) {
      console.error("Failed to save session to KV storage:", error);
      throw new Error(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load session string from Cloudflare KV storage
   * @param env Cloudflare Worker environment with KV namespace
   * @returns The session string if found and valid, null otherwise
   * @throws Error if KV storage access fails
   */
  static async loadSession(env: Env): Promise<string | null> {
    try {
      // Retrieve session data from KV
      const sessionData = await env.NAMESPACE?.get(this.SESSION_KEY);
      
      if (!sessionData) {
        return null;
      }

      // Parse and validate session data
      let sessionInfo: SessionInfo;
      try {
        sessionInfo = JSON.parse(sessionData) as SessionInfo;
      } catch (parseError) {
        console.error("Failed to parse session data:", parseError);
        // Clear corrupted session data
        await this.clearSession(env);
        return null;
      }

      // Validate the session string format
      if (!this.validateSession(sessionInfo.sessionString)) {
        console.error("Invalid session string format in stored data");
        await this.clearSession(env);
        return null;
      }

      // Check if session has expired
      if (sessionInfo.expiresAt && Date.now() > sessionInfo.expiresAt) {
        console.log("Session has expired, clearing from storage");
        await this.clearSession(env);
        return null;
      }

      return sessionInfo.sessionString;
    } catch (error) {
      console.error("Failed to load session from KV storage:", error);
      throw new Error(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clear session from Cloudflare KV storage
   * @param env Cloudflare Worker environment with KV namespace
   * @throws Error if KV storage access fails
   */
  static async clearSession(env: Env): Promise<void> {
    try {
      // Delete both session data and expiry time
      await env.NAMESPACE?.delete(this.SESSION_KEY);
      await env.NAMESPACE?.delete(this.SESSION_EXPIRY_KEY);
    } catch (error) {
      console.error("Failed to clear session from KV storage:", error);
      throw new Error(`Failed to clear session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate session string format
   * @param sessionString The session string to validate
   * @returns True if the session string format is valid, false otherwise
   */
  static validateSession(sessionString: string): boolean {
    if (!sessionString || typeof sessionString !== 'string') {
      return false;
    }

    // Basic validation for Telegram session strings
    // Session strings are typically base64-encoded and have a minimum length
    try {
      // Check if it's a reasonable length (Telegram sessions are usually quite long)
      if (sessionString.length < 50) {
        return false;
      }

      // Check if it contains valid base64 characters (basic check)
      // Telegram sessions may contain various characters, so we'll be lenient
      const base64Regex = /^[A-Za-z0-9+/=_\-]+$/;
      if (!base64Regex.test(sessionString)) {
        return false;
      }

      // Try to decode as base64 to ensure it's valid
      // Note: We don't need the actual decoded data, just validation
      atob(sessionString.replace(/_/g, '/').replace(/-/g, '+'));
      
      return true;
    } catch (error) {
      // If base64 decoding fails, it's not a valid session string
      return false;
    }
  }

  /**
   * Get session expiry time from KV storage
   * @param env Cloudflare Worker environment with KV namespace
   * @returns The expiry timestamp in milliseconds since epoch, or null if not found/expired
   * @throws Error if KV storage access fails
   */
  static async getSessionExpiry(env: Env): Promise<number | null> {
    try {
      // Try to get expiry from the separate key first (faster)
      const expiryString = await env.NAMESPACE?.get(this.SESSION_EXPIRY_KEY);
      
      if (expiryString) {
        const expiryTime = parseInt(expiryString, 10);
        if (!isNaN(expiryTime) && Date.now() <= expiryTime) {
          return expiryTime;
        }
      }

      // Fallback to full session data parsing
      const sessionData = await env.NAMESPACE?.get(this.SESSION_KEY);
      if (!sessionData) {
        return null;
      }

      const sessionInfo: SessionInfo = JSON.parse(sessionData);
      
      if (sessionInfo.expiresAt && Date.now() <= sessionInfo.expiresAt) {
        return sessionInfo.expiresAt;
      }

      return null;
    } catch (error) {
      console.error("Failed to get session expiry from KV storage:", error);
      throw new Error(`Failed to get session expiry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a session exists and is valid
   * @param env Cloudflare Worker environment with KV namespace
   * @returns True if a valid session exists, false otherwise
   */
  static async hasValidSession(env: Env): Promise<boolean> {
    try {
      const session = await this.loadSession(env);
      return session !== null;
    } catch (error) {
      console.error("Failed to check for valid session:", error);
      return false;
    }
  }

  /**
   * Extend session expiry time
   * @param env Cloudflare Worker environment with KV namespace
   * @param additionalTtl Additional time-to-live in seconds (defaults to 30 days)
   * @throws Error if session extension fails
   */
  static async extendSession(env: Env, additionalTtl: number = this.DEFAULT_SESSION_TTL): Promise<void> {
    try {
      const sessionString = await this.loadSession(env);
      if (!sessionString) {
        throw new Error("No existing session to extend");
      }

      await this.saveSession(env, sessionString, additionalTtl);
    } catch (error) {
      console.error("Failed to extend session:", error);
      throw new Error(`Failed to extend session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}