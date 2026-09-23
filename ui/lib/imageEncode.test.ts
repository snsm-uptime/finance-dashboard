/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeCroppedAvatar, loadImage, type Area } from "@/lib/imageEncode";

function makeImage(): HTMLImageElement {
  return { naturalWidth: 800, naturalHeight: 600 } as HTMLImageElement;
}

describe("encodeCroppedAvatar", () => {
  let drawImageSpy: ReturnType<typeof vi.fn>;
  let toDataURLSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

  beforeEach(() => {
    drawImageSpy = vi.fn();
    toDataURLSpy = vi.fn();

    const ctx = { drawImage: drawImageSpy } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      toDataURLSpy(...args);
      // Small deterministic payload well under the 200KB cap.
      return "data:image/jpeg;base64,AAAA";
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the exact caller-supplied source rectangle onto the 256x256 canvas", async () => {
    const img = makeImage();
    const area: Area = { x: 12, y: 34, width: 200, height: 200 };

    await encodeCroppedAvatar(img, area, "image/jpeg");

    expect(drawImageSpy).toHaveBeenCalledWith(img, area.x, area.y, area.width, area.height, 0, 0, 256, 256);
  });

  it("returns a JPEG data URI for a jpeg mime type", async () => {
    const img = makeImage();
    const area: Area = { x: 0, y: 0, width: 100, height: 100 };

    const result = await encodeCroppedAvatar(img, area, "image/jpeg");

    expect(result).toBe("data:image/jpeg;base64,AAAA");
    expect(toDataURLSpy).toHaveBeenCalledWith("image/jpeg", 0.9);
  });

  it("keeps PNG when the encoded size clears the cap", async () => {
    const img = makeImage();
    const area: Area = { x: 0, y: 0, width: 100, height: 100 };

    toDataURLSpy.mockClear();
    await encodeCroppedAvatar(img, area, "image/png");

    expect(toDataURLSpy.mock.calls[0][0]).toBe("image/png");
  });

  it("steps JPEG quality down from 0.9 toward 0.4 until under the 200KB cap", async () => {
    const img = makeImage();
    const area: Area = { x: 0, y: 0, width: 100, height: 100 };

    // Every attempt returns an oversized payload until quality reaches 0.4.
    const oversized = `data:image/jpeg;base64,${"A".repeat(300_000)}`;
    const small = "data:image/jpeg;base64,AAAA";
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      toDataURLSpy(...args);
      const quality = args[1] as number | undefined;
      return quality !== undefined && quality <= 0.4 ? small : oversized;
    });

    const result = await encodeCroppedAvatar(img, area, "image/jpeg");

    expect(result).toBe(small);
    const qualities = toDataURLSpy.mock.calls.map((call) => call[1] as number);
    expect(qualities[0]).toBeCloseTo(0.9, 5);
    for (let i = 1; i < qualities.length; i++) {
      expect(qualities[i]).toBeLessThan(qualities[i - 1]);
    }
    expect(qualities[qualities.length - 1]).toBeLessThanOrEqual(0.41);
  });

  it("falls back to JPEG for an oversized PNG", async () => {
    const img = makeImage();
    const area: Area = { x: 0, y: 0, width: 100, height: 100 };

    const oversizedPng = `data:image/png;base64,${"A".repeat(300_000)}`;
    const smallJpeg = "data:image/jpeg;base64,AAAA";
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      toDataURLSpy(...args);
      const [mimeType] = args as [string, number?];
      return mimeType === "image/png" ? oversizedPng : smallJpeg;
    });

    const result = await encodeCroppedAvatar(img, area, "image/png");

    expect(result).toBe(smallJpeg);
    expect(toDataURLSpy.mock.calls[0][0]).toBe("image/png");
    expect(toDataURLSpy).toHaveBeenCalledWith("image/jpeg", 0.9);
  });
});

describe("loadImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves an HTMLImageElement once the underlying image loads", async () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // jsdom never actually fetches a fake blob URL, so `load`/`error` events
    // never fire on their own — fire `onload` manually once `src` is set.
    const fakeImg = document.createElement("img");
    Object.defineProperty(fakeImg, "src", {
      set(_value: string) {
        queueMicrotask(() => fakeImg.onload?.(new Event("load") as unknown as globalThis.Event));
      },
    });
    vi.stubGlobal(
      "Image",
      function () {
        return fakeImg;
      },
    );

    const file = new File(["fake"], "photo.png", { type: "image/png" });
    const result = await loadImage(file);

    expect(result).toBe(fakeImg);
    expect(createObjectURLSpy).toHaveBeenCalledWith(file);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("rejects when the image fails to load", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const fakeImg = document.createElement("img");
    Object.defineProperty(fakeImg, "src", {
      set(_value: string) {
        queueMicrotask(() => fakeImg.onerror?.(new Event("error") as unknown as string | globalThis.Event));
      },
    });
    vi.stubGlobal(
      "Image",
      function () {
        return fakeImg;
      },
    );

    const file = new File(["fake"], "photo.png", { type: "image/png" });

    await expect(loadImage(file)).rejects.toThrow("Could not read image file.");
  });
});
