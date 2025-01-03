import { describe, it, expect } from "vitest";
import { getPDFStatusMessage } from "./getPDFStatusMessage";
import { PDFStatus } from "@/types/telegram";

describe("getPDFStatusMessage", () => {
  it("should return correct message for PROCESSING status", () => {
    const message = getPDFStatusMessage(PDFStatus.PROCESSING);
    expect(message).toBe(
      "PDF is being generated\\. Click the button below to check status\\."
    );
  });

  it("should return correct message for COMPLETED status", () => {
    const message = getPDFStatusMessage(PDFStatus.COMPLETED);
    expect(message).toBe(
      "PDF is ready\\! Click the button below to get the file\\."
    );
  });

  it("should return correct message for FAILED status", () => {
    const message = getPDFStatusMessage(PDFStatus.FAILED);
    expect(message).toBe(
      "PDF generation failed\\. Using Telegraph viewer instead\\."
    );
  });

  it("should return correct message for UNAVAILABLE status", () => {
    const message = getPDFStatusMessage(PDFStatus.UNAVAILABLE);
    expect(message).toBe(
      "PDF service is currently unavailable\\. Using Telegraph viewer instead\\."
    );
  });

  it("should return correct message for NOT_REQUESTED status", () => {
    const message = getPDFStatusMessage(PDFStatus.NOT_REQUESTED);
    expect(message).toBe(
      "PDF generation not yet requested\\. Using Telegraph viewer instead\\."
    );
  });

  it("should return correct message for ERROR status", () => {
    const message = getPDFStatusMessage(PDFStatus.ERROR);
    expect(message).toBe(
      "Error occurred during PDF generation\\. Using Telegraph viewer instead\\."
    );
  });

  it("should return default message for undefined status", () => {
    const message = getPDFStatusMessage(undefined);
    expect(message).toBe(
      "PDF is not available\\. Using Telegraph viewer instead\\."
    );
  });
});
