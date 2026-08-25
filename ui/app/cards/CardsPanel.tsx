"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { cardsCopy } from "@/lib/i18n/cards";
import { fetchLists } from "../lists/listsClient";
import {
  getMembershipListsSnapshot,
  replaceMembershipLists,
  useMembershipLists,
} from "../lists/membershipListsStore";
import { fetchCards, type CardItem, type CardsClientMessages } from "./cardsClient";
import { CardRoutingControl } from "./CardRoutingControl";
import { RegisterCardForm } from "./RegisterCardForm";

function maskIban(iban: string): string {
  return `•••• ${iban.slice(-4)}`;
}

/** Embeds into another page's layout (e.g. Home, Account) — no standalone page chrome. */
export function CardsPanel() {
  const { locale } = usePreferences();
  const t = cardsCopy(locale);
  const baseId = useId();
  const listTitleId = `${baseId}-list-title`;
  const registerTitleId = `${baseId}-register-title`;
  // Nested under the host page's own <h2>, so these drop a level to <h3>.
  const HeadingTag = "h3";
  const [cards, setCards] = useState<CardItem[]>([]);
  const lists = useMembershipLists() ?? [];
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
    async function load() {
      const cardsResult = await fetchCards(messages);
      if (cancelled) return;
      if (!cardsResult.ok) {
        setLoadError(cardsResult.error);
      } else {
        setCards(cardsResult.cards);
      }
      // Home already seeded membership from SSR; skip GET so an in-flight
      // refetch cannot resurrect a list the user just deleted.
      if (getMembershipListsSnapshot() === null) {
        const listsResult = await fetchLists({
          errorGeneric: t.errorGeneric,
          errorInvalidName: t.errorGeneric,
          errorForbidden: t.errorForbidden,
          errorUnauthorized: t.errorUnauthorized,
        });
        if (listsResult.ok) replaceMembershipLists(listsResult.lists);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
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
    // Source order = mobile stack (Register, then list).
    // md:flex-col-reverse restores desktop (list, then Register).
    // md:justify-end keeps a reversed column top-aligned if a parent stretches it.
    // Tailwind md is 768px — same breakpoint as Home's lists/cards split (home.module.scss).
    <div className="flex flex-col gap-8 md:flex-col-reverse md:justify-end">
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

  return sections;
}
