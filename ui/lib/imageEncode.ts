/**
 * Client-side avatar photo prep: canvas crop/resize to a 256x256 square and
 * base64-encode, capped near 200KB — done here so the backend never needs an
 * image library (no Pillow/sharp, no separate media storage).
 */

const AVATAR_SIZE = 256;
const TARGET_MAX_BYTES = 200_000;
const MIN_JPEG_QUALITY = 0.4;

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function loadImage(file: File): Promise<HTMLImageElement> {
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

function drawCroppedSquare(img: HTMLImageElement, area: Area): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
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
 * PNGs with transparency stay PNG (no quality knob to shrink with) as long
 * as they clear the size cap; everything else re-encodes as JPEG, stepping
 * quality down until it clears the size cap.
 */
function encodeCanvas(canvas: HTMLCanvasElement, mimeType: string): string {
  if (mimeType === "image/png") {
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

/**
 * Crop `img` to the caller-supplied source rectangle, resize to a 256x256
 * square, and encode as a base64 data URI, capped near 200KB.
 */
export async function encodeCroppedAvatar(
  img: HTMLImageElement,
  area: Area,
  mimeType: string,
): Promise<string> {
  const canvas = drawCroppedSquare(img, area);
  return encodeCanvas(canvas, mimeType);
}
