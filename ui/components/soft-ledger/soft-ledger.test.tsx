/**
 * @vitest-environment jsdom
 */
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
import { SoftLedgerRadio } from "./Radio";
import { SoftLedgerSelect } from "./Select";
import { TabBar } from "./TabBar";
import { TopNav } from "./TopNav";

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

vi.mock("@/components/IconButton/IconButton.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_target, key) => (typeof key === "string" ? key : "mod"),
    },
  ),
}));

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
    const section = host.querySelector("section");
    expect(section).not.toBeNull();
    const paragraphs = host.querySelectorAll("p");
    expect(paragraphs[0]?.textContent).toBe("You owe Partner");
    expect(host.textContent).toContain("₡42,500");
    expect(section?.getAttribute("aria-label")).toBe("You owe Partner");
  });

  it("renders BalanceStrip with owed polarity", () => {
    act(() => {
      root.render(
        <BalanceStrip who="You’re owed" amount="₡10,000" polarity="owed" />,
      );
    });
    const section = host.querySelector("section");
    expect(section).not.toBeNull();
    expect(host.textContent).toContain("You’re owed");
    expect(host.textContent).toContain("₡10,000");
    expect(section?.getAttribute("aria-label")).toBe("You’re owed");
  });

  it("renders BalanceStrip with neutral polarity (default)", () => {
    act(() => {
      root.render(<BalanceStrip who="Settled" amount="₡0" />);
    });
    const section = host.querySelector("section");
    expect(section).not.toBeNull();
    expect(host.textContent).toContain("Settled");
    expect(section?.getAttribute("aria-label")).toBe("Settled");
  });

  it("renders an optional action in the strip's trailing column", () => {
    act(() => {
      root.render(
        <BalanceStrip
          who="You owe Partner"
          amount="₡42,500"
          polarity="owe"
          action={<button type="button">Add expense</button>}
        />,
      );
    });
    const section = host.querySelector("section");
    const action = host.querySelector("button");
    expect(section).not.toBeNull();
    expect(action?.textContent).toBe("Add expense");
    expect(section?.contains(action)).toBe(true);
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

  it("renders title and total on the first row, origin with payer meta, and a lent label over net", () => {
    act(() => {
      root.render(
        <ReceiptRow
          title="1000 colones"
          payerAlias="sebas"
          when="2026-08-19"
          amount="₡1,000"
          originChip="Cash"
          directionLabel="you lent"
          netLabel="₡900"
          netPolarity="owed"
          menu={{ menuAria: "Expense options", editLabel: "Edit", deleteLabel: "Delete" }}
        />,
      );
    });
    expect(host.querySelector('[data-slot="type-icon"]')).not.toBeNull();
    expect(host.textContent).toContain("1000 colones");
    expect(host.textContent).toContain("@sebas");
    expect(host.textContent).toContain("2026-08-19");
    expect(host.textContent).toContain("Cash");
    expect(host.textContent).toContain("you lent");
    expect(host.textContent).toContain("₡1,000");
    expect(host.textContent).toContain("₡900");
    const titleEl = Array.from(host.querySelectorAll("span")).find(
      (el) => el.textContent === "1000 colones",
    );
    const totalEl = Array.from(host.querySelectorAll("span")).find(
      (el) => el.textContent === "₡1,000",
    );
    expect(titleEl?.parentElement).toBe(totalEl?.parentElement);
    expect(totalEl?.previousElementSibling).toBe(titleEl ?? null);
    const dateEl = Array.from(host.querySelectorAll("span")).find(
      (el) => el.textContent === "2026-08-19",
    );
    const originEl = dateEl?.nextElementSibling as HTMLElement | null;
    expect(originEl?.textContent).toContain("Cash");
    expect(originEl?.textContent).toContain("@sebas");
    const handle = originEl?.querySelector(".text-accent");
    expect(handle?.textContent).toContain("@sebas");
    expect(handle?.className).toContain("text-accent");
    const direction = Array.from(host.querySelectorAll("span")).find(
      (el) => el.textContent === "you lent",
    );
    expect(direction?.className).toContain("text-owed");
    const net = Array.from(host.querySelectorAll("span")).find((el) => el.textContent === "₡900");
    expect(net?.className).toContain("text-owed");
    const trigger = host.querySelector("button[aria-haspopup='menu']") as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    act(() => {
      trigger.click();
    });
    expect(host.textContent).toContain("Edit");
    expect(host.textContent).toContain("Delete");
  });

  it("hides direction, net, and payer alias when those props are omitted", () => {
    act(() => {
      root.render(<ReceiptRow title="Coffee" when="2026-08-19" amount="₡10" />);
    });
    expect(host.textContent).toContain("Coffee");
    expect(host.textContent).toContain("₡10");
    expect(host.textContent).not.toContain("you borrowed");
    expect(host.textContent).not.toContain("you lent");
    expect(host.textContent).not.toContain("@");
  });

  it("renders Unknown origin on the meta row for another member's blank origin", () => {
    act(() => {
      root.render(
        <ReceiptRow
          title="grill out"
          payerAlias="dotmail"
          when="2026-08-19"
          amount="₡10,000"
          originChip="Unknown"
          originDisabled
          directionLabel="you borrowed"
          netLabel="₡5,000"
          netPolarity="owe"
        />,
      );
    });
    expect(host.textContent).toContain("grill out");
    expect(host.textContent).toContain("Unknown");
    expect(host.textContent).toContain("@dotmail");
    expect(host.textContent).toContain("you borrowed");
    expect(host.querySelector("button[aria-expanded]")).toBeNull();
    const chip = Array.from(host.querySelectorAll("span")).find((el) =>
      el.getAttribute("aria-disabled") === "true",
    );
    expect(chip?.className).toContain("opacity-55");
    const originLabel = Array.from(chip?.querySelectorAll("span") ?? []).find(
      (el) => el.textContent === "Unknown",
    );
    expect(originLabel?.className).toContain("text-muted");
    const handle = chip?.querySelector(".text-accent");
    expect(handle?.textContent).toContain("@dotmail");
    const direction = Array.from(host.querySelectorAll("span")).find(
      (el) => el.textContent === "you borrowed",
    );
    expect(direction?.className).toContain("text-owe");
  });

  it("renders a disabled non-payer Cash chip that is not a toggle", () => {
    act(() => {
      root.render(
        <ReceiptRow
          title="Coffee"
          payerAlias="dotmail"
          when="2026-08-19"
          amount="₡10"
          originChip="Cash"
          originDisabled
        />,
      );
    });
    expect(host.querySelector("button[aria-expanded]")).toBeNull();
    const chip = Array.from(host.querySelectorAll("span")).find(
      (el) => el.getAttribute("aria-disabled") === "true",
    );
    expect(chip?.className).toContain("opacity-55");
    expect(chip?.className).not.toContain("cursor-pointer");
    const originLabel = Array.from(chip?.querySelectorAll("span") ?? []).find(
      (el) => el.textContent === "Cash",
    );
    expect(originLabel?.className).toContain("text-muted");
    expect(chip?.querySelector(".text-accent")?.textContent).toContain("@dotmail");
  });

  it("renders a warning No Origin chip and a below-row origin panel slot", () => {
    act(() => {
      root.render(
        <ReceiptRow
          title="Coffee"
          when="2026-08-19"
          amount="₡10"
          originChip="No Origin"
          originChipTone="warning"
          originPanel={<div data-slot="origin-panel">panel</div>}
        />,
      );
    });
    const chip = Array.from(host.querySelectorAll("span")).find((el) =>
      el.className.includes("text-owe"),
    );
    expect(chip?.textContent).toContain("No Origin");
    expect(chip?.className).toContain("border-owe");
    expect(host.querySelector('[data-slot="origin-panel"]')?.textContent).toBe("panel");
  });

  it("renders originAction instead of the display chip", () => {
    act(() => {
      root.render(
        <ReceiptRow
          title="Coffee"
          when="2026-08-19"
          amount="₡10"
          originChip="Cash"
          originAction={<button type="button">No Origin</button>}
        />,
      );
    });
    expect(host.querySelector("button")?.textContent).toBe("No Origin");
    expect(host.textContent).not.toContain("Cash");
  });

  it("TabBar exposes icon links + aria-current on active Home tab", () => {
    act(() => {
      root.render(
        <TabBar
          homeHref="/home"
          uploadHref="/upload"
          accountHref="/account"
          homeLabel="Home"
          uploadLabel="Upload"
          accountLabel="Account"
          ariaLabel="Primary"
          active="home"
        />,
      );
    });
    const nav = host.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Primary");
    expect(nav?.className).toContain("justify-evenly");
    const links = Array.from(host.querySelectorAll("a"));
    expect(links).toHaveLength(3);
    expect(links[0]?.getAttribute("href")).toBe("/home");
    expect(links[0]?.getAttribute("aria-label")).toBe("Home");
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(links[0]?.className).toEqual(links[1]?.className);
    expect(links[0]?.className).not.toContain("text-accent");
    expect(links[1]?.getAttribute("href")).toBe("/upload");
    expect(links[1]?.getAttribute("aria-label")).toBe("Upload");
    expect(links[1]?.getAttribute("aria-current")).toBeNull();
    expect(links[2]?.getAttribute("href")).toBe("/account");
    expect(links[2]?.getAttribute("aria-label")).toBe("Account");
    expect(links[0]?.querySelector("svg")).not.toBeNull();
    expect(links[1]?.querySelector("svg")).not.toBeNull();
    expect(links[2]?.querySelector("svg")).not.toBeNull();
  });

  it("PrimaryButton mounts and uses rounded-sm (not pill)", () => {
    act(() => {
      root.render(<PrimaryButton>Continue</PrimaryButton>);
    });
    const button = host.querySelector("button");
    expect(button?.textContent).toBe("Continue");
    expect(button?.className).toContain("rounded-sm");
    expect(button?.className).not.toContain("rounded-full");
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

  it("SoftLedgerRadio renders radio and checkbox with background outline fill", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <SoftLedgerRadio name="mode" checked={false} onChange={onChange}>
          Even
        </SoftLedgerRadio>,
      );
    });
    const input = host.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(host.textContent).toContain("Even");
    act(() => {
      input.click();
    });
    expect(onChange).toHaveBeenCalled();

    act(() => {
      root.render(
        <SoftLedgerRadio type="checkbox" checked onChange={() => {}}>
          Agree
        </SoftLedgerRadio>,
      );
    });
    expect(host.querySelector('input[type="checkbox"]')).not.toBeNull();

    const mark = host.querySelector("span[aria-hidden='true']");
    expect(mark?.className).toContain("border-accent");
    expect(mark?.className).toContain("peer-checked:bg-accent");
  });
});
