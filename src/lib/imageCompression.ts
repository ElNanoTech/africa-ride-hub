const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — aggressive for low bandwidth
const TARGET_SIZE = 800 * 1024;       // 800KB target for upload
const MAX_DIMENSION = 1280;           // Max 1280px — good enough for mobile

/**
 * Compress an image file to fit under the max file size.
 * Returns the original file if it's already small enough or not an image.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_FILE_SIZE || !file.type.startsWith('image/')) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  
  // Scale down if too large
  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Try WebP first (smaller), fallback to JPEG
  const supportsWebP = typeof OffscreenCanvas !== 'undefined';
  const mimeType = supportsWebP ? 'image/webp' : 'image/jpeg';
  
  // Try decreasing quality until under target
  let quality = 0.7;
  let blob: Blob;
  do {
    blob = await canvas.convertToBlob({ type: mimeType, quality });
    quality -= 0.1;
  } while (blob.size > TARGET_SIZE && quality > 0.15);

  const ext = mimeType === 'image/webp' ? '.webp' : '.jpg';
  const name = file.name.replace(/\.[^.]+$/, ext);
  return new File([blob], name, { type: mimeType });
}
