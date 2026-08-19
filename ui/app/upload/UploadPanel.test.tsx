/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadPanel } from "./UploadPanel";

const uploadStatement = vi.fn();
const discardSession = vi.fn();

vi.mock("./uploadClient", async () => {
  const actual = await vi.importActual<typeof import("./uploadClient")>("./uploadClient");
  return {
    ...actual,
    uploadStatement: (...args: unknown[]) => uploadStatement(...args),
    discardSession: (...args: unknown[]) => discardSession(...args),
  };
});

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en", theme: "light" }),
}));

function fakeFile(): File {
  return new File(["%PDF-1.4"], "statement.pdf", { type: "application/pdf" });
}

function fakeFileList(file: File): FileList {
  const list: Record<number, File> & { length: number; item: (i: number) => File | null } = {
    0: file,
    length: 1,
    item: (i: number) => (i === 0 ? file : null),
  };
  return list as unknown as FileList;
}

async function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: fakeFileList(file), configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("UploadPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    uploadStatement.mockReset();
    discardSession.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders staged and failed statements on a successful upload", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 3 },
          { id: "st2", product_id: "bac_credit", status: "failed", candidate_row_count: 0 },
        ],
      },
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    expect(uploadStatement).toHaveBeenCalled();
    expect(container.textContent).toContain("Staged");
    expect(container.textContent).toContain("Could not parse this statement");
  });

  it("shows the unsupported-file-type error inline on a non-PDF rejection", async () => {
    uploadStatement.mockResolvedValue({ ok: false, error: "Only PDF files are supported." });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Only PDF files are supported.");
  });

  it("discard clears the session view and shows a confirmation", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 3 },
        ],
      },
    });
    discardSession.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    const discardButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Discard",
    ) as HTMLButtonElement;
    await act(async () => {
      discardButton.click();
    });

    expect(discardSession).toHaveBeenCalledWith("s1", expect.anything());
    expect(container.querySelector("ul")).toBeNull();
    expect(container.textContent).toContain("Discarded.");
  });

  it("blocks a second upload while a session is active, until discarded", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [
          { id: "st1", product_id: "bac_credit", status: "staged", candidate_row_count: 3 },
        ],
      },
    });
    discardSession.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    expect(uploadStatement).toHaveBeenCalledTimes(1);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(container.textContent).toContain("Discard this session before uploading another");

    await selectFile(container, fakeFile());
    expect(uploadStatement).toHaveBeenCalledTimes(1);

    const discardButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Discard",
    ) as HTMLButtonElement;
    await act(async () => {
      discardButton.click();
    });

    expect(input.disabled).toBe(false);
    await selectFile(container, fakeFile());
    expect(uploadStatement).toHaveBeenCalledTimes(2);
  });
});
