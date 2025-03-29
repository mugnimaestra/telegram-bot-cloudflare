import { PDFDocument, PDFImage } from 'pdf-lib';
import webpDecode, { init as initWebpDecode } from '@jsquash/webp/decode.js';
import pngEncode, { init as initPngEncode } from '@jsquash/png/encode.js';
import type { GalleryData } from '../nh/fetchNHData';
import { fetchWithTimeout } from '../nh/fetchWithTimeout';

// Initialize WASM modules
(async () => {
  try {
    const [webpDecodeWasm, pngEncodeWasm] = await Promise.all([
      fetch(new URL('@jsquash/webp/codec/dec/webp_dec.wasm', import.meta.url))
        .then(res => res.arrayBuffer()),
      fetch(new URL('@jsquash/png/codec/pkg/squoosh_png_bg.wasm', import.meta.url))
        .then(res => res.arrayBuffer())
    ]);

    await Promise.all([
      initWebpDecode(webpDecodeWasm),
      initPngEncode(pngEncodeWasm)
    ]);
    console.log('WASM modules initialized successfully');
  } catch (error) {
    console.error('Failed to initialize WASM modules:', error);
  }
})();

/**
 * Converts a WEBP image buffer to PNG using @jsquash/webp and @jsquash/png.
 * @param imageBuffer The ArrayBuffer containing WEBP image data.
 * @returns A Promise resolving to an ArrayBuffer of PNG data, or null if conversion fails.
 */
async function convertWebpToPng(imageBuffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    console.log("Attempting WEBP decoding...");
    const imageData = await webpDecode(imageBuffer);
    console.log(`WEBP decoded successfully: ${imageData.width}x${imageData.height}`);

    console.log("Attempting PNG encoding...");
    const pngBuffer = await pngEncode(imageData);
    console.log("PNG encoded successfully.");
    
    return pngBuffer;
  } catch (error) {
    console.error('WEBP to PNG conversion failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Define the type for the progress callback status
export type PdfProgressStatus = {
  type: 'downloading' | 'embedding' | 'saving' | 'error';
  current?: number;
  total?: number;
  error?: string;
};

// Define the type for the progress callback function
export type PdfProgressCallback = (status: PdfProgressStatus) => Promise<void>;

/**
 * Creates a PDF document from a gallery's images, processing a maximum of 49 images.
 * Reports progress via an optional callback.
 *
 * @param images - An array of image objects, each containing a URL and file format.
 * @param onProgress - Optional callback function to report progress.
 * @returns A Promise resolving to a Uint8Array containing the PDF data, or null if an error occurs.
 */
export async function createPdfFromGallery(
  images: GalleryData['images'],
  onProgress?: PdfProgressCallback,
): Promise<Uint8Array | null> {
  try {
    const pdfDoc = await PDFDocument.create();
    // Limit processing to the first 49 images due to Cloudflare subrequest limits
    const imagesToProcess = images.slice(0, 49);
    const totalImages = imagesToProcess.length;

    for (const [index, imageInfo] of imagesToProcess.entries()) {
      const imageNumber = index + 1;
      try {
        // Report download start
        if (onProgress) await onProgress({ type: 'downloading', current: imageNumber, total: totalImages });
        console.log(`[${imageNumber}/${totalImages}] Fetching image: ${imageInfo.url}`);

        const imageResponse = await fetchWithTimeout(imageInfo.url);
        if (!imageResponse.ok) {
          const errorMsg = `Failed to fetch image ${imageNumber} (${imageInfo.url}): ${imageResponse.statusText}`;
          console.error(errorMsg);
          if (onProgress) await onProgress({ type: 'error', error: errorMsg });
          continue; // Skip this image
        }
        const imageBuffer = await imageResponse.arrayBuffer();

        let embeddedImage: PDFImage | null = null;
        const format = imageInfo.fileFormat.toLowerCase();

        try {
            if (format === 'jpg' || format === 'jpeg') {
                console.log(`[${imageNumber}/${totalImages}] Embedding JPG image...`);
                embeddedImage = await pdfDoc.embedJpg(imageBuffer);
            } else if (format === 'png') {
                console.log(`[${imageNumber}/${totalImages}] Embedding PNG image...`);
                embeddedImage = await pdfDoc.embedPng(imageBuffer);
            } else if (format === 'webp') {
                console.log(`[${imageNumber}/${totalImages}] WEBP detected. Attempting conversion to PNG...`);
                const convertedBuffer = await convertWebpToPng(imageBuffer);
                if (convertedBuffer) {
                    console.log(`[${imageNumber}/${totalImages}] WEBP converted to PNG successfully. Embedding PNG...`);
                    embeddedImage = await pdfDoc.embedPng(convertedBuffer);
                } else {
                    console.warn(`[${imageNumber}/${totalImages}] Failed to convert WEBP image ${imageInfo.url}. Skipping.`);
                    if (onProgress) await onProgress({ type: 'error', error: `Failed to convert WEBP image ${imageNumber}` });
                    continue;
                }
            } else {
                console.warn(`[${imageNumber}/${totalImages}] Unsupported image format "${format}" for URL: ${imageInfo.url}. Skipping.`);
                continue;
            }
        } catch (embedError) {
            const errorMsg = `Failed to embed image ${imageNumber} (${imageInfo.url}, format: ${format}): ${embedError instanceof Error ? embedError.message : String(embedError)}`;
            console.error(errorMsg, embedError);
            if (onProgress) await onProgress({ type: 'error', error: errorMsg });
            continue;
        }

        if (embeddedImage) {
          const { width, height } = embeddedImage.scale(1);
          const page = pdfDoc.addPage([width, height]);

          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: width,
            height: height,
          });
          console.log(`[${imageNumber}/${totalImages}] Added image ${imageInfo.url} to PDF.`);
          if (onProgress) await onProgress({ type: 'embedding', current: imageNumber, total: totalImages });
        }
      } catch (fetchError) {
         const errorMsg = `Error processing image ${imageNumber} (${imageInfo.url}): ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
         console.error(errorMsg, fetchError);
         if (onProgress) await onProgress({ type: 'error', error: errorMsg });
      }
    }

    if (pdfDoc.getPageCount() === 0) {
        const errorMsg = "No images could be added to the PDF.";
        console.error(errorMsg);
        if (onProgress) await onProgress({ type: 'error', error: errorMsg });
        return null;
    }

    if (onProgress) await onProgress({ type: 'saving' });
    console.log(`Saving PDF with ${pdfDoc.getPageCount()} pages...`);
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF generated successfully.`);
    return pdfBytes;
  } catch (error) {
    const errorMsg = `Failed to create PDF document: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg, error);
    return null;
  }
}