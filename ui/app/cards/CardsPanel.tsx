"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { cardsCopy } from "@/lib/i18n/cards";
import { fetchLists, type ListItem } from "../lists/listsClient";
import { fetchCards, type CardItem, type CardsClientMessages } from "./cardsClient";
import { CardRoutingControl } from "./CardRoutingControl";
import { DefaultImportListControl } from "./DefaultImportListControl";
import { RegisterCardForm } from "./RegisterCardForm";

function maskIban(iban: string): string {
  return `•••• ${iban.slice(-4)}`;
}

type Props = {
  /** Skips the standalone page chrome (main/header/title) for use inside another page's layout, e.g. Home. */
  embedded?: boolean;
};

export function CardsPanel({ embedded = false }: Props) {
  const { locale } = usePreferences();
  const t = cardsCopy(locale);
  const baseId = useId();
  const listTitleId = `${baseId}-list-title`;
  const registerTitleId = `${baseId}-register-title`;
  // Embedded contexts (e.g. Home) nest Cards under their own <h2>, so these drop a level to <h3>.
  const HeadingTag = embedded ? "h3" : "h2";
  const [cards, setCards] = useState<CardItem[]>([]);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [registeredStatus, setRegisteredStatus] = useState("");

  const messages: CardsClientMessages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidLabel: t.errorInvalidLabel,
      errorInvalidIban: t.errorInvalidIban,
      errorDuplicateIban: t.errorDuplicateIban,
      errorForbidden: t.errorForbidden,
      errorCardNotFound: t.errorCardNotFound,
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCards(messages),
      fetchLists({
        errorGeneric: t.errorGeneric,
        errorInvalidName: t.errorGeneric,
        errorForbidden: t.errorForbidden,
        errorUnauthorized: t.errorUnauthorized,
      }),
    ]).then(([cardsResult, listsResult]) => {
      if (cancelled) return;
      if (!cardsResult.ok) {
        setLoadError(cardsResult.error);
      } else {
        setCards(cardsResult.cards);
      }
      if (listsResult.ok) setLists(listsResult.lists);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Card/list data does not depend on locale; fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onRegistered(card: CardItem) {
    setCards((prev) => [card, ...prev]);
    setRegisteredStatus(t.cardRegistered);
  }

  function onRoutingUpdated(updated: CardItem) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  const sections = (
    // Source order = mobile stack (Register, default destination, list).
    // md:flex-col-reverse restores desktop (list, default, Register).
    // md:justify-end keeps a reversed column top-aligned if a parent stretches it.
    // Tailwind md is 768px — same breakpoint as Home's lists/cards split (home.module.scss).
    // Keep these three children in this order; a new sibling would reverse on desktop.
    <div
      className={`flex flex-col gap-8 md:flex-col-reverse md:justify-end ${embedded ? "" : "max-w-[32rem]"}`}
    >
      <section aria-labelledby={registerTitleId}>
        <HeadingTag
          id={registerTitleId}
          className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]"
        >
          {t.submit}
        </HeadingTag>
        <RegisterCardForm
          messages={{
            ...messages,
            labelField: t.labelField,
            ibanField: t.ibanField,
            submit: t.submit,
            submitting: t.submitting,
          }}
          onRegistered={onRegistered}
        />
      </section>

      <div className="empty:hidden">
        <DefaultImportListControl
          lists={lists}
          messages={{
            defaultListTitle: t.defaultListTitle,
            defaultListHint: t.defaultListHint,
            errorGeneric: t.errorGeneric,
            errorUnauthorized: t.errorUnauthorized,
            errorForbidden: t.errorForbidden,
          }}
        />
      </div>

      <section aria-labelledby={listTitleId}>
        <HeadingTag
          id={listTitleId}
          className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]"
        >
          {t.listTitle}
        </HeadingTag>
        <p className="sr-only" aria-live="polite">
          {registeredStatus}
        </p>
        {loading ? (
          <p className="text-muted text-[0.85rem]">{t.loading}</p>
        ) : loadError ? (
          <p className="text-owe text-[0.9rem]" role="alert">
            {loadError}
          </p>
        ) : cards.length === 0 ? (
          <p className="text-muted text-[0.85rem]">{t.emptyState}</p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {cards.map((card) => (
              <li
                key={card.id}
                className="py-[0.6rem] px-[0.85rem] rounded-[8px] border border-border bg-surface"
              >
                <CardRoutingControl
                  card={card}
                  lists={lists}
                  trailing={
                    <CopyButton value={card.iban} label={t.copyIban} copiedLabel={t.ibanCopied}>
                      <span className="text-muted text-[0.85rem] tracking-[0.02rem]">
                        {maskIban(card.iban)}
                      </span>
                    </CopyButton>
                  }
                  messages={{
                    ...messages,
                    routingTitle: t.routingTitle,
                    routingChipFixed: t.routingChipFixed,
                    routingChipReview: t.routingChipReview,
                    routingModeFixed: t.routingModeFixed,
                    routingModeReview: t.routingModeReview,
                    routingListLabel: t.routingListLabel,
                    routingSave: t.routingSave,
                    routingSaving: t.routingSaving,
                  }}
                  onUpdated={onRoutingUpdated}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  if (embedded) {
    return sections;
  }

  return (
    <main className="py-[2.5rem] px-[1.5rem]" style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <span />
        <Link className="text-accent font-semibold no-underline text-[0.9rem]" href="/account">
          {t.backToAccount}
        </Link>
      </div>
      <h1 className="m-0 mb-[0.35rem] text-[1.75rem] font-[550] text-foreground">{t.title}</h1>
      <p className="m-0 mb-[1.75rem] max-w-[28rem] text-muted leading-[1.45] text-[0.95rem]">
        {t.subtitle}
      </p>
      {sections}
    </main>
  );
}
