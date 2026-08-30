import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BalanceStrip, type BalancePolarity } from "@/components/soft-ledger/BalanceStrip";
import { Hint } from "@/components/soft-ledger/Hint";
import { IncompleteDisclosure } from "@/components/soft-ledger/IncompleteDisclosure";
import { ReceiptRow } from "@/components/soft-ledger/ReceiptRow";
import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { requireAlias } from "@/lib/alias";
import { getApiInternalUrl } from "@/lib/api";
import { formatCrcAmount } from "@/lib/currency";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import { ListReceiptMenu } from "../ListReceiptMenu";
import { ListDetailChrome } from "../ListDetailChrome";
import { ListDetailMobileActions } from "../ListDetailMobileActions";
import { ListDefaultSplitProvider } from "../ListDefaultSplitContext";
import { ManualExpenseForm } from "../ManualExpenseForm";
import { OriginChipPicker } from "../OriginChipPicker";
import { SettleControls } from "../SettleControls";
import { TemporalNavigation } from "../TemporalNavigation";
import {
  balanceTone,
  memberLabel,
  type DefaultSplitPayload,
  type ExpenseItem,
  type ListMember,
} from "../listsClient";
import styles from "../lists.module.scss";

export const dynamic = "force-dynamic";

type DetailPayload = {
  id?: string;
  name?: string;
  owner_id?: string;
};

function resolvePageLocale(languageCookie: string | undefined): Locale {
  if (languageCookie === "es" || languageCookie === "en") return languageCookie;
  return "en";
}

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function asDefaultSplit(data: unknown): DefaultSplitPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<DefaultSplitPayload>;
  if (
    typeof row.list_id !== "string" ||
    typeof row.owner_id !== "string" ||
    (row.mode !== "even" && row.mode !== "percentage") ||
    !Array.isArray(row.shares) ||
    !Array.isArray(row.member_ids)
  ) {
    return null;
  }
  return {
    list_id: row.list_id,
    owner_id: row.owner_id,
    mode: row.mode,
    shares: row.shares as DefaultSplitPayload["shares"],
    member_ids: row.member_ids as string[],
  };
}

export type PairwiseEdgePayload = {
  member_id: string;
  alias: string | null;
  amount_crc: string;
};

type BalancesPayload = {
  list_id: string;
  balance_crc: string;
  balance_status: { is_incomplete: boolean };
  you_are_owed: PairwiseEdgePayload[];
  you_owe: PairwiseEdgePayload[];
};

/** Defensive parse — malformed/absent rows default to `[]`, never fabricated (Story 5.8). */
function asPairwiseEdges(data: unknown): PairwiseEdgePayload[] {
  if (!Array.isArray(data)) return [];
  const out: PairwiseEdgePayload[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<PairwiseEdgePayload>;
    if (typeof r.member_id !== "string" || typeof r.amount_crc !== "string") continue;
    out.push({
      member_id: r.member_id,
      alias: typeof r.alias === "string" && r.alias ? r.alias : null,
      amount_crc: r.amount_crc,
    });
  }
  return out;
}

export function asBalances(data: unknown): BalancesPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BalancesPayload>;
  if (typeof row.list_id !== "string") {
    return null;
  }
  const balanceCrc = typeof row.balance_crc === "string" ? row.balance_crc : String(row.balance_crc);
  if (!balanceCrc || balanceCrc === "undefined") {
    return null;
  }
  // Never fabricate `true` on a parse miss — an absent/malformed balance_status
  // must default to complete, mirroring the balanceCrc defensive parsing above.
  const isIncomplete =
    row.balance_status && typeof row.balance_status === "object"
      ? (row.balance_status as { is_incomplete?: unknown }).is_incomplete === true
      : false;
  return {
    list_id: row.list_id,
    balance_crc: balanceCrc,
    balance_status: { is_incomplete: isIncomplete },
    you_are_owed: asPairwiseEdges((row as { you_are_owed?: unknown }).you_are_owed),
    you_owe: asPairwiseEdges((row as { you_owe?: unknown }).you_owe),
  };
}

function asExpenses(data: unknown): ExpenseItem[] {
  if (!data || typeof data !== "object") return [];
  const rows = (data as { expenses?: unknown }).expenses;
  if (!Array.isArray(rows)) return [];
  const out: ExpenseItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const e = row as Partial<ExpenseItem>;
    if (
      typeof e.id !== "string" ||
      typeof e.description !== "string" ||
      typeof e.amount !== "string" ||
      typeof e.currency !== "string" ||
      typeof e.posted_date !== "string" ||
      typeof e.payer_id !== "string" ||
      typeof e.provenance !== "string" ||
      typeof e.line_type !== "string" ||
      typeof e.created_at !== "string" ||
      typeof e.list_id !== "string" ||
      typeof e.amount_crc !== "string" ||
      typeof e.fx_rate !== "string"
    ) {
      continue;
    }
    out.push({
      ...(e as ExpenseItem),
      fx_rate_date: typeof e.fx_rate_date === "string" ? e.fx_rate_date : null,
      fx_fallback: e.fx_fallback === true,
      origin_kind: typeof e.origin_kind === "string" ? e.origin_kind : null,
      origin_card_id: typeof e.origin_card_id === "string" ? e.origin_card_id : null,
      origin_card_label: typeof e.origin_card_label === "string" ? e.origin_card_label : null,
      viewer_share_kind:
        e.viewer_share_kind === "percentage" || e.viewer_share_kind === "absolute"
          ? e.viewer_share_kind
          : null,
      viewer_share_value: typeof e.viewer_share_value === "string" ? e.viewer_share_value : null,
      viewer_net_crc: typeof e.viewer_net_crc === "string" ? e.viewer_net_crc : null,
      viewer_net_polarity:
        e.viewer_net_polarity === "owe" ||
          e.viewer_net_polarity === "owed" ||
          e.viewer_net_polarity === "zero"
          ? e.viewer_net_polarity
          : null,
      import_batch_id: typeof e.import_batch_id === "string" ? e.import_batch_id : null,
      statement_id: typeof e.statement_id === "string" ? e.statement_id : null,
    });
  }
  return out;
}

export function formatShareLabel(
  kind: ExpenseItem["viewer_share_kind"],
  value: string | null,
): string | undefined {
  if (!kind || !value) return undefined;
  if (kind === "percentage") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return `${value}%`;
    return `${parsed}%`;
  }
  return formatCrcAmount(value);
}

export function formatNetLabel(
  crc: string | null,
  polarity: ExpenseItem["viewer_net_polarity"],
): { label: string; polarity: "owe" | "owed" } | undefined {
  if (!crc || (polarity !== "owe" && polarity !== "owed")) return undefined;
  return { label: formatCrcAmount(crc), polarity };
}

function formatPercentagePrefix(
  kind: ExpenseItem["viewer_share_kind"] | undefined,
  value: string | null | undefined,
): string | undefined {
  if (kind !== "percentage" || !value) return undefined;
  const parsed = Number(value);
  return `%${Number.isFinite(parsed) ? parsed : value}`;
}

export function directionLabelFrom(
  polarity: ExpenseItem["viewer_net_polarity"],
  t: { expenseYouBorrowed: string; expenseYouLent: string },
  share?: {
    kind: ExpenseItem["viewer_share_kind"];
    value: string | null;
  },
): string | undefined {
  const base =
    polarity === "owe"
      ? t.expenseYouBorrowed
      : polarity === "owed"
        ? t.expenseYouLent
        : undefined;
  if (!base) return undefined;
  const pct = formatPercentagePrefix(share?.kind, share?.value);
  return pct ? `${base} ${pct}` : base;
}

export function originChipFrom(
  e: ExpenseItem,
  currentUserId: string,
  t: {
    expenseOriginCash: string;
    expenseOriginCard: string;
    expenseOriginUnknown: string;
    expenseOriginNone: string;
  },
): string | undefined {
  if (e.origin_kind === "cash") return t.expenseOriginCash;
  if (e.origin_kind === "card") {
    if (e.payer_id === currentUserId && e.origin_card_label) return e.origin_card_label;
    return t.expenseOriginCard;
  }
  if (e.payer_id !== currentUserId) return t.expenseOriginUnknown;
  return t.expenseOriginNone;
}

const COSTA_RICA_TZ = "America/Costa_Rica";

/** Calendar date (YYYY-MM-DD) in America/Costa_Rica for an ISO timestamp. */
export function calendarDateInCostaRica(isoDatetime: string): string | null {
  const ms = Date.parse(isoDatetime);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COSTA_RICA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function newBadgeLabelFrom(
  e: ExpenseItem,
  t: { receiptNewBadge: string },
  today: string,
): string | undefined {
  if (e.provenance !== "parser") return undefined;
  const createdOn = calendarDateInCostaRica(e.created_at);
  return createdOn !== null && createdOn === today ? t.receiptNewBadge : undefined;
}

/**
 * Confirm-dialog body for rolling back an import batch. When sibling rows on
 * the same list share `batchId`, mentions the count so a bulk rollback is not
 * a silent multi-row wipe (Story 5.4 Task 3.1).
 */
export function rollbackBatchConfirmBodyFrom(
  expenses: ExpenseItem[],
  batchId: string,
  t: { rollbackBatchConfirmBody: string; rollbackBatchConfirmBodyCount: string },
): string {
  const count = expenses.reduce(
    (total, row) => (row.import_batch_id === batchId ? total + 1 : total),
    0,
  );
  return count > 1
    ? t.rollbackBatchConfirmBodyCount.replace("{count}", String(count))
    : t.rollbackBatchConfirmBody;
}

/** Roster alias for a receipt row; short id if the payer has not claimed one yet. */
export function payerAliasFrom(payerId: string, members: ListMember[]): string {
  const member = members.find((m) => m.user_id === payerId);
  if (member) return memberLabel(member);
  return `${payerId.slice(0, 8)}…`;
}

type ExpenseFxMessages = {
  expenseFxOriginalTemplate: string;
  expenseFxFallbackSuffix: string;
  expenseFxSummaryLabel: string;
  expenseFxRateDetailTemplate: string;
};

/**
 * FX audit trail for a receipt row (Story 3.5 AC #3). CRC rows render plainly;
 * non-CRC rows show original + converted CRC inline and keep rate/date behind
 * an expandable detail (fallback is disclosed directly, never hidden).
 */
export function receiptRowFxPropsFrom(
  e: ExpenseItem,
  t: ExpenseFxMessages,
): { title: string; amount: string; fxSummary?: string; fxDetail?: string } {
  if (e.currency === "CRC") {
    return { title: e.description, amount: formatCrcAmount(e.amount) };
  }
  const fallbackSuffix =
    e.fx_fallback && e.fx_rate_date
      ? t.expenseFxFallbackSuffix.replace("{date}", e.fx_rate_date)
      : "";
  const original = t.expenseFxOriginalTemplate
    .replace("{currency}", e.currency)
    .replace("{original}", e.amount)
    .replace("{crc}", formatCrcAmount(e.amount_crc));
  const fxDetail = e.fx_rate_date
    ? t.expenseFxRateDetailTemplate
      .replace("{rate}", e.fx_rate)
      .replace("{date}", e.fx_rate_date)
    : undefined;
  return {
    title: `${e.description} (${original}${fallbackSuffix})`,
    amount: formatCrcAmount(e.amount_crc),
    fxSummary: fxDetail ? t.expenseFxSummaryLabel : undefined,
    fxDetail,
  };
}

type BalanceStripMessages = {
  detailSettleEmpty: string;
  balanceOwe: string;
  balanceOwed: string;
  balanceZero: string;
  loadError: string;
};

type BalanceStripState = {
  who: string;
  amount: string;
  polarity: BalancePolarity;
};

/**
 * Tone→props mapping for the settle strip (Story 3.3 state machine).
 * A failed fetch always wins over "empty"; those are distinct claims.
 */
export function balanceStripPropsFrom(
  hasExpenses: boolean,
  balancesLoadError: boolean,
  balanceCrc: string | undefined,
  t: BalanceStripMessages,
): BalanceStripState {
  if (balancesLoadError) {
    return { who: t.loadError, amount: "—", polarity: "neutral" };
  }
  if (!hasExpenses) {
    return { who: t.detailSettleEmpty, amount: "—", polarity: "neutral" };
  }
  const amount = formatCrcAmount(balanceCrc?.trim() || "0");
  const tone = balanceTone(balanceCrc);
  if (tone === "owe") return { who: t.balanceOwe, amount, polarity: "owe" };
  if (tone === "owed") return { who: t.balanceOwed, amount, polarity: "owed" };
  return { who: t.balanceZero, amount, polarity: "neutral" };
}

/** Pairwise column rows for the settle grid — alias falls back to a short id. */
export function pairwiseRowsFrom(
  edges: PairwiseEdgePayload[],
): { memberId: string; label: string; amount: string }[] {
  return edges.map((e) => ({
    memberId: e.member_id,
    label: e.alias ?? `${e.member_id.slice(0, 8)}…`,
    amount: formatCrcAmount(e.amount_crc),
  }));
}

function asMembers(data: unknown): ListMember[] {
  if (!data || typeof data !== "object") return [];
  const rows = (data as { members?: unknown }).members;
  if (!Array.isArray(rows)) return [];
  const out: ListMember[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const m = row as { user_id?: unknown; alias?: unknown };
    if (typeof m.user_id !== "string") continue;
    out.push({
      user_id: m.user_id,
      alias: typeof m.alias === "string" && m.alias ? m.alias : null,
    });
  }
  return out;
}

/** Soft-Ledger list detail shell — settle first / receipts below (empty OK). */
export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/lists/${encodeURIComponent(listId)}`);
  }
  await requireAlias(`/lists/${listId}`);

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const header = await cookieHeader();

  let detail: DetailPayload | null = null;
  let defaultSplit: DefaultSplitPayload | null = null;
  let expenses: ExpenseItem[] = [];
  let members: ListMember[] = [];
  let balances: BalancesPayload | null = null;
  let splitLoadError = false;
  let expensesLoadError = false;
  let membersLoadError = false;
  let balancesLoadError = false;
  let notFound = false;
  let loadError = false;
  try {
    const response = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(header ? { Cookie: header } : {}),
        },
        cache: "no-store",
      },
    );
    if (response.status === 401) {
      redirect(`/sign-in?returnTo=/lists/${encodeURIComponent(listId)}`);
    }
    if (response.status === 404) {
      notFound = true;
    } else if (response.ok) {
      detail = (await response.json()) as DetailPayload;
      const [splitRes, expensesRes, membersRes, balancesRes] = await Promise.all([
        fetch(`${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/default-split`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(header ? { Cookie: header } : {}),
          },
          cache: "no-store",
        }),
        fetch(`${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/expenses`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(header ? { Cookie: header } : {}),
          },
          cache: "no-store",
        }),
        fetch(`${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/members`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(header ? { Cookie: header } : {}),
          },
          cache: "no-store",
        }),
        fetch(`${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/balances`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(header ? { Cookie: header } : {}),
          },
          cache: "no-store",
        }),
      ]);
      if (splitRes.ok) {
        const parsed = asDefaultSplit(await splitRes.json());
        if (parsed) {
          defaultSplit = parsed;
        } else {
          splitLoadError = true;
        }
      } else {
        splitLoadError = true;
      }
      if (expensesRes.ok) {
        expenses = asExpenses(await expensesRes.json());
      } else {
        expensesLoadError = true;
      }
      if (membersRes.ok) {
        members = asMembers(await membersRes.json());
        if (members.length === 0) {
          membersLoadError = true;
        }
      } else {
        membersLoadError = true;
      }
      if (balancesRes.ok) {
        try {
          const parsedBalances = asBalances(await balancesRes.json());
          if (parsedBalances) {
            balances = parsedBalances;
          } else {
            balancesLoadError = true;
          }
        } catch {
          balancesLoadError = true;
        }
      } else {
        balancesLoadError = true;
      }
    } else {
      loadError = true;
    }
  } catch {
    loadError = true;
  }

  const listTitle = detail?.name;
  const isOwner = Boolean(detail?.owner_id && detail.owner_id === session.user_id);
  const showListDetail = Boolean(listTitle) && !notFound && !loadError;
  const hasExpenses = expenses.length > 0;
  const showBalancesGrid = !balancesLoadError && balances !== null;
  const stripProps = balanceStripPropsFrom(hasExpenses, balancesLoadError, balances?.balance_crc, t);
  const todayCr = calendarDateInCostaRica(new Date().toISOString());

  return (
    <main className={styles.softMain}>
      <div className={styles.softBody}>
        {notFound ? (
          <>
            <ListDetailChrome title={t.detailNotFound} />
            <p className={`${styles.copy} ${styles.softBack}`}>
              <Link className={styles.link} href="/home">
                {t.backToLists}
              </Link>
            </p>
          </>
        ) : !showListDetail ? (
          <>
            <ListDetailChrome title={t.loadError} />
            <p className={`${styles.copy} ${styles.softBack}`}>
              <Link className={styles.link} href="/home">
                {t.backToLists}
              </Link>
            </p>
          </>
        ) : (
          <ListDefaultSplitProvider initial={defaultSplit}>
            <div className={styles.detailLayout}>
              <ListDetailChrome title={listTitle as string} />
              <div className={styles.detailPrimary}>
                <BalanceStrip
                  {...(showBalancesGrid
                    ? {
                      variant: "grid" as const,
                      youAreOwedLabel: t.balanceYouAreOwed,
                      youOweLabel: t.balanceYouOwe,
                      balanceLabel: t.balanceLabel,
                      youAreOwed: pairwiseRowsFrom(balances?.you_are_owed ?? []),
                      youOwe: pairwiseRowsFrom(balances?.you_owe ?? []),
                      balanceAmount: stripProps.amount,
                      balancePolarity: stripProps.polarity,
                    }
                    : {
                      who: stripProps.who,
                      amount: stripProps.amount,
                      polarity: stripProps.polarity,
                    })}
                  action={
                    <ListDetailMobileActions
                      listId={listId}
                      currentUserId={session.user_id}
                      members={members}
                      isOwner={isOwner}
                      canAddExpense={!membersLoadError && members.length > 0}
                      canInvite={isOwner}
                      defaultSplit={defaultSplit}
                      expenseMessages={{
                        expenseTitle: t.expenseTitle,
                        expenseAmount: t.expenseAmount,
                        expenseDescription: t.expenseDescription,
                        expensePayer: t.expensePayer,
                        expenseSubmit: t.expenseSubmit,
                        expenseSaving: t.expenseSaving,
                        expenseAdjustSplit: t.expenseAdjustSplit,
                        expenseModeWhole: t.expenseModeWhole,
                        expenseModeAbsolute: t.expenseModeAbsolute,
                        expenseModePercentage: t.expenseModePercentage,
                        expenseAssignee: t.expenseAssignee,
                        expenseOriginLabel: t.expenseOriginLabel,
                        expenseOriginBlank: t.expenseOriginBlank,
                        expenseOriginCash: t.expenseOriginCash,
                        errorGeneric: t.errorGeneric,
                        errorInvalidName: t.errorInvalidName,
                        errorForbidden: t.errorForbidden,
                        errorUnauthorized: t.errorUnauthorized,
                      }}
                      inviteMessages={{
                        inviteTitle: t.inviteTitle,
                        inviteLabel: t.inviteLabel,
                        inviteSubmit: t.inviteSubmit,
                        inviteSending: t.inviteSending,
                        inviteSent: t.inviteSent,
                        errorGeneric: t.errorGeneric,
                        errorInvalidName: t.errorInvalidName,
                        errorInvalidEmail: t.errorInvalidEmail,
                        errorForbidden: t.errorInviteForbidden,
                        errorUnauthorized: t.errorUnauthorized,
                        errorAlreadyMember: t.errorAlreadyMember,
                        errorSmtp: t.errorSmtp,
                      }}
                      splitMessages={{
                        errorGeneric: t.errorGeneric,
                        errorInvalidName: t.errorInvalidName,
                        errorForbidden: t.errorForbidden,
                        errorUnauthorized: t.errorUnauthorized,
                        defaultSplitTitle: t.defaultSplitTitle,
                        defaultSplitEven: t.defaultSplitEven,
                        defaultSplitCustom: t.defaultSplitCustom,
                        defaultSplitSum: t.defaultSplitSum,
                        defaultSplitSave: t.defaultSplitSave,
                        defaultSplitSaving: t.defaultSplitSaving,
                        defaultSplitReadOnly: t.defaultSplitReadOnly,
                        errorInvalidSplit: t.errorInvalidSplit,
                      }}
                      addExpenseAria={t.mobileAddExpenseAria}
                      inviteAria={t.mobileInviteAria}
                      closeLabel={t.mobileSheetClose}
                    />
                  }
                />
                {showBalancesGrid ? (
                  <SettleControls
                    listId={listId}
                    simplifyAvailable={balances?.balance_status.is_incomplete !== true}
                    messages={{
                      simplifyAction: t.simplifyAction,
                      simplifyTitle: t.simplifyTitle,
                      simplifyEmpty: t.simplifyEmpty,
                      simplifyBlocked: t.simplifyBlocked,
                      settleAction: t.settleAction,
                      settleConfirmTitle: t.settleConfirmTitle,
                      settleConfirmBody: t.settleConfirmBody,
                      settleConfirmAction: t.settleConfirmAction,
                      settleCancel: t.settleCancel,
                      copyPlanLabel: t.copyPlanLabel,
                      copyPlanCopiedLabel: t.copyPlanCopiedLabel,
                      errorGeneric: t.errorGeneric,
                    }}
                  />
                ) : null}
                <IncompleteDisclosure
                  isIncomplete={balances?.balance_status.is_incomplete === true}
                  label={t.incompleteDisclosureLabel}
                  resolveHref="/upload/conflicts"
                  resolveLabel={t.incompleteDisclosureResolve}
                />
                {expenses.length === 0 && !expensesLoadError ? (
                  <Hint>{t.detailHintEmpty}</Hint>
                ) : null}
                <div className={styles.softReceipts}>
                  <div className={styles.softReceiptsChrome}>
                    <SectionLabel>{t.detailReceiptsTitle}</SectionLabel>
                  </div>
                  <div className={styles.softReceiptsList}>
                    {expensesLoadError ? (
                      <p className={styles.copy} role="alert">
                        {t.loadError}
                      </p>
                    ) : expenses.length === 0 ? (
                      <ReceiptRow emptyLabel={t.detailReceiptsEmpty} />
                    ) : (
                      expenses.map((e) => {
                        const rowProps = receiptRowFxPropsFrom(e, t);
                        const net = formatNetLabel(e.viewer_net_crc, e.viewer_net_polarity);
                        const originChip = originChipFrom(e, session.user_id, t);
                        const rowShared = {
                          title: rowProps.title,
                          payerAlias: payerAliasFrom(e.payer_id, members),
                          when: e.posted_date,
                          amount: rowProps.amount,
                          directionLabel: directionLabelFrom(e.viewer_net_polarity, t, {
                            kind: e.viewer_share_kind,
                            value: e.viewer_share_value,
                          }),
                          netLabel: net?.label,
                          netPolarity: net?.polarity,
                          newBadgeLabel: todayCr
                            ? newBadgeLabelFrom(e, t, todayCr)
                            : undefined,
                          menuSlot: (
                            <ListReceiptMenu
                              listId={listId}
                              statementId={e.statement_id}
                              messages={{
                                menuAria: t.receiptMenuAria,
                                editLabel: t.receiptEdit,
                                deleteLabel: t.receiptDelete,
                                moveStatementLabel: t.receiptMoveStatement,
                                moveConfirm: t.receiptMoveConfirm,
                                pickerTitle: t.receiptMovePickerTitle,
                                confirmAction: t.receiptMoveConfirmAction,
                                cancelLabel: t.receiptMoveCancel,
                                emptyDestLabel: t.receiptMoveNoOtherList,
                                errorGeneric: t.errorGeneric,
                                errorInvalidName: t.errorInvalidName,
                                errorForbidden: t.errorForbidden,
                                errorUnauthorized: t.errorUnauthorized,
                                errorReassignSplit: t.errorReassignSplit,
                              }}
                              rollback={
                                e.import_batch_id
                                  ? {
                                    listId,
                                    batchId: e.import_batch_id,
                                    confirmTitle: t.rollbackBatchConfirmTitle,
                                    confirmBody: rollbackBatchConfirmBodyFrom(
                                      expenses,
                                      e.import_batch_id,
                                      t,
                                    ),
                                    confirmAction: t.rollbackBatchConfirmAction,
                                    cancelLabel: t.deleteCancel,
                                    errorGeneric: t.errorGeneric,
                                    errorForbidden: t.errorForbidden,
                                    errorUnauthorized: t.errorUnauthorized,
                                  }
                                  : undefined
                              }
                            />
                          ),
                          fxSummary: rowProps.fxSummary,
                          fxDetail: rowProps.fxDetail,
                        };
                        if (e.payer_id === session.user_id && originChip) {
                          return (
                            <OriginChipPicker
                              key={e.id}
                              listId={listId}
                              entryId={e.id}
                              originKind={
                                e.origin_kind === "card" || e.origin_kind === "cash"
                                  ? e.origin_kind
                                  : null
                              }
                              originCardId={e.origin_card_id}
                              originLabel={originChip}
                              originTone={e.origin_kind == null ? "warning" : "muted"}
                              messages={{
                                expenseOriginNone: t.expenseOriginNone,
                                expenseOriginCash: t.expenseOriginCash,
                                expenseOriginLabel: t.expenseOriginLabel,
                                errorGeneric: t.errorGeneric,
                                errorInvalidName: t.errorInvalidName,
                                errorForbidden: t.errorForbidden,
                                errorUnauthorized: t.errorUnauthorized,
                              }}
                              {...rowShared}
                            />
                          );
                        }
                        return (
                          <ReceiptRow
                            key={e.id}
                            originChip={originChip}
                            originChipTone="muted"
                            originDisabled
                            {...rowShared}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              <aside className={styles.detailSidebar}>
                {members.length > 0 && (
                  <div>
                    <TemporalNavigation
                      listId={listId}
                      currentUserId={session.user_id}
                      members={members}
                      isOwner={isOwner}
                      defaultSplit={defaultSplit}
                      inviteMessages={{
                        inviteTitle: t.inviteTitle,
                        inviteLabel: t.inviteLabel,
                        inviteSubmit: t.inviteSubmit,
                        inviteSending: t.inviteSending,
                        inviteSent: t.inviteSent,
                        errorGeneric: t.errorGeneric,
                        errorInvalidName: t.errorInvalidName,
                        errorInvalidEmail: t.errorInvalidEmail,
                        errorForbidden: t.errorInviteForbidden,
                        errorUnauthorized: t.errorUnauthorized,
                        errorAlreadyMember: t.errorAlreadyMember,
                        errorSmtp: t.errorSmtp,
                      }}
                      splitMessages={{
                        errorGeneric: t.errorGeneric,
                        errorInvalidName: t.errorInvalidName,
                        errorForbidden: t.errorForbidden,
                        errorUnauthorized: t.errorUnauthorized,
                        defaultSplitTitle: t.defaultSplitTitle,
                        defaultSplitEven: t.defaultSplitEven,
                        defaultSplitCustom: t.defaultSplitCustom,
                        defaultSplitSum: t.defaultSplitSum,
                        defaultSplitSave: t.defaultSplitSave,
                        defaultSplitSaving: t.defaultSplitSaving,
                        defaultSplitReadOnly: t.defaultSplitReadOnly,
                        errorInvalidSplit: t.errorInvalidSplit,
                      }}
                    />
                  </div>

                )}
                {membersLoadError ? (
                  <p className={styles.copy} role="alert">
                    {t.loadError}
                  </p>
                ) : members.length > 0 ? (
                  <ManualExpenseForm
                    listId={listId}
                    currentUserId={session.user_id}
                    members={members}
                    defaultSplit={defaultSplit}
                    messages={{
                      expenseTitle: t.expenseTitle,
                      expenseAmount: t.expenseAmount,
                      expenseDescription: t.expenseDescription,
                      expensePayer: t.expensePayer,
                      expenseSubmit: t.expenseSubmit,
                      expenseSaving: t.expenseSaving,
                      expenseAdjustSplit: t.expenseAdjustSplit,
                      expenseModeWhole: t.expenseModeWhole,
                      expenseModeAbsolute: t.expenseModeAbsolute,
                      expenseModePercentage: t.expenseModePercentage,
                      expenseAssignee: t.expenseAssignee,
                      expenseOriginLabel: t.expenseOriginLabel,
                      expenseOriginBlank: t.expenseOriginBlank,
                      expenseOriginCash: t.expenseOriginCash,
                      errorGeneric: t.errorGeneric,
                      errorInvalidName: t.errorInvalidName,
                      errorForbidden: t.errorForbidden,
                      errorUnauthorized: t.errorUnauthorized,
                    }}
                  />
                ) : null}
                {isOwner && splitLoadError ? (
                  <p className={styles.copy} role="alert">
                    {t.errorDefaultSplitLoad}
                  </p>
                ) : null}
              </aside>
            </div>
          </ListDefaultSplitProvider>
        )}
      </div>
    </main>
  );
}
