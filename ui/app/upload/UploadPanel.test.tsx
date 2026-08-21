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

vi.mock("@/hooks/useCardIdentification", () => ({
  useCardIdentification: () => ({
    cardMatched: false,
    cardId: undefined,
    cardLabel: undefined,
    iban: null,
    loading: false,
    error: null,
    needsRegistration: false,
    registerCard: vi.fn(),
  }),
}));

vi.mock("@/hooks", async () => {
  const React = await import("react");
  return {
    useFormSubmission: (fn: any) => {
      const [error, setError] = React.useState<string | null>(null);
      const [pending, setPending] = React.useState(false);

      const submit = React.useCallback(
        async (arg: any) => {
          setPending(true);
          try {
            const result = await fn(arg);
            if (!result.ok) {
              setError(result.error);
            } else {
              setError(null);
            }
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setPending(false);
          }
        },
        [fn],
      );

      return {
        submit,
        pending,
        error,
      };
    },
  };
});

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

  it("renders upload input", async () => {
    await act(async () => {
      root.render(<UploadPanel />);
    });

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
  });

  it("renders staged statements on a successful upload", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [
          {
            id: "st1",
            product_id: "bac_credit",
            status: "staged",
            candidate_row_count: 3,
            iban: "DE89370400440532013000",
            filename: "statement.pdf",
            card_id: null,
          },
        ],
      },
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    expect(uploadStatement).toHaveBeenCalled();
    expect(container.textContent).toContain("bac_credit");
    expect(container.textContent).toContain("Identify card");
  });

  it("shows the unsupported-file-type error inline on a non-PDF rejection", async () => {
    uploadStatement.mockResolvedValue({ ok: false, error: "Only PDF files are supported." });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Only PDF files are supported.");
  });

  it("blocks a second upload while a session is active", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: {
        id: "s1",
        created_at: "2026-08-18T00:00:00Z",
        discarded_at: null,
        statements: [
          {
            id: "st1",
            product_id: "bac_credit",
            status: "staged",
            candidate_row_count: 3,
            iban: "DE89370400440532013000",
            filename: "statement.pdf",
            card_id: null,
          },
        ],
      },
    });

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
  });
});
