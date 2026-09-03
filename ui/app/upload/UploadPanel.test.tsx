/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/upload",
}));

import { AppShell } from "@/components/AppShell";
import { UploadPanel } from "./UploadPanel";
import type { ImportSession } from "./uploadClient";
import { readUploadQueue, resetUploadQueue, writeUploadQueue } from "./uploadQueueStore";

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

function fakeFile(name = "statement.pdf", contents = "%PDF-1.4"): File {
  return new File([contents], name, { type: "application/pdf", lastModified: 1 });
}

function fakeFileList(...files: File[]): FileList {
  const list: Record<number, File> & { length: number; item: (i: number) => File | null } = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
  };
  files.forEach((file, index) => {
    list[index] = file;
  });
  return list as unknown as FileList;
}

async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 4000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await tick();
  }
}

async function selectFiles(container: HTMLElement, ...files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: fakeFileList(...files), configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(
    () =>
      files.some((file) => container.textContent?.includes(file.name)) ||
      uploadStatement.mock.calls.length > 0,
    "queued files",
  );
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

function sessionFor(id: string, filename: string): ImportSession {
  return {
    ...unmatchedSession,
    id,
    statements: unmatchedSession.statements.map((statement) => ({ ...statement, filename })),
  };
}

describe("UploadPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    uploadStatement.mockReset();
    discardSession.mockReset();
    fetchImportSession.mockReset();
    resetUploadQueue();
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
    expect(input?.hasAttribute("multiple")).toBe(true);
    const button = container.querySelector('button[aria-label="Upload"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("");
  });

  it("keeps the file picker after a successful upload and shows a resume row", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: unmatchedSession,
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile());
    await waitFor(
      () => Boolean(container.querySelector('a[href="/upload/session/s1"]')),
      "resume row",
    );

    expect(uploadStatement).toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Upload"]')).not.toBeNull();
    expect(container.querySelector('a[href="/upload/session/s1"]')?.textContent).toBe(
      "statement.pdf",
    );
    expect(container.querySelector('a[href="/upload/session/s1"]')?.getAttribute("aria-label")).toBe(
      "Resume review: statement.pdf",
    );
  });

  it("shows the unsupported-file-type error inline on a non-PDF rejection", async () => {
    uploadStatement.mockResolvedValue({ ok: false, error: "Only PDF files are supported." });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile());
    await waitFor(
      () => container.querySelector('[role="alert"]') !== null,
      "inline error",
    );

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
    await selectFiles(container, fakeFile());
    await waitFor(
      () => container.querySelector('button[aria-busy="true"]') !== null,
      "busy upload button",
    );

    const busy = container.querySelector('button[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.hasAttribute("disabled")).toBe(false);
    expect(busy?.getAttribute("aria-label")).toBe("Uploading…");
    expect(container.querySelector(".animate-spin")).not.toBeNull();

    const row = [...container.querySelectorAll("li")].find((item) =>
      item.textContent?.includes("statement.pdf"),
    );
    expect(row).toBeDefined();
    expect(row?.querySelector(".animate-spin")).not.toBeNull();
    expect(row?.querySelector('button[aria-label="Remove"]')).toBeNull();
    expect(row?.textContent).not.toContain("Uploading…");

    await act(async () => {
      release({ ok: true, session: unmatchedSession });
    });
  });

  it("keeps the file picker while a session is staged", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: unmatchedSession,
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile());
    await waitFor(
      () => Boolean(container.querySelector('a[href="/upload/session/s1"]')),
      "staged resume link",
    );

    expect(uploadStatement).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("restores remaining staged files after leaving review", async () => {
    writeUploadQueue([
      {
        id: "s2",
        state: "staged",
        displayName: "next.pdf",
        session: sessionFor("s2", "next.pdf"),
      },
    ]);
    await act(async () => {
      root.render(<UploadPanel />);
    });
    expect(container.textContent).toContain("next.pdf");
    expect(container.querySelector('a[href="/upload/session/s2"]')).not.toBeNull();
  });

  it("hydrates from initialSession without hiding the input", async () => {
    await act(async () => {
      root.render(<UploadPanel initialSession={unmatchedSession} />);
    });

    expect(fetchImportSession).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector('a[href="/upload/session/s1"]')).not.toBeNull();
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

  it("queues a pending row per selected file before upload", async () => {
    let releaseFirst!: (value: unknown) => void;
    uploadStatement.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve;
        }),
    );

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile("a.pdf", "%PDF-a"), fakeFile("b.pdf", "%PDF-b"));

    expect(container.textContent).toContain("a.pdf");
    expect(container.textContent).toContain("b.pdf");
    expect(uploadStatement).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirst({ ok: true, session: sessionFor("sa", "a.pdf") });
    });
  });

  it("removes a pending entry without calling uploadStatement for that file", async () => {
    let release!: (value: unknown) => void;
    uploadStatement.mockImplementation(
      (file: File) =>
        new Promise((resolve) => {
          if (file.name === "first.pdf") {
            release = resolve;
            return;
          }
          resolve({ ok: true, session: sessionFor("second", file.name) });
        }),
    );

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(
      container,
      fakeFile("first.pdf", "%PDF-first"),
      fakeFile("second.pdf", "%PDF-second"),
    );

    expect(container.textContent).toContain("second.pdf");
    const remove = container.querySelector('button[aria-label="Remove"]') as HTMLButtonElement;
    expect(remove).not.toBeNull();
    await act(async () => {
      remove.click();
    });
    expect(container.textContent).not.toContain("second.pdf");

    await act(async () => {
      release({ ok: true, session: sessionFor("first", "first.pdf") });
    });
    expect(uploadStatement.mock.calls.map((call) => (call[0] as File).name)).toEqual(["first.pdf"]);
  });

  it("uploads only one of two identical files in a single selection", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: unmatchedSession,
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    const bytes = "%PDF-same-bytes";
    await selectFiles(container, fakeFile("one.pdf", bytes), fakeFile("two.pdf", bytes));
    await waitFor(
      () => Boolean(container.querySelector('[aria-label="Already added."]')),
      "duplicate copy",
    );

    expect(uploadStatement).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("two.pdf");
    expect(container.querySelector('[aria-label="Already added."]')).not.toBeNull();
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe("Already added.");
    expect(container.querySelector('[role="alert"]')?.textContent).not.toBe("Already added.");
  });

  it("shows a duplicate server hit as an error icon and drops it from the stored queue", async () => {
    uploadStatement
      .mockResolvedValueOnce({
        ok: false,
        error: "This statement has already been uploaded.",
      })
      .mockResolvedValueOnce({ ok: true, session: sessionFor("sb", "b.pdf") });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile("a.pdf", "%PDF-a"), fakeFile("b.pdf", "%PDF-b"));
    await waitFor(
      () =>
        Boolean(
          container.querySelector('[aria-label="This statement has already been uploaded."]'),
        ) && Boolean(container.querySelector('a[href="/upload/session/sb"]')),
      "duplicate error icon and remaining staged file",
    );

    expect(container.textContent).toContain("a.pdf");
    expect(
      container.querySelector('[aria-label="This statement has already been uploaded."]'),
    ).not.toBeNull();
    expect(container.querySelector('[role="tooltip"]')?.textContent).toBe(
      "This statement has already been uploaded.",
    );
    expect(readUploadQueue().some((entry) => entry.state === "duplicate")).toBe(false);
    expect(readUploadQueue().some((entry) => entry.displayName === "a.pdf")).toBe(false);

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<UploadPanel />);
    });
    expect(container.textContent).not.toContain("a.pdf");
    expect(container.querySelector('a[href="/upload/session/sb"]')).not.toBeNull();
  });

  it("uploads queued files sequentially in selection order", async () => {
    const order: string[] = [];
    const releases: Array<(value: unknown) => void> = [];
    uploadStatement.mockImplementation(
      (file: File) =>
        new Promise((resolve) => {
          order.push(file.name);
          releases.push(resolve);
        }),
    );

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile("a.pdf", "%PDF-a"), fakeFile("b.pdf", "%PDF-b"));

    expect(order).toEqual(["a.pdf"]);
    expect(releases).toHaveLength(1);

    await act(async () => {
      releases[0]({ ok: true, session: sessionFor("sa", "a.pdf") });
    });
    await waitFor(() => order.length === 2, "second upload");
    expect(order).toEqual(["a.pdf", "b.pdf"]);

    await act(async () => {
      releases[1]({ ok: true, session: sessionFor("sb", "b.pdf") });
    });
  });

  it("continues the remaining queue when one upload is rejected", async () => {
    uploadStatement
      .mockResolvedValueOnce({ ok: false, error: "Could not read this PDF." })
      .mockResolvedValueOnce({ ok: true, session: sessionFor("sb", "b.pdf") });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile("a.pdf", "%PDF-a"), fakeFile("b.pdf", "%PDF-b"));
    await waitFor(() => uploadStatement.mock.calls.length === 2, "both uploads");
    await waitFor(
      () => Boolean(container.textContent?.includes("Could not read this PDF.")),
      "failed row copy",
    );

    expect(uploadStatement).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Could not read this PDF.");
    expect(container.querySelector('a[href="/upload/session/sb"]')).not.toBeNull();
  });

  it("snapshots selected files before resetting the live FileList", async () => {
    uploadStatement.mockResolvedValue({
      ok: true,
      session: unmatchedSession,
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fakeFile();
    let items: File[] = [file];
    const list: Record<number, File | undefined> & {
      length: number;
      item: (i: number) => File | null;
    } = {
      get 0() {
        return items[0];
      },
      get length() {
        return items.length;
      },
      item: (i: number) => items[i] ?? null,
    };
    Object.defineProperty(input, "files", { get: () => list, configurable: true });
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => (items.length > 0 ? "C:\\fakepath\\statement.pdf" : ""),
      set: () => {
        items = [];
      },
    });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(
      () => Boolean(container.querySelector('a[href="/upload/session/s1"]')),
      "upload after live FileList reset",
    );
    expect(uploadStatement).toHaveBeenCalledTimes(1);
  });

  it("discards a staged row via discardSession with that session id", async () => {
    discardSession.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(<UploadPanel initialSession={unmatchedSession} />);
    });

    const close = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    expect(close).not.toBeUndefined();
    await act(async () => {
      close?.click();
    });

    expect(discardSession).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ errorDuplicateStatement: expect.any(String) }),
    );
    expect(container.querySelector('a[href="/upload/session/s1"]')).toBeNull();
  });

  it("does not resurrect a discarded session from stale initialSession after remount", async () => {
    discardSession.mockResolvedValue({ ok: true });

    await act(async () => {
      root.render(<UploadPanel initialSession={unmatchedSession} />);
    });
    const close = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      close.click();
    });
    expect(container.querySelector('a[href="/upload/session/s1"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<UploadPanel initialSession={unmatchedSession} />);
    });

    expect(container.querySelector('a[href="/upload/session/s1"]')).toBeNull();
    expect(container.textContent).not.toContain("statement.pdf");
  });

  it("shows a discard error on the staged resume row", async () => {
    discardSession.mockResolvedValue({ ok: false, error: "Something went wrong. Try again." });

    await act(async () => {
      root.render(<UploadPanel initialSession={unmatchedSession} />);
    });

    const close = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    await act(async () => {
      close.click();
    });

    expect(container.querySelector('a[href="/upload/session/s1"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("lets the user dismiss a failed row", async () => {
    uploadStatement.mockResolvedValue({ ok: false, error: "Could not read this PDF." });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile("bad.pdf", "%PDF-bad"));
    await waitFor(
      () => Boolean(container.textContent?.includes("Could not read this PDF.")),
      "failed row",
    );

    const remove = container.querySelector('button[aria-label="Remove"]') as HTMLButtonElement;
    expect(remove).not.toBeNull();
    await act(async () => {
      remove.click();
    });
    expect(container.textContent).not.toContain("bad.pdf");
  });

  it("links a server duplicate to the blocking session", async () => {
    uploadStatement.mockResolvedValue({
      ok: false,
      error: "This statement has already been uploaded.",
      duplicateSessionId: "existing-session",
    });

    await act(async () => {
      root.render(<UploadPanel />);
    });
    await selectFiles(container, fakeFile("dup.pdf", "%PDF-dup"));
    await waitFor(
      () => Boolean(container.querySelector('a[href="/upload/session/existing-session"]')),
      "duplicate resume link",
    );

    expect(container.querySelector('a[href="/upload/session/existing-session"]')?.textContent).toBe(
      "dup.pdf",
    );
    expect(
      container.querySelector('[aria-label="This statement has already been uploaded."]'),
    ).not.toBeNull();
  });

  it("finishes an in-flight upload into the store after leaving the page", async () => {
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
    await selectFiles(container, fakeFile("leave.pdf", "%PDF-leave"));
    await waitFor(() => uploadStatement.mock.calls.length === 1, "upload started");

    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      release({ ok: true, session: sessionFor("left", "leave.pdf") });
    });
    await tick();

    expect(readUploadQueue().some((entry) => entry.session?.id === "left")).toBe(true);

    root = createRoot(container);
  });

  it("renders a help icon that navigates to /docs#cards-imports", async () => {
    await act(async () => {
      root.render(
        <AppShell>
          <UploadPanel />
        </AppShell>,
      );
    });

    const helpButton = container.querySelector(
      'button[aria-label="Learn more about Upload"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();

    await act(async () => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fupload#cards-imports");
  });
});
