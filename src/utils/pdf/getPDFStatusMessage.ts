import { PDFStatus } from "@/types/telegram";

export function getPDFStatusMessage(status: PDFStatus | undefined): string {
  // Keep only essential status logging
  console.log("[NH] Processing PDF Status:", status);

  switch (status) {
    case PDFStatus.PROCESSING:
      return "PDF is being generated\\. Click the button below to check status\\.";
    case PDFStatus.COMPLETED:
      return "PDF is ready\\! Click the button below to get the file\\.";
    case PDFStatus.FAILED:
      return "PDF generation failed\\. Using Telegraph viewer instead\\.";
    case PDFStatus.UNAVAILABLE:
      return "PDF service is currently unavailable\\. Using Telegraph viewer instead\\.";
    case PDFStatus.NOT_REQUESTED:
      return "PDF generation not yet requested\\. Using Telegraph viewer instead\\.";
    case PDFStatus.ERROR:
      return "Error occurred during PDF generation\\. Using Telegraph viewer instead\\.";
    default:
      console.log("[NH] Unhandled PDF Status:", status);
      return "PDF is not available\\. Using Telegraph viewer instead\\.";
  }
}
