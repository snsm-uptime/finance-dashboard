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
  useCardIdentification: (
    _sessionId: string,
    statement: { card_id: string | null; iban: string | null } | null,
  ) => ({
    cardMatched: Boolean(statement?.card_id),
    cardId: statement?.card_id ?? undefined,
    cardLabel: statement?.card_id ? "My Visa" : undefined,
    iban: statement?.iban ?? null,
    loading: false,
    error: null,
    needsRegistration: Boolean(statement?.iban && !statement?.card_id),
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

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
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

const unmatchedSession = {
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
};

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

  it("renders a centered Upload control instead of the native file-picker chrome", async () => {
    await act(async () => {
      root.render(<UploadPanel />);
    });

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.className).toContain("sr-only");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.some((b) => b.textContent === "Upload")).toBe(true);
  });

  it("hides the picker and shows New card! registration after a successful upload", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: unmatchedSession,
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    expect(uploadStatement).toHaveBeenCalled();
    expect(container.textContent).toContain("New card!");
    expect(container.textContent).toContain("DE89370400440532013000");
    expect(container.textContent).not.toContain("bac_credit");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "Upload")).toBe(
      false,
    );
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

  it("unmounts the file picker while a session is active", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: unmatchedSession,
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    expect(uploadStatement).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
