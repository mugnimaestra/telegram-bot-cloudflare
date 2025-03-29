import { PDFDocument, PDFImage } from 'pdf-lib';
import type { GalleryData } from '../nh/fetchNHData'; // Assuming GalleryData is exported from here
import { fetchWithTimeout } from '../nh/fetchWithTimeout'; // Assuming a fetch utility exists

/**
 * Placeholder function for converting WEBP image buffer to PNG.
 * NOTE: This needs a real implementation suitable for Cloudflare Workers
 * (e.g., using WASM, an external API, or Cloudflare Images if available).
 * @param imageBuffer The ArrayBuffer containing WEBP image data.
 * @returns A Promise resolving to an ArrayBuffer of PNG data, or null if conversion fails.
 */
import { decode as webpDecode } from '@jsquash/webp';
import { encode as pngEncode } from '@jsquash/png';

async function convertWebpToPng(imageBuffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    console.log("Decoding WEBP image...");
    const imageData = await webpDecode(imageBuffer);
    console.log(`WEBP decoded successfully: ${imageData.width}x${imageData.height}`);

    console.log("Encoding image data to PNG...");
    const pngBuffer = await pngEncode(imageData);
    console.log("PNG encoding successful.");
    return pngBuffer;
  } catch (error) {
    console.error(`Error during WEBP to PNG conversion: ${error instanceof Error ? error.message : String(error)}`, error);
    return null; // Indicate conversion failure
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
                    continue; // Skip if conversion fails
                }
            } else {
                console.warn(`[${imageNumber}/${totalImages}] Unsupported image format "${format}" for URL: ${imageInfo.url}. Skipping.`);
                // Optionally report unsupported format as an error or just skip
                // if (onProgress) await onProgress({ type: 'error', error: `Unsupported format for image ${imageNumber}` });
                continue; // Skip other unsupported formats
            }
        } catch (embedError) {
            const errorMsg = `Failed to embed image ${imageNumber} (${imageInfo.url}, format: ${format}): ${embedError instanceof Error ? embedError.message : String(embedError)}`;
            console.error(errorMsg, embedError);
            if (onProgress) await onProgress({ type: 'error', error: errorMsg });
            continue; // Skip if embedding fails
        }


        if (embeddedImage) {
          const { width, height } = embeddedImage.scale(1); // Get original dimensions
          const page = pdfDoc.addPage([width, height]); // Create page with image dimensions

          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: width,
            height: height,
          });
          console.log(`[${imageNumber}/${totalImages}] Added image ${imageInfo.url} to PDF.`);
          // Report embedding success
          if (onProgress) await onProgress({ type: 'embedding', current: imageNumber, total: totalImages });
        }
      } catch (fetchError) {
         const errorMsg = `Error processing image ${imageNumber} (${imageInfo.url}): ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
         console.error(errorMsg, fetchError);
         if (onProgress) await onProgress({ type: 'error', error: errorMsg });
        // Continue to the next image even if one fails
      }
    }

    if (pdfDoc.getPageCount() === 0) {
        const errorMsg = "No images could be added to the PDF.";
        console.error(errorMsg);
        if (onProgress) await onProgress({ type: 'error', error: errorMsg });
        return null; // Return null if no pages were added
    }

    // Report saving start
    if (onProgress) await onProgress({ type: 'saving' });
    console.log(`Saving PDF with ${pdfDoc.getPageCount()} pages...`);
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF generated successfully.`);
    return pdfBytes;
  } catch (error) {
    const errorMsg = `Failed to create PDF document: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg, error);
    // Report final error if the whole process fails
    // Note: This might not be reachable if onProgress isn't passed down or handled in the caller
    // Consider if a final status update should happen here or be solely the caller's responsibility
    // if (onProgress) await onProgress({ type: 'error', error: 'Failed to generate PDF.' });
    return null;
  }
}