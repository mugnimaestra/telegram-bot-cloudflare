/**
 * Extracts a valid NH ID from various input formats:
 * - https://nhentai.net/g/547949/
 * - #547949
 * - 547949
 *
 * @param input The input string to extract the ID from
 * @returns The extracted ID if valid, null otherwise
 */
export function extractNHId(input: string): string | null {
  if (!input) return null;

  // Try to extract from URL format
  if (input.includes("nhentai.net/g/")) {
    const match = input.match(/nhentai\.net\/g\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }

  // Try to extract from hash format
  if (input.startsWith("#")) {
    const id = input.slice(1);
    return /^\d+$/.test(id) ? id : null;
  }

  // Try raw numeric format
  return /^\d+$/.test(input) ? input : null;
}
