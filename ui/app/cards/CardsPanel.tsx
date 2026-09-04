"use client";

import { useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { useChromeHeader } from "@/components/ChromeBack";
import { ChromeAvatarLink } from "@/components/ChromeAvatarLink";
import { usePreferences } from "@/components/PreferencesProvider";
import { StackedListPanel } from "@/components/StackedListPanel";
import { cardsCopy } from "@/lib/i18n/cards";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
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

type Props = {
  /** Bump to force a refetch of cards + default list — e.g. after the default changes elsewhere on the page. */
  refreshToken?: number;
};

/** Standalone /cards route content — card registration + per-card routing. */
export function CardsPanel({ refreshToken = 0 }: Props = {}) {
  const { locale, me } = usePreferences();
  const t = cardsCopy(locale);
  const [cards, setCards] = useState<CardItem[]>([]);
  const membershipLists = useMembershipLists();
  const lists = useMemo(() => membershipLists ?? [], [membershipLists]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [registeredStatus, setRegisteredStatus] = useState("");
  const defaultListId = me?.default_import_list_id ?? "";
  useChromeHeader({
    leading: me ? (
      <ChromeAvatarLink alias={me.alias} userId={me.user_id} photoBase64={me.photo_base64} />
    ) : null,
    title: t.title,
    trailing: (
      <DocsHelpButton pageName="Cards" docsAnchor="/docs#cards-imports" />
    ),
  });

  // Low-effort review accepts already land on the default list, so offering
  // it as a fixed-routing target too would just be a redundant option.
  const routingLists = useMemo(
    () => lists.filter((list) => list.id !== defaultListId),
    [lists, defaultListId],
  );

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
    // Card/list data does not depend on locale; refetch on mount and whenever
    // refreshToken bumps (e.g. the default import list changed elsewhere).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  function onRegistered(card: CardItem) {
    setCards((prev) => [card, ...prev]);
    setRegisteredStatus(t.cardRegistered);
  }

  function onRoutingUpdated(updated: CardItem) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  return (
    <StackedListPanel
      ariaLabel={t.title}
      liveRegionText={registeredStatus}
      input={
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
      }
      items={cards}
      itemKey={(card) => card.id}
      loading={loading}
      loadingLabel={t.loading}
      error={loadError}
      emptyLabel={t.emptyState}
      renderItem={(card) => (
        <CardRoutingControl
          card={card}
          lists={lists}
          routingLists={routingLists}
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
      )}
    />
  );
}
