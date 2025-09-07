/**
 * Escapes text for use in Telegram MarkdownV2 format
 * Based on official Telegram Bot API documentation
 * https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdown(text: string): string {
  if (!text) {
    return ""; // Return empty string for undefined, null, or empty input
  }
  
  // Characters that need escaping in MarkdownV2:
  // '_', '*', '[', ']', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\'
  // Note: Parentheses '()' are NOT escaped as they're commonly used in text
  return text.replace(/[_*[\]~`>#+=|{}.!\\-]/g, "\\$&");
}

/**
 * Escapes text that will NOT be wrapped in formatting entities
 * Use this for regular text that appears outside of bold, italic, etc.
 */
export function escapeRegularText(text: string): string {
  return escapeMarkdown(text);
}

/**
 * Escapes text that will be wrapped in formatting entities (bold, italic, etc.)
 * For text inside formatting entities, we still need to escape most characters
 */
export function escapeFormattedText(text: string): string {
  if (!text) {
    return "";
  }
  // Inside formatting entities, we still need to escape special characters
  // but we need to be more careful about which ones
  // Note: Parentheses '()' are NOT escaped as they're commonly used in text
  return text.replace(/[_*[\]~`>#+=|{}.!\\-]/g, "\\$&");
}

/**
 * Escapes text specifically for use inside pre-formatted code blocks
 * Only backticks and backslashes need escaping inside code blocks
 */
export function escapeMarkdownCode(text: string): string {
  if (!text) {
    return "";
  }
  return text.replace(/[`\\]/g, "\\$&");
}

/**
 * Creates bold text with proper escaping
 */
export function bold(text: string): string {
  if (!text) return "";
  return `*${escapeFormattedText(text)}*`;
}

/**
 * Creates italic text with proper escaping
 */
export function italic(text: string): string {
  if (!text) return "";
  return `_${escapeFormattedText(text)}_`;
}

/**
 * Creates underlined text with proper escaping
 */
export function underline(text: string): string {
  if (!text) return "";
  return `__${escapeFormattedText(text)}__`;
}

/**
 * Creates strikethrough text with proper escaping
 */
export function strikethrough(text: string): string {
  if (!text) return "";
  return `~${escapeFormattedText(text)}~`;
}

/**
 * Creates spoiler text with proper escaping
 */
export function spoiler(text: string): string {
  if (!text) return "";
  return `||${escapeFormattedText(text)}||`;
}

/**
 * Creates inline code with proper escaping
 */
export function code(text: string): string {
  if (!text) return "";
  return `\`${escapeMarkdownCode(text)}\``;
}

/**
 * Creates a link with proper escaping
 */
export function link(text: string, url: string): string {
  if (!text || !url) return "";
  return `[${escapeFormattedText(text)}](${escapeRegularText(url)})`;
}
