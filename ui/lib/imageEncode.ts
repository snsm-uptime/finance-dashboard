/**
 * Client-side avatar photo prep: canvas resize/crop to a 256x256 square and
 * base64-encode, capped near 200KB — done here so the backend never needs an
 * image library (no Pillow/sharp, no separate media storage).
 */

const AVATAR_SIZE = 256;
const TARGET_MAX_BYTES = 200_000;
const MIN_JPEG_QUALITY = 0.4;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    img.src = url;
  });
}

function drawSquare(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Center-crop to a square before scaling, so the resize never distorts
  // the aspect ratio (no user-adjustable crop — this is automatic).
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (side <= 0) throw new Error("Could not read image file.");
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return canvas;
}

function canvasToDataUri(canvas: HTMLCanvasElement, mimeType: string, quality?: number): string {
  return canvas.toDataURL(mimeType, quality);
}

function decodedByteLength(dataUri: string): number {
  const commaIndex = dataUri.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Resize `file` to a 256x256 square and encode as a base64 data URI, capped
 * near 200KB. PNGs with transparency stay PNG (no quality knob to shrink
 * with); everything else re-encodes as JPEG, stepping quality down until it
 * clears the size cap.
 */
export async function encodeAvatarPhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  const canvas = drawSquare(img);

  if (file.type === "image/png") {
    const dataUri = canvasToDataUri(canvas, "image/png");
    if (decodedByteLength(dataUri) <= TARGET_MAX_BYTES) return dataUri;
    // Oversized PNG (e.g. a large transparent graphic) — fall through to
    // JPEG, which accepts a quality knob small pixel art rarely needs.
  }

  let quality = 0.9;
  let dataUri = canvasToDataUri(canvas, "image/jpeg", quality);
  while (decodedByteLength(dataUri) > TARGET_MAX_BYTES && quality > MIN_JPEG_QUALITY) {
    quality -= 0.1;
    dataUri = canvasToDataUri(canvas, "image/jpeg", quality);
  }
  return dataUri;
}
