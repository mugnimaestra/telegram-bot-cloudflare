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

  // Always add check status button unless completed
  if (status !== PDFStatus.COMPLETED) {
    buttons.push({
      text: "🔄 Check Status",
      callback_data: `check_pdf_status:${galleryId}`,
    });
  }

  // Add get PDF button if PDF is ready
  if (status === PDFStatus.COMPLETED) {
    buttons.push({
      text: "📥 Get PDF",
      callback_data: `get_pdf:${galleryId}`,
    });
  }

  return {
    inline_keyboard: [buttons],
  };
}
