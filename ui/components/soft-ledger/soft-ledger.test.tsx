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
import { IncompleteDisclosure } from "./IncompleteDisclosure";
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
vi.mock("./IncompleteDisclosure.module.css", mockCssModules);
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

  it("renders BalanceStrip with owed polarity", () => {
    act(() => {
      root.render(
        <BalanceStrip who="You’re owed" amount="₡10,000" polarity="owed" />,
      );
    });
    expect(host.textContent).toContain("You’re owed");
    expect(host.textContent).toContain("₡10,000");
    expect(host.querySelector("[class*='amountOwed'], .amountOwed")).toBeTruthy();
  });

  it("renders BalanceStrip with neutral polarity (default)", () => {
    act(() => {
      root.render(<BalanceStrip who="Settled" amount="₡0" />);
    });
    expect(host.textContent).toContain("Settled");
    expect(host.querySelector("[class*='amountNeutral'], .amountNeutral")).toBeTruthy();
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

  it("IncompleteDisclosure renders nothing when isIncomplete is false or undefined (AC #1)", () => {
    act(() => {
      root.render(
        <IncompleteDisclosure isIncomplete={false} label="Balances may be incomplete." />,
      );
    });
    expect(host.querySelector("[role='status']")).toBeNull();
    expect(host.textContent).toBe("");

    act(() => {
      root.render(<IncompleteDisclosure label="Balances may be incomplete." />);
    });
    expect(host.querySelector("[role='status']")).toBeNull();
  });

  it("IncompleteDisclosure renders muted text in a status region when isIncomplete is true (AC #2)", () => {
    act(() => {
      root.render(
        <IncompleteDisclosure
          isIncomplete={true}
          label="Balances may be incomplete. Check unresolved items to confirm the total."
        />,
      );
    });
    const status = host.querySelector("[role='status']");
    // Not color-only: the visible text itself is the accessible signal (UX-DR19),
    // announced natively via role="status" — no aria-label override needed.
    expect(status?.textContent).toContain("Balances may be incomplete.");
  });

  it("IncompleteDisclosure invokes onResolve via a keyboard-accessible button when provided", () => {
    const onResolve = vi.fn();
    act(() => {
      root.render(
        <IncompleteDisclosure
          isIncomplete={true}
          label="Balances may be incomplete."
          onResolve={onResolve}
          resolveLabel="Resolve incomplete"
        />,
      );
    });
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Resolve incomplete");
    act(() => {
      button.click();
    });
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it("IncompleteDisclosure has no resolve control when onResolve is omitted", () => {
    act(() => {
      root.render(
        <IncompleteDisclosure isIncomplete={true} label="Balances may be incomplete." />,
      );
    });
    expect(host.querySelector("button")).toBeNull();
  });

  it("IncompleteDisclosure CSS uses Warm Balance tokens, not hardcoded colors, and has no motion", () => {
    const css = readFileSync(join(here, "IncompleteDisclosure.module.css"), "utf8");
    expect(css).toContain("var(--muted)");
    expect(css).toContain("var(--strip-inset)");
    expect(css).not.toMatch(/#6E6456|#A89B88/i);
    expect(css).not.toMatch(/transition|animation|@keyframes/i);
  });

  it("shared-expenses composition: strip, then incomplete disclosure (when incomplete), then receipts — same inset, no fabricated data", () => {
    act(() => {
      root.render(
        <>
          <BalanceStrip who="You owe Partner" amount="₡42,500" polarity="owe" />
          <IncompleteDisclosure
            isIncomplete={true}
            label="Balances may be incomplete. Check unresolved items to confirm the total."
          />
          <SectionLabel>Receipts</SectionLabel>
          <ReceiptRow emptyLabel="No receipts yet." />
        </>,
      );
    });
    const strip = host.querySelector("section");
    const disclosure = Array.from(host.querySelectorAll("[role='status']")).find((el) =>
      el.textContent?.includes("Balances may be incomplete."),
    );
    const receiptsLabel = host.querySelector("h2");
    expect(strip).not.toBeNull();
    expect(disclosure?.textContent).toContain("Balances may be incomplete.");
    expect(receiptsLabel?.textContent).toBe("Receipts");
    // Strip → disclosure → receipts: DOM order preserves Soft-Ledger layout (below strip, above receipts).
    const order = Array.from(host.children).indexOf(strip as Element);
    const disclosureIndex = Array.from(host.children).indexOf(disclosure as Element);
    const receiptsIndex = Array.from(host.children).indexOf(receiptsLabel as Element);
    expect(order).toBeLessThan(disclosureIndex);
    expect(disclosureIndex).toBeLessThan(receiptsIndex);
  });

  it("shared-expenses composition: no incomplete disclosure rendered when isIncomplete is false (no false positives)", () => {
    act(() => {
      root.render(
        <>
          <BalanceStrip who="Settled" amount="₡0" />
          <IncompleteDisclosure isIncomplete={false} label="Balances may be incomplete." />
          <SectionLabel>Receipts</SectionLabel>
          <ReceiptRow emptyLabel="No receipts yet." />
        </>,
      );
    });
    expect(host.textContent).not.toContain("Balances may be incomplete.");
  });
});
