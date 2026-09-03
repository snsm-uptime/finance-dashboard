"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useChromeHeader } from "@/components/ChromeBack";
import { Disclosure } from "@/components/Disclosure";

function titleToId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Reads `window.location.hash` once, after mount — null on the server and on first client render, so no SSR/CSR mismatch. */
function useHashId(): string | null {
  const [hashId, setHashId] = useState<string | null>(null);
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    // Deliberate: reads the browser's hash exactly once, after mount, so the
    // very first client render matches the server (no window) — see useHashId's docstring.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHashId(raw.length > 0 ? raw : null);
  }, []);
  return hashId;
}

/**
 * Chrome Back target. Defaults to "/" (matches server/first-client render,
 * so no hydration mismatch) — reached via the landing page's plain `/docs`
 * link, or a bare/typed visit. `DocsHelpButton` deep-links here with a
 * `?from=<page>` query param instead, so Back returns to the page the user
 * actually came from rather than always bouncing to the landing page.
 */
function useBackHref(): string {
  const [backHref, setBackHref] = useState("/");
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/docs")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time resolve of an external (query-string) source, mirrors useHashId above
      setBackHref(from);
    }
  }, []);
  return backHref;
}

export default function Docs() {
  const hashId = useHashId();
  const backHref = useBackHref();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useChromeHeader({ backHref, title: "Finance Helper" });

  useEffect(() => {
    if (!hashId) return;
    const el = document.getElementById(hashId);
    if (!el || el.tagName !== "H3") return;
    el.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    el.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs highlight to the DOM focus/scroll side effect above
    setHighlightId(hashId);
  }, [hashId]);

  useEffect(() => {
    if (!highlightId) return;
    function clear(event: Event) {
      if (
        event.type === "focusin" &&
        event.target instanceof HTMLElement &&
        event.target.id === highlightId
      ) {
        return;
      }
      setHighlightId(null);
    }
    window.addEventListener("scroll", clear, { capture: true, once: true });
    document.addEventListener("focusin", clear);
    return () => {
      window.removeEventListener("scroll", clear, { capture: true });
      document.removeEventListener("focusin", clear);
    };
  }, [highlightId]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="m-0 text-[1.75rem] font-semibold leading-[1.2]">
        Tutorials &amp; guides
      </h1>
      <p className="mt-2 text-muted leading-[1.5]">
        Quick references for the main things you can do in Finance Helper.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        <DocSection title="Lists" hashId={hashId}>
          <DocEntry
            sectionId="lists"
            title="Creating a list"
            highlightId={highlightId}
          >
            You already have a personal list from signup — create more when
            you want to keep spending separate, like a household list next to
            a trip list. Only the person who created a list can rename or
            delete it; other members can add expenses but can&apos;t remove
            the list itself.
          </DocEntry>
          <DocEntry
            sectionId="lists"
            title="Inviting people to a shared list"
            highlightId={highlightId}
          >
            Invite by email. If the person doesn&apos;t have an account yet,
            the sign-up link in their invite email drops them straight onto
            that list — they don&apos;t land on a generic homepage and have to
            go find it. People can only see a list&apos;s expenses and balance
            once they&apos;ve accepted the invite; there&apos;s no way to
            browse or join a list you weren&apos;t invited to.
          </DocEntry>
          <DocEntry
            sectionId="lists"
            title="Splitting an expense"
            highlightId={highlightId}
          >
            When you add a shared expense, the cost is split evenly across
            the list&apos;s members. If the total doesn&apos;t divide evenly
            — say $10.01 across 3 people — the leftover cent always goes to
            whoever created the list, not whoever paid. It&apos;s a fixed
            rule, not random, so the same split always resolves the same way.
          </DocEntry>
          <DocEntry
            sectionId="lists"
            title="Settling up"
            highlightId={highlightId}
          >
            Shares are computed live from the list&apos;s expenses — nothing
            is ever recorded as &quot;paid&quot; or written to a separate
            payment ledger, so there&apos;s nothing to undo if you settle
            outside the app. Where several members owe each other in a
            circle, the suggested transfers are simplified down to the fewest
            payments that clear everyone&apos;s balance, instead of listing
            every pairwise debt.
          </DocEntry>
        </DocSection>

        <DocSection title="Cards & imports" hashId={hashId}>
          <DocEntry
            sectionId="cards-imports"
            title="Registering a card"
            highlightId={highlightId}
          >
            A card is identified by its IBAN, not its label — the label
            (e.g. &quot;BAC Visa&quot;) is just how it shows up to you. If a
            statement comes from a card you haven&apos;t registered yet,
            review is blocked for that whole statement until you register it
            — there&apos;s no way to import from an unknown card by accident.
          </DocEntry>
          <DocEntry
            sectionId="cards-imports"
            title="Uploading a bank statement"
            highlightId={highlightId}
          >
            Uploading the same statement twice — on purpose or by mistake —
            never creates duplicate expenses; re-imports are detected and
            skipped automatically. You can queue several files at once, and
            if one statement fails to parse it doesn&apos;t hold up the
            others. On a parse failure you get a side-by-side view of the
            extracted rows against the original PDF, so you can see exactly
            what the parser missed instead of guessing.
          </DocEntry>
          <DocEntry
            sectionId="cards-imports"
            title="Reviewing imported transactions"
            highlightId={highlightId}
          >
            Zero-amount rows (declined charges, holds) are filtered out
            automatically — you&apos;ll never see them in review. Each
            transaction commits the moment you assign it, so you can close
            the review screen partway through and pick up later without
            losing what you&apos;ve already done. Undo only works one step
            back and only via the Undo button — on phone, swiping up deletes
            a transaction, so undo is kept as a deliberate tap to avoid
            reversing a commit by accident.
          </DocEntry>
        </DocSection>

        <DocSection title="Budgets" hashId={hashId}>
          <DocEntry
            sectionId="budgets"
            title="Creating a budget"
            highlightId={highlightId}
          >
            A budget isn&apos;t tied to a single list — you can pull spending
            from more than one list into the same budget, for example a
            &quot;Groceries&quot; budget that spans both your personal list
            and a shared household list.
          </DocEntry>
          <DocEntry
            sectionId="budgets"
            title="Attributing transactions to a budget"
            highlightId={highlightId}
          >
            Transactions can land in a budget two ways: you assign one
            manually, or a rule you&apos;ve set up (like &quot;anything from
            this card&quot;) attributes it automatically. Each transaction
            shows a badge saying which one applied, so a rule-matched
            transaction never looks the same as one you picked by hand.
          </DocEntry>
          <DocEntry
            sectionId="budgets"
            title="Reading budget progress"
            highlightId={highlightId}
          >
            The progress bar changes color as you approach and then cross the
            cap — a budget that&apos;s merely close to its limit reads
            differently from one that&apos;s already over, so you can tell
            the two apart at a glance without reading the numbers.
          </DocEntry>
        </DocSection>
      </div>
    </main>
  );
}

function DocSection({
  title,
  hashId,
  children,
}: {
  title: string;
  hashId: string | null;
  children: ReactNode;
}) {
  const id = titleToId(title);
  const isTarget =
    hashId === id || (hashId !== null && hashId.startsWith(`${id}-`));

  return (
    <div id={id}>
      <Disclosure
        key={isTarget ? `${id}-open` : `${id}-closed`}
        defaultOpen={isTarget}
        title={<span className="text-[1.15rem] font-semibold leading-[1.3]">{title}</span>}
      >
        <div className="flex flex-col gap-5">{children}</div>
      </Disclosure>
    </div>
  );
}

function DocEntry({
  sectionId,
  title,
  highlightId,
  children,
}: {
  sectionId: string;
  title: string;
  highlightId: string | null;
  children: ReactNode;
}) {
  const id = `${sectionId}-${titleToId(title)}`;
  const highlighted = highlightId === id;

  return (
    <div
      className={`-ml-3 border-l-4 pl-3 transition-colors duration-300 motion-reduce:transition-none ${
        highlighted ? "border-accent bg-accent/10" : "border-transparent"
      }`}
    >
      <h3
        id={id}
        tabIndex={-1}
        className="m-0 text-[0.95rem] font-semibold leading-[1.3] outline-none"
      >
        {title}
      </h3>
      <p className="mt-1 text-muted leading-[1.5]">{children}</p>
    </div>
  );
}
