/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders wrapped children alongside the copy button", async () => {
    await act(async () => {
      root.render(
        <CopyButton value="CR0501520200" label="Copy IBAN" copiedLabel="Copied!">
          •••• 0200
        </CopyButton>,
      );
    });
    expect(container.textContent).toContain("•••• 0200");
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Copy IBAN");
  });

  it("copies the value prop, not the displayed children, and shows the copied tooltip", async () => {
    await act(async () => {
      root.render(
        <CopyButton value="CR0501520200" label="Copy IBAN" copiedLabel="Copied!">
          •••• 0200
        </CopyButton>,
      );
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("CR0501520200");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied!");
    expect(button.getAttribute("aria-label")).toBe("Copied!");
  });

  it("stays silent when the clipboard write fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      root.render(<CopyButton value="x" label="Copy" copiedLabel="Copied!" />);
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Copy");
  });
});
