/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadPanel } from "./UploadPanel";
import type { ImportSession } from "./uploadClient";

const uploadStatement = vi.fn();
const discardSession = vi.fn();
const fetchImportSession = vi.fn();

vi.mock("./uploadClient", async () => {
  const actual = await vi.importActual<typeof import("./uploadClient")>("./uploadClient");
  return {
    ...actual,
    uploadStatement: (...args: unknown[]) => uploadStatement(...args),
    discardSession: (...args: unknown[]) => discardSession(...args),
    fetchImportSession: (...args: unknown[]) => fetchImportSession(...args),
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

type MockSubmitFn = (data: unknown) => Promise<{ ok: boolean; error?: string }>;

vi.mock("@/hooks", async () => {
  const React = await import("react");
  return {
    useFormSubmission: (fn: MockSubmitFn) => {
      const [error, setError] = React.useState<string | null>(null);
      const [pending, setPending] = React.useState(false);

      const submit = React.useCallback(
        async (arg: unknown) => {
          setPending(true);
          try {
            const result = await fn(arg);
            if (!result.ok) {
              setError(result.error ?? null);
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

vi.mock("./UploadButton.module.scss", () => ({
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

const unmatchedSession: ImportSession = {
  id: "s1",
  created_at: "2026-08-18T00:00:00Z",
  discarded_at: null,
  undo: null,
  finalized_at: null,
  imported_new_count: 0,
  skipped_duplicate_count: 0,
  landing_list_id: null,
  deleted_count: 0,
  zero_amount_excluded_count: 0,
  failed_statements: [],
  committed_by_list: [],
  statements: [
    {
      id: "st1",
      product_id: "bac_credit",
      status: "staged",
      candidate_row_count: 1,
      iban: "DE89370400440532013000",
      filename: "statement.pdf",
      card_id: null,
      rows: [
        {
          id: "r1",
          sequence: 0,
          description: "Store",
          amount: "10.00",
          currency: "CRC",
          posted_date: "2026-07-15",
          status: "pending",
        },
      ],
      zero_amount_excluded_count: 0,
      assigned_rows: [],
    },
  ],
};

describe("UploadPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    uploadStatement.mockReset();
    discardSession.mockReset();
    fetchImportSession.mockReset();
    sessionStorage.clear();
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
    const button = container.querySelector('button[aria-label="Upload"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("");
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
    const nameInput = container.querySelector('input[name="label"]') as HTMLInputElement;
    expect(nameInput?.placeholder).toBe("New card!");
    expect(container.textContent).toContain("IBAN: DE89 3704 0044 0532 0130 00");
    expect(container.textContent).not.toContain("bac_credit");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Upload"]')).toBeNull();
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

  it("fills the UploadButton with a spinner while the upload is in flight", async () => {
    let release!: (value: unknown) => void;
    uploadStatement.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFile(container, fakeFile());

    const busy = container.querySelector('button[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.getAttribute("aria-label")).toBe("Uploading…");
    expect(container.querySelector(".animate-spin")).not.toBeNull();

    await act(async () => {
      release({ ok: true, session: unmatchedSession });
    });
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

  it("hydrates from initialSession without sessionStorage", async () => {
    await act(async () => {
      root.render(<UploadPanel initialSession={unmatchedSession} />);
    });

    expect(fetchImportSession).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).toContain("IBAN: DE89 3704 0044 0532 0130 00");
  });

  it("does not resurrect a stale tab id when the server has no active session", async () => {
    sessionStorage.setItem("finance-helper.open-import-session-id", "s1");

    await act(async () => {
      root.render(<UploadPanel initialSession={null} />);
    });

    expect(fetchImportSession).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(sessionStorage.getItem("finance-helper.open-import-session-id")).toBeNull();
  });
});
