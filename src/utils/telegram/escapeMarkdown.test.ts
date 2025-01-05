import { describe, it, expect } from "vitest";
import { escapeMarkdown } from "./escapeMarkdown";

describe("escapeMarkdown", () => {
  it("should escape special Markdown V2 characters", () => {
    const input = "_*[]()~`>#+=|{}.!-";
    const expected = "\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\=\\|\\{\\}\\.\\!\\-";
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it("should handle text with multiple special characters", () => {
    const input = "Hello *world* with _emphasis_ and [link](url)";
    const expected =
      "Hello \\*world\\* with \\_emphasis\\_ and \\[link\\]\\(url\\)";
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it("should handle text without special characters", () => {
    const input = "Hello world 123";
    expect(escapeMarkdown(input)).toBe(input);
  });

  it("should handle empty string", () => {
    expect(escapeMarkdown("")).toBe("");
  });

  it("should handle string with multiple consecutive special characters", () => {
    const input = "**__##";
    const expected = "\\*\\*\\_\\_\\#\\#";
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it("should handle string with special characters at start and end", () => {
    const input = "*Hello!";
    const expected = "\\*Hello\\!";
    expect(escapeMarkdown(input)).toBe(expected);
  });
});
