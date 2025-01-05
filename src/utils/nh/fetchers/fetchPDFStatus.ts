import { fetcher } from "@/utils/fetcher";
import { PDFStatus } from "@/types/telegram";

export interface FetchPDFStatusParams {
  galleryId: string;
}

export interface PDFStatusResponse {
  status: boolean;
  pdf_status: PDFStatus;
  pdf_url?: string;
}

export async function fetchPDFStatus(
  params: FetchPDFStatusParams,
  nhApiUrl: string
): Promise<PDFStatusResponse> {
  return fetcher<PDFStatusResponse>({
    method: "GET",
    url: `/pdf-status/${params.galleryId}`,
    baseUrl: nhApiUrl,
  });
}
