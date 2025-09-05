export function escapeMarkdown(text: string): string {
  if (!text) {
    return ""; // Return empty string for undefined, null, or empty input
  }
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
