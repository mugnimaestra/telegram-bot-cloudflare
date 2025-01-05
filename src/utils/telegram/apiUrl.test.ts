import { describe, it, expect } from "vitest";
import { apiUrl } from "./apiUrl";

describe("apiUrl", () => {
  const token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  it("should generate basic URL without params", () => {
    const url = apiUrl(token, "getMe");
    expect(url).toBe(`https://api.telegram.org/bot${token}/getMe`);
  });

  it("should generate URL with single parameter", () => {
    const url = apiUrl(token, "sendMessage", { chat_id: 123456 });
    expect(url).toBe(
      `https://api.telegram.org/bot${token}/sendMessage?chat_id=123456`
    );
  });

  it("should generate URL with multiple parameters", () => {
    const url = apiUrl(token, "sendMessage", {
      chat_id: 123456,
      text: "Hello World",
      parse_mode: "MarkdownV2",
    });
    expect(url).toBe(
      `https://api.telegram.org/bot${token}/sendMessage?chat_id=123456&text=Hello+World&parse_mode=MarkdownV2`
    );
  });

  it("should handle empty params object", () => {
    const url = apiUrl(token, "getUpdates", {});
    expect(url).toBe(`https://api.telegram.org/bot${token}/getUpdates`);
  });

  it("should handle undefined parameter values", () => {
    const url = apiUrl(token, "sendMessage", {
      chat_id: 123456,
      text: "Hello",
      reply_to_message_id: undefined,
    });
    expect(url).toBe(
      `https://api.telegram.org/bot${token}/sendMessage?chat_id=123456&text=Hello`
    );
  });

  it("should handle boolean parameter values", () => {
    const url = apiUrl(token, "sendMessage", {
      chat_id: 123456,
      disable_notification: true,
    });
    expect(url).toBe(
      `https://api.telegram.org/bot${token}/sendMessage?chat_id=123456&disable_notification=true`
    );
  });

  it("should handle number parameter values", () => {
    const url = apiUrl(token, "sendMessage", {
      chat_id: 123456,
      message_thread_id: 789,
    });
    expect(url).toBe(
      `https://api.telegram.org/bot${token}/sendMessage?chat_id=123456&message_thread_id=789`
    );
  });
});
