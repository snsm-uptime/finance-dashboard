"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { cardsCopy } from "@/lib/i18n/cards";
import { fetchCards, type CardItem, type CardsClientMessages } from "./cardsClient";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messages: CardsClientMessages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidLabel: t.errorInvalidLabel,
      errorInvalidIban: t.errorInvalidIban,
      errorDuplicateIban: t.errorDuplicateIban,
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    fetchCards(messages).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
      } else {
        setCards(result.cards);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Card data does not depend on locale; fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onRegistered(card: CardItem) {
    setCards((prev) => [card, ...prev]);
  }

  const sections = (
    <div className={`flex flex-col gap-8 ${embedded ? "" : "max-w-[32rem]"}`}>
      <section aria-labelledby={listTitleId}>
        <HeadingTag
          id={listTitleId}
          className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]"
        >
          {t.listTitle}
        </HeadingTag>
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
                className="flex items-center justify-between gap-3 py-[0.6rem] px-[0.85rem] rounded-[8px] border border-border bg-surface"
              >
                <span className="font-[550] text-foreground text-[0.95rem]">{card.label}</span>
                <CopyButton value={card.iban} label={t.copyIban} copiedLabel={t.ibanCopied}>
                  <span className="text-muted text-[0.85rem] tracking-[0.02rem]">
                    {maskIban(card.iban)}
                  </span>
                </CopyButton>
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );

  if (embedded) {
    return sections;
  }

  return (
    <main className="min-h-screen py-[2.5rem] px-[1.5rem]" style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}>
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
