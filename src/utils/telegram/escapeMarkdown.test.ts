import { describe, it, expect } from "vitest";
import { 
  escapeMarkdown, 
  escapeMarkdownCode, 
  bold, 
  italic, 
  underline, 
  strikethrough, 
  spoiler, 
  code, 
  link 
} from "./escapeMarkdown";

describe("escapeMarkdown", () => {
  it("should escape special Markdown V2 characters", () => {
    const input = "_*[]()~`>#+=|{}.!-";
    const expected = "\\_\\*\\[\\]()\\~\\`\\>\\#\\+\\=\\|\\{\\}\\.\\!\\-";
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it("should handle text with multiple special characters", () => {
    const input = "Hello *world* with _emphasis_ and [link](url)";
    const expected =
      "Hello \\*world\\* with \\_emphasis\\_ and \\[link\\](url)";
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

describe("escapeMarkdownCode", () => {
  it("should escape backticks and backslashes only", () => {
    const input = "const text = `hello\\world`;";
    const expected = "const text = \\`hello\\\\world\\`;";
    expect(escapeMarkdownCode(input)).toBe(expected);
  });

  it("should not escape other special characters", () => {
    const input = "function test() { return *bold*; }";
    const expected = "function test() { return *bold*; }";
    expect(escapeMarkdownCode(input)).toBe(expected);
  });
});

describe("formatting helpers", () => {
  describe("bold", () => {
    it("should create bold text with proper escaping", () => {
      const input = "Hello *world*";
      const expected = "*Hello \\*world\\**";
      expect(bold(input)).toBe(expected);
    });

    it("should handle empty input", () => {
      expect(bold("")).toBe("");
    });
  });

  describe("italic", () => {
    it("should create italic text with proper escaping", () => {
      const input = "Hello _world_";
      const expected = "_Hello \\_world\\__";
      expect(italic(input)).toBe(expected);
    });
  });

  describe("underline", () => {
    it("should create underlined text with proper escaping", () => {
      const input = "Hello world";
      const expected = "__Hello world__";
      expect(underline(input)).toBe(expected);
    });
  });

  describe("strikethrough", () => {
    it("should create strikethrough text with proper escaping", () => {
      const input = "Hello ~world~";
      const expected = "~Hello \\~world\\~~";
      expect(strikethrough(input)).toBe(expected);
    });
  });

  describe("spoiler", () => {
    it("should create spoiler text with proper escaping", () => {
      const input = "Secret message";
      const expected = "||Secret message||";
      expect(spoiler(input)).toBe(expected);
    });
  });

  describe("code", () => {
    it("should create inline code with proper escaping", () => {
      const input = "const text = `hello`;";
      const expected = "`const text = \\`hello\\`;`";
      expect(code(input)).toBe(expected);
    });
  });

  describe("link", () => {
    it("should create links with proper escaping", () => {
      const text = "Click here!";
      const url = "https://example.com?param=value";
      const expected = "[Click here\\!](https://example\\.com?param\\=value)";
      expect(link(text, url)).toBe(expected);
    });

    it("should handle empty inputs", () => {
      expect(link("", "")).toBe("");
      expect(link("text", "")).toBe("");
      expect(link("", "url")).toBe("");
    });
  });
});
