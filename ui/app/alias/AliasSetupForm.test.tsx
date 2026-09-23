/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aliasMessages } from "@/lib/i18n/alias";

import { AliasSetupForm } from "./AliasSetupForm";

vi.mock("../signup/signup.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

const setAlias = vi.fn();
vi.mock("./aliasClient", async () => {
  const actual = await vi.importActual<typeof import("./aliasClient")>("./aliasClient");
  return {
    ...actual,
    setAlias: (...args: unknown[]) => setAlias(...args),
  };
});

// react-easy-crop needs ResizeObserver/canvas APIs jsdom doesn't provide —
// stub it with a minimal component that reports a crop area once per mount.
vi.mock("react-easy-crop", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  function MockCropper({
    onCropComplete,
  }: {
    onCropComplete?: (area: unknown, areaPixels: unknown) => void;
  }) {
    React.useEffect(() => {
      onCropComplete?.(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 },
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  return { default: MockCropper };
});

const messages = aliasMessages.en;

describe("AliasSetupForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setAlias.mockReset();
    replace.mockReset();
    refresh.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Stubs the canvas + Image APIs the crop/encode pipeline needs, which jsdom doesn't implement. */
  function stubImageEncodePipeline() {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,AAAA",
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const fakeImg = document.createElement("img");
    Object.defineProperty(fakeImg, "src", {
      set(_value: string) {
        queueMicrotask(() => fakeImg.onload?.(new Event("load")));
      },
    });
    vi.stubGlobal(
      "Image",
      function () {
        return fakeImg;
      },
    );
  }

  async function render(continueHref = "/lists") {
    await act(async () => {
      root.render(<AliasSetupForm messages={messages} continueHref={continueHref} />);
    });
  }

  async function type(value: string) {
    const input = container.querySelector('input[name="alias"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit() {
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
  }

  it("shows the alias field with the format hint and no email field", async () => {
    await render();
    expect(container.querySelector('input[name="alias"]')).not.toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent).toContain(messages.hint);
  });

  it("continues to the return destination after a successful claim", async () => {
    setAlias.mockResolvedValue({ ok: true, alias: "alice" });
    await render("/lists/list-1");
    await type("Alice");
    await submit();

    expect(setAlias).toHaveBeenCalledWith("alice", messages);
    expect(replace).toHaveBeenCalledWith("/lists/list-1");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the user on setup and shows the error when the alias is taken", async () => {
    setAlias.mockResolvedValue({ ok: false, error: messages.errorTaken });
    await render();
    await type("alice");
    await submit();

    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain(messages.errorTaken);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("shows the format error for an invalid alias", async () => {
    setAlias.mockResolvedValue({ ok: false, error: messages.errorInvalid });
    await render();
    await type("ab");
    await submit();

    expect(container.textContent).toContain(messages.errorInvalid);
  });

  it("picking a photo opens the crop sheet, and confirming sets photoBase64 state", async () => {
    stubImageEncodePipeline();
    await render();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(["fake"], "photo.png", { type: "image/png" });
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    const saveButton = document.querySelector(
      '[role="dialog"] button[aria-label="Save photo"]',
    ) as HTMLButtonElement;
    expect(saveButton).toBeTruthy();
    expect(saveButton.disabled).toBe(false);

    await act(async () => {
      saveButton.click();
    });

    // photoBase64 state is set once encode resolves — the "remove photo"
    // control only renders when photoBase64 is non-null (see the ternary in
    // the JSX). The Sheet itself takes CLOSE_ANIMATION_MS to unmount, so
    // assert on the state effect rather than immediate DOM removal.
    const start = Date.now();
    while (!container.textContent?.includes(messages.photoRemove) && Date.now() - start < 2000) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    expect(container.textContent).toContain(messages.photoRemove);
  });
});
