/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./FormIconSubmit.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
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

import { FormIconSubmit } from "./FormIconSubmit";

describe("FormIconSubmit", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("renders a submit button by default with accessible name from label", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save expense" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    expect(button).not.toBeNull();
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.getAttribute("aria-label")).toBe("Save expense");
  });

  it("renders the save glyph by default and switches to the send glyph via variant", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save" />);
    });
    let button = container.querySelector("button") as HTMLButtonElement;
    expect(button.querySelector("svg")).not.toBeNull();
    const saveSvg = button.querySelector("svg")?.outerHTML;

    await act(async () => {
      root.render(<FormIconSubmit label="Send invite" variant="send" />);
    });
    button = container.querySelector("button") as HTMLButtonElement;
    const sendSvg = button.querySelector("svg")?.outerHTML;

    expect(sendSvg).not.toEqual(saveSvg);
  });

  it("forwards disabled and uses the disabled-safe enabled:!text-accent color override", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save" disabled />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    const classList = button.className.split(/\s+/);
    expect(classList).toContain("enabled:!text-accent");
    expect(classList).not.toContain("!text-accent");
  });

  it("applies !w-full and omits the fixed w-[2.5rem] size when fill is set", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save" fill />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const classList = button.className.split(/\s+/);

    expect(classList).toContain("!w-full");
    expect(classList).not.toContain("w-[2.5rem]");
  });

  it("uses the fixed w-[2.5rem] size and omits !w-full when fill is not set", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const classList = button.className.split(/\s+/);

    expect(classList).toContain("w-[2.5rem]");
    expect(classList).not.toContain("!w-full");
  });

  it("uses the explicit title when provided", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save" title="Custom tooltip" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("title")).toBe("Custom tooltip");
  });

  it("falls back to label for title when title is omitted", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save expense" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("title")).toBe("Save expense");
  });

  it("fires onClick when clicked while enabled", async () => {
    const onClick = vi.fn();
    await act(async () => {
      root.render(<FormIconSubmit label="Save" onClick={onClick} />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    await act(async () => {
      root.render(<FormIconSubmit label="Save" onClick={onClick} disabled />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes through a caller-provided className alongside the component's own chrome classes", async () => {
    await act(async () => {
      root.render(<FormIconSubmit label="Save" className="custom-caller-class" />);
    });
    const button = container.querySelector("button") as HTMLButtonElement;
    const classList = button.className.split(/\s+/);

    expect(classList).toContain("custom-caller-class");
    expect(classList).toContain("!bg-surface");
    expect(classList).toContain("border-border");
  });
});
