import { PDFStatus } from "@/types/telegram";

export function getPDFKeyboard(
  galleryId: number,
  status: PDFStatus,
  pdfUrl?: string
): {
  inline_keyboard: Array<
    Array<{
      text: string;
      callback_data?: string;
      url?: string;
    }>
  >;
} {
  const buttons = [];

  // Only show check status button when processing
  if (status === PDFStatus.PROCESSING) {
    buttons.push({
      text: "🔄 Check Status",
      callback_data: `check_pdf_status:${galleryId}`,
    });
  }

  return {
    inline_keyboard: [buttons],
  };
}
