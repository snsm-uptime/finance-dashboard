"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useChromeHeader } from "@/components/ChromeBack";
import { usePreferences } from "@/components/PreferencesProvider";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { conflictsCopy } from "@/lib/i18n/conflicts";
import { DiscardConfirmDialog } from "@/app/upload/DiscardConfirmDialog";
import {
  ConflictMessages,
  SamePriceConflict,
  fetchConflictQueue,
  resolveConflict,
} from "@/app/upload/conflictsClient";

type ConflictReviewPanelProps = {
  landingListId: string | null;
};

/**
 * End-of-import same-price conflict review (Story 5.5). Sits between the
 * completion summary and Soft-Ledger (UX-DR22) — one collision at a time,
 * keyboard-selectable buttons only, no swipe (AC #5, UX-DR14/19).
 */
export function ConflictReviewPanel({ landingListId }: ConflictReviewPanelProps) {
  const { locale } = usePreferences();
  const t = conflictsCopy(locale);
  const router = useRouter();

  const messages: ConflictMessages = {
    errorUnauthorized: t.errorUnauthorized,
    errorForbidden: t.errorForbidden,
    errorNotFound: t.errorNotFound,
    errorAlreadyResolved: t.errorAlreadyResolved,
    errorConfirmRequired: t.errorConfirmRequired,
    errorGeneric: t.errorGeneric,
  };

  const [conflicts, setConflicts] = useState<SamePriceConflict[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [escapeOpen, setEscapeOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchConflictQueue(messages);
      if (cancelled) return;
      if (result.ok) {
        setConflicts(result.conflicts);
        setLoadError(null);
      } else {
        setLoadError(result.error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, reloadKey]);

  const goToLanding = useCallback(() => {
    router.push(landingListId ? `/lists/${encodeURIComponent(landingListId)}` : "/lists");
  }, [router, landingListId]);

  useChromeHeader({ title: t.title, onBack: goToLanding });

  const current = conflicts?.[0] ?? null;

  useEffect(() => {
    if (conflicts !== null && current === null) {
      goToLanding();
    }
  }, [conflicts, current, goToLanding]);

  async function resolve(resolution: "manual_survivor" | "parsed_survivor" | "not_same_expense") {
    if (!current || pending) return;
    setPending(true);
    setActionError(null);
    const result = await resolveConflict(
      current.id,
      resolution,
      resolution === "not_same_expense",
      messages,
    );
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setEscapeOpen(false);
    setReloadKey((key) => key + 1);
  }

  if (loadError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="m-0 text-[0.95rem] text-muted">{loadError}</p>
        <GhostButton onClick={() => setReloadKey((key) => key + 1)}>
          {t.doneReturnToList}
        </GhostButton>
      </div>
    );
  }

  if (conflicts === null) {
    return null;
  }

  if (current === null) {
    return null;
  }

  const remaining = conflicts.length;

  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-5 px-4 pt-4 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[1.1rem] font-[600] text-foreground">{t.title}</h1>
        <p className="m-0 text-[0.9rem] text-muted">{t.subtitle}</p>
        <p className="m-0 text-[0.8rem] text-muted">
          {t.progress.replace("{count}", String(remaining))}
        </p>
      </div>

      {actionError ? (
        <p className="m-0 text-[0.85rem] text-owe" role="alert">
          {actionError}
        </p>
      ) : null}

      <ConflictCard
        label={t.manualLabel}
        entry={current.manual}
        onListText={t.onList}
        actionLabel={t.pickManual}
        onPick={() => resolve("manual_survivor")}
        disabled={pending}
      />
      <ConflictCard
        label={t.parsedLabel}
        entry={current.parsed}
        onListText={t.onList}
        actionLabel={t.pickParsed}
        onPick={() => resolve("parsed_survivor")}
        disabled={pending}
      />

      <GhostButton size="sm" onClick={() => setEscapeOpen(true)} disabled={pending}>
        {t.notSameExpense}
      </GhostButton>

      <DiscardConfirmDialog
        open={escapeOpen}
        title={t.confirmTitle}
        body={t.confirmBody}
        confirmLabel={pending ? t.resolving : t.confirmAction}
        cancelLabel={t.confirmCancel}
        pending={pending}
        onConfirm={() => resolve("not_same_expense")}
        onCancel={() => setEscapeOpen(false)}
      />
    </div>
  );
}

function ConflictCard({
  label,
  entry,
  onListText,
  actionLabel,
  onPick,
  disabled,
}: {
  label: string;
  entry: SamePriceConflict["manual"];
  onListText: string;
  actionLabel: string;
  onPick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <span className="text-[0.75rem] font-[600] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-[1.15rem] font-[600] text-foreground">
        {entry.amount} {entry.currency}
      </span>
      <span className="text-[0.9rem] text-foreground">{entry.normalized_description}</span>
      <span className="text-[0.8rem] text-muted">
        {entry.posted_date} · {onListText.replace("{list}", entry.list_name)}
      </span>
      <PrimaryButton className="mt-2" onClick={onPick} disabled={disabled}>
        {actionLabel}
      </PrimaryButton>
    </div>
  );
}
