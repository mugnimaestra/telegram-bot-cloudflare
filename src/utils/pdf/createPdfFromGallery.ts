import { PDFDocument, PDFImage } from 'pdf-lib';
import type { GalleryData } from '../nh/fetchNHData'; // Assuming GalleryData is exported from here
import { fetchWithTimeout } from '../nh/fetchWithTimeout'; // Assuming a fetch utility exists

/**
 * Creates a PDF document from a gallery's images.
 *
 * @param images - An array of image objects, each containing a URL and file format.
 * @returns A Promise resolving to a Uint8Array containing the PDF data, or null if an error occurs.
 */
export async function createPdfFromGallery(
  images: GalleryData['images'],
): Promise<Uint8Array | null> {
  try {
    const pdfDoc = await PDFDocument.create();

    for (const imageInfo of images) {
      try {
        console.log(`Fetching image: ${imageInfo.url}`);
        const imageResponse = await fetchWithTimeout(imageInfo.url);
        if (!imageResponse.ok) {
          console.error(
            `Failed to fetch image ${imageInfo.url}: ${imageResponse.statusText}`,
          );
          continue; // Skip this image
        }
        const imageBuffer = await imageResponse.arrayBuffer();

        let embeddedImage: PDFImage | null = null;
        const format = imageInfo.fileFormat.toLowerCase();

        try {
            if (format === 'jpg' || format === 'jpeg') {
                embeddedImage = await pdfDoc.embedJpg(imageBuffer);
            } else if (format === 'png') {
                embeddedImage = await pdfDoc.embedPng(imageBuffer);
            } else {
                console.warn(`Unsupported image format "${format}" for URL: ${imageInfo.url}. Skipping.`);
                continue; // Skip unsupported formats
            }
        } catch (embedError) {
            console.error(`Failed to embed image ${imageInfo.url}:`, embedError);
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
          console.log(`Added image ${imageInfo.url} to PDF.`);
        }
      } catch (fetchError) {
        console.error(`Error processing image ${imageInfo.url}:`, fetchError);
        // Continue to the next image even if one fails
      }
    }

    if (pdfDoc.getPageCount() === 0) {
        console.error("No images could be added to the PDF.");
        return null; // Return null if no pages were added
    }

    const pdfBytes = await pdfDoc.save();
    console.log(`PDF generated successfully with ${pdfDoc.getPageCount()} pages.`);
    return pdfBytes;
  } catch (error) {
    console.error('Failed to create PDF document:', error);
    return null;
  }
}