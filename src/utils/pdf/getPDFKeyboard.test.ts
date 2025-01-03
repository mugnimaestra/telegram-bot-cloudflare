import { describe, it, expect } from "vitest";
import { getPDFKeyboard } from "./getPDFKeyboard";
import { PDFStatus } from "@/types/telegram";

describe("getPDFKeyboard", () => {
  const galleryId = 123456;

  it("should return keyboard with check status button when status is PROCESSING", () => {
    const keyboard = getPDFKeyboard(galleryId, PDFStatus.PROCESSING);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(1);
    expect(keyboard.inline_keyboard[0][0]).toEqual({
      text: "🔄 Check Status",
      callback_data: `check_pdf_status:${galleryId}`,
    });
  });

  it("should return empty keyboard for COMPLETED status", () => {
    const keyboard = getPDFKeyboard(galleryId, PDFStatus.COMPLETED);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(0);
  });

  it("should return empty keyboard for FAILED status", () => {
    const keyboard = getPDFKeyboard(galleryId, PDFStatus.FAILED);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(0);
  });

  it("should return empty keyboard for UNAVAILABLE status", () => {
    const keyboard = getPDFKeyboard(galleryId, PDFStatus.UNAVAILABLE);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(0);
  });

  it("should return empty keyboard for NOT_REQUESTED status", () => {
    const keyboard = getPDFKeyboard(galleryId, PDFStatus.NOT_REQUESTED);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(0);
  });

  it("should return empty keyboard for ERROR status", () => {
    const keyboard = getPDFKeyboard(galleryId, PDFStatus.ERROR);
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(0);
  });

  it("should ignore pdfUrl parameter", () => {
    const keyboard = getPDFKeyboard(
      galleryId,
      PDFStatus.PROCESSING,
      "http://example.com/pdf"
    );
    expect(keyboard.inline_keyboard).toHaveLength(1);
    expect(keyboard.inline_keyboard[0]).toHaveLength(1);
    expect(keyboard.inline_keyboard[0][0]).toEqual({
      text: "🔄 Check Status",
      callback_data: `check_pdf_status:${galleryId}`,
    });
  });
});
