"use client";

import { useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { useChromeHeader } from "@/components/ChromeBack";
import { ChromeAvatarLink } from "@/components/ChromeAvatarLink";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { IconButton } from "@/components/IconButton";
import {
  IconButtonPopup,
  IconButtonPopupItem,
} from "@/components/IconButtonPopup";
import { usePreferences } from "@/components/PreferencesProvider";
import { StackedListPanel } from "@/components/StackedListPanel";
import { cardsCopy } from "@/lib/i18n/cards";
import { ArchiveToggleIcon, DotsIcon, TrashIcon } from "@/app/icons";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
import { fetchLists } from "../lists/listsClient";
import {
  getMembershipListsSnapshot,
  replaceMembershipLists,
  useMembershipLists,
} from "../lists/membershipListsStore";
import {
  archiveCard,
  deleteCard,
  fetchCards,
  unarchiveCard,
  type CardItem,
  type CardsClientMessages,
} from "./cardsClient";
import { CardRoutingControl } from "./CardRoutingControl";
import { RegisterCardForm } from "./RegisterCardForm";
import styles from "./cards.module.scss";

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
  const [showArchived, setShowArchived] = useState(false);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [archivedCards, setArchivedCards] = useState<CardItem[]>([]);
  const membershipLists = useMembershipLists();
  const lists = useMemo(() => membershipLists ?? [], [membershipLists]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [registeredStatus, setRegisteredStatus] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const defaultListId = me?.default_import_list_id ?? "";
  useChromeHeader({
    leading: me ? (
      <ChromeAvatarLink alias={me.alias} userId={me.user_id} photoBase64={me.photo_base64} />
    ) : null,
    title: t.title,
    trailing: (
      <>
        <IconButton
          icon={<ArchiveToggleIcon active={showArchived} className="size-5" />}
          label={showArchived ? t.cardsShowActive : t.cardsShowArchived}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((prev) => !prev)}
        />
        <DocsHelpButton pageName="Cards" docsAnchor="/docs#cards-imports" />
      </>
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

  function showDeleteConfirm(cardId: string) {
    setDeleteConfirmId(cardId);
    setOpenMenuId(null);
  }

  function cancelDeleteConfirm() {
    setDeleteConfirmId(null);
  }

  async function confirmDelete(card: CardItem) {
    if (deletingId === card.id) return;
    setDeletingId(card.id);
    try {
      const result = await deleteCard(card.id, messages);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setDeleteConfirmId(null);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setArchivedCards((prev) => prev.filter((c) => c.id !== card.id));
    } finally {
      setDeletingId(null);
    }
  }

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

  useEffect(() => {
    if (!showArchived) return;
    let cancelled = false;
    async function loadArchived() {
      const result = await fetchCards(messages, { archived: true });
      if (cancelled) return;
      if (result.ok) {
        setLoadError(null);
        setArchivedCards(result.cards);
      } else {
        setLoadError(result.error);
        setArchivedCards([]);
      }
    }
    void loadArchived();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const visibleCards = showArchived ? archivedCards : cards;

  function onRegistered(card: CardItem) {
    setCards((prev) => [card, ...prev]);
    setRegisteredStatus(t.cardRegistered);
  }

  function onCardUpdated(updated: CardItem) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function onArchive(card: CardItem) {
    const result = await archiveCard(card.id, messages);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }

  async function onUnarchive(card: CardItem) {
    const result = await unarchiveCard(card.id, messages);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setArchivedCards((prev) => prev.filter((c) => c.id !== card.id));
  }

  return (
    <StackedListPanel
      ariaLabel={t.title}
      liveRegionText={registeredStatus}
      input={
        showArchived ? null : (
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
        )
      }
      items={visibleCards}
      itemKey={(card) => card.id}
      loading={loading}
      loadingLabel={t.loading}
      error={loadError}
      emptyLabel={showArchived ? t.cardsArchivedEmpty : t.emptyState}
      renderItem={(card) => (
        <CardRoutingControl
          card={card}
          lists={lists}
          routingLists={routingLists}
          trailing={
            <>
              <CopyButton value={card.iban} label={t.copyIban} copiedLabel={t.ibanCopied}>
                <span className="text-muted text-[0.85rem] tracking-[0.02rem]">
                  {maskIban(card.iban)}
                </span>
              </CopyButton>
              <IconButtonPopup
                panelClassName={
                  deleteConfirmId === card.id ? styles.confirmPanel : styles.menuPanel
                }
                panelRole={deleteConfirmId === card.id ? "alertdialog" : "menu"}
                open={openMenuId === card.id || deleteConfirmId === card.id}
                onOpenChange={(next) => {
                  if (next) {
                    setOpenMenuId(card.id);
                    setDeleteConfirmId(null);
                  } else {
                    setOpenMenuId((current) => (current === card.id ? null : current));
                    setDeleteConfirmId((current) => (current === card.id ? null : current));
                  }
                }}
                button={
                  <IconButton
                    type="button"
                    variant="muted"
                    label={t.menuAria}
                    icon={<DotsIcon />}
                  />
                }
              >
                {deleteConfirmId === card.id ? (
                  <>
                    <p className={styles.confirmText}>{t.deleteConfirm}</p>
                    <div className={styles.confirmActions}>
                      <GhostButton onClick={cancelDeleteConfirm} disabled={deletingId !== null}>
                        {t.deleteCancel}
                      </GhostButton>
                      <button
                        type="button"
                        className={`${styles.primary} ${styles.primaryDanger}`}
                        onClick={() => void confirmDelete(card)}
                        disabled={deletingId !== null}
                      >
                        {deletingId === card.id ? t.deletingAction : t.deleteAction}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <IconButtonPopupItem
                      onClick={() =>
                        void (showArchived ? onUnarchive(card) : onArchive(card))
                      }
                    >
                      <span className="flex items-center gap-4">
                        <ArchiveToggleIcon active={showArchived} className="h-4 w-4 shrink-0" />
                        {showArchived ? t.cardsUnarchive : t.cardsArchive}
                      </span>
                    </IconButtonPopupItem>
                    <IconButtonPopupItem
                      danger
                      stayOpen
                      onClick={() => showDeleteConfirm(card.id)}
                    >
                      <span className="flex items-center gap-4">
                        <TrashIcon className="h-4 w-4 shrink-0" />
                        {t.deleteAria}
                      </span>
                    </IconButtonPopupItem>
                  </>
                )}
              </IconButtonPopup>
            </>
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
            renameLabel: t.renameLabel,
          }}
          onUpdated={onCardUpdated}
          onLabelUpdated={onCardUpdated}
        />
      )}
    />
  );
}
