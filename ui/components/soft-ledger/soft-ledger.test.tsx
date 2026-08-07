/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BalanceStrip } from "./BalanceStrip";
import { Hint } from "./Hint";
import { PrimaryButton } from "./PrimaryButton";
import { ReceiptRow } from "./ReceiptRow";
import { SectionLabel } from "./SectionLabel";
import { SoftLedgerSelect } from "./Select";
import { TabBar } from "./TabBar";
import { TopNav } from "./TopNav";

const here = dirname(fileURLToPath(import.meta.url));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    "aria-current"?: "page" | undefined;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

function mockCssModules() {
  const handler = {
    get: (_t: object, prop: string | symbol) => String(prop),
  };
  return { default: new Proxy({}, handler) };
}

vi.mock("./BalanceStrip.module.css", mockCssModules);
vi.mock("./Hint.module.css", mockCssModules);
vi.mock("./PrimaryButton.module.css", mockCssModules);
vi.mock("./ReceiptRow.module.css", mockCssModules);
vi.mock("./SectionLabel.module.css", mockCssModules);
vi.mock("./TabBar.module.css", mockCssModules);
vi.mock("./TopNav.module.css", mockCssModules);
vi.mock("./Select.module.css", mockCssModules);

describe("Soft-Ledger primitives", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders TopNav brand left / list title right without Account chrome", () => {
    act(() => {
      root.render(<TopNav brand="finance-helper" listTitle="Household" />);
    });
    expect(host.textContent).toContain("finance-helper");
    expect(host.querySelector("h1")?.textContent).toBe("Household");
    expect(host.querySelector("a")).toBeNull();
  });

  it("renders BalanceStrip who-line + amount with text polarity", () => {
    act(() => {
      root.render(
        <BalanceStrip who="You owe Partner" amount="₡42,500" polarity="owe" />,
      );
    });
    const who = host.querySelector("p");
    expect(who?.textContent).toBe("You owe Partner");
    expect(host.textContent).toContain("₡42,500");
    expect(host.querySelector("[class*='amountOwe'], .amountOwe")).toBeTruthy();
  });

  it("renders Hint and SectionLabel and empty ReceiptRow", () => {
    act(() => {
      root.render(
        <>
          <Hint>Shared expenses will land here.</Hint>
          <SectionLabel>Receipts</SectionLabel>
          <ReceiptRow emptyLabel="No receipts yet." />
        </>,
      );
    });
    expect(host.textContent).toContain("Shared expenses will land here.");
    expect(host.querySelector("h2")?.textContent).toBe("Receipts");
    expect(host.querySelector("[role='status']")?.textContent).toBe(
      "No receipts yet.",
    );
  });

  it("TabBar exposes nav + aria-current on active List tab", () => {
    act(() => {
      root.render(
        <TabBar
          listHref="/lists/abc"
          uploadHref="/upload"
          accountHref="/account"
          listLabel="List"
          uploadLabel="Upload"
          accountLabel="Account"
          ariaLabel="Primary"
          active="list"
        />,
      );
    });
    const nav = host.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Primary");
    const tabCss = readFileSync(join(here, "TabBar.module.css"), "utf8");
    expect(tabCss).toContain(":focus-visible");
    const links = Array.from(host.querySelectorAll("a"));
    expect(links).toHaveLength(3);
    expect(links[0]?.getAttribute("href")).toBe("/lists/abc");
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(links[1]?.getAttribute("href")).toBe("/upload");
    expect(links[1]?.getAttribute("aria-current")).toBeNull();
    expect(links[2]?.getAttribute("href")).toBe("/account");
  });

  it("PrimaryButton mounts and module CSS is not pill", () => {
    act(() => {
      root.render(<PrimaryButton>Continue</PrimaryButton>);
    });
    const button = host.querySelector("button");
    expect(button?.textContent).toBe("Continue");

    const css = readFileSync(join(here, "PrimaryButton.module.css"), "utf8");
    expect(css).toContain("var(--rounded-sm)");
    expect(css).toContain(":focus-visible");
    expect(css).not.toMatch(/border-radius:\s*9999px/);
    expect(css).not.toContain("rounded-full");
  });

  it("SoftLedgerSelect opens a listbox and chooses an option", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SoftLedgerSelect
          value="a"
          options={[
            { value: "a", label: "Alice" },
            { value: "b", label: "Bob" },
          ]}
          onChange={onChange}
          aria-label="Member"
        />,
      );
    });
    const trigger = host.querySelector("button[aria-haspopup='listbox']") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    act(() => {
      trigger.click();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("[role='listbox']")).not.toBeNull();
    const bob = Array.from(host.querySelectorAll("[role='option']")).find(
      (el) => el.textContent === "Bob",
    ) as HTMLElement;
    act(() => {
      bob.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
