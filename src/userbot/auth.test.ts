import { describe, it, expect } from 'vitest';
import { UserbotAuth } from './auth';

describe('UserbotAuth', () => {
  describe('validateSession', () => {
    it('should validate valid base64 session strings', () => {
      // Valid base64 strings that should pass
      const validSessions = [
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj-eXkZSBtZXNzYWdlLmlkPTQyNjk5NDk1JnQ9MTczNTY3ODkwOSZ2PTEmdG9rZW49WVdSdGFXND0',
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj-eXkZSBtZXNzYWdlLmlkPTQyNjk5NDk1JnQ9MTczNTY3ODkwOSZ2PTEmdG9rZW49WVdSdGFXND0=',
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj_eXkZSBtZXNzYWdlLmlkPTQyNjk5NDk1JnQ9MTczNTY3ODkwOSZ2PTEmdG9rZW49WVdSdGFXND0',
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj_eXkZSBtZXNzYWdlLmlkPTQyNjk5NDk1JnQ9MTczNTY3ODkwOSZ2PTEmdG9rZW49WVdSdGFXND0='
      ];

      validSessions.forEach(session => {
        expect(UserbotAuth.validateSession(session)).toBe(true);
      });
    });

    it('should reject invalid session strings', () => {
      // Invalid strings that should fail
      const invalidSessions = [
        '', // empty string
        'short', // too short
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj@invalid', // contains invalid character
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj invalid', // contains space
        'AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj!invalid', // contains special character
        null as any, // null
        undefined as any, // undefined
        123 as any, // non-string
      ];

      invalidSessions.forEach(session => {
        expect(UserbotAuth.validateSession(session)).toBe(false);
      });
    });

    it('should not throw errors when validating invalid base64', () => {
      // These should not throw errors, just return false
      expect(() => UserbotAuth.validateSession('invalid_base64_string_with_special_chars!@#')).not.toThrow();
      expect(() => UserbotAuth.validateSession('AQBApO9zA4OUZBA2lKdlNqLmxlZ2Fj@invalid')).not.toThrow();
    });

    it('should handle edge cases with base64 characters', () => {
      // Test with valid length and valid characters
      const validLongSession = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/_-' + 'A'.repeat(50);
      expect(UserbotAuth.validateSession(validLongSession)).toBe(true);
      
      // Test with invalid characters in an otherwise valid-length string
      const invalidCharSession = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/_-@' + 'A'.repeat(50);
      expect(UserbotAuth.validateSession(invalidCharSession)).toBe(false);
    });
  });
});