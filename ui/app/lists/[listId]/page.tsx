import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BalanceStrip, type BalancePolarity } from "@/components/soft-ledger/BalanceStrip";
import { Hint } from "@/components/soft-ledger/Hint";
import { ReceiptRow } from "@/components/soft-ledger/ReceiptRow";
import { SectionLabel } from "@/components/soft-ledger/SectionLabel";
import { TabBar } from "@/components/soft-ledger/TabBar";
import { TopNav } from "@/components/soft-ledger/TopNav";
import { requireAlias } from "@/lib/alias";
import { getApiInternalUrl } from "@/lib/api";
import { accountCopy } from "@/lib/i18n/account";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import { ListDetailMobileActions } from "../ListDetailMobileActions";
import { ManualExpenseForm } from "../ManualExpenseForm";
import { TemporalNavigation } from "../TemporalNavigation";
import { balanceTone, type DefaultSplitPayload, type ExpenseItem, type ListMember } from "../listsClient";
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

type BalancesPayload = {
  list_id: string;
  balance_crc: string;
};

function asBalances(data: unknown): BalancesPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<BalancesPayload>;
  if (typeof row.list_id !== "string") {
    return null;
  }
  const balanceCrc = typeof row.balance_crc === "string" ? row.balance_crc : String(row.balance_crc);
  if (!balanceCrc || balanceCrc === "undefined") {
    return null;
  }
  return { list_id: row.list_id, balance_crc: balanceCrc };
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
      typeof e.list_id !== "string"
    ) {
      continue;
    }
    out.push(e as ExpenseItem);
  }
  return out;
}

/** Soft-Ledger plain CRC voice (UX-DR17) — e.g. ₡10.00 / ₡42,500. */
function formatCrcAmount(amount: string): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return `₡${amount}`;
  const formatted = parsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `₡${formatted}`;
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
  const account = accountCopy(locale);
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
  const navTitle = showListDetail ? (listTitle as string) : "";
  const stripProps = balanceStripPropsFrom(
    expenses.length > 0,
    balancesLoadError,
    balances?.balance_crc,
    t,
  );

  return (
    <main className={styles.softMain}>
      <TopNav brand={t.brand} listTitle={navTitle} />
      <div className={styles.softBody}>
        {notFound ? (
          <>
            <h1 className={styles.title}>{t.detailNotFound}</h1>
            <p className={`${styles.copy} ${styles.softBack}`}>
              <Link className={styles.link} href="/lists">
                {t.backToLists}
              </Link>
            </p>
          </>
        ) : !showListDetail ? (
          <>
            <h1 className={styles.title}>{t.loadError}</h1>
            <p className={`${styles.copy} ${styles.softBack}`}>
              <Link className={styles.link} href="/lists">
                {t.backToLists}
              </Link>
            </p>
          </>
        ) : (
          <div className={styles.detailLayout}>
            <div className={styles.detailPrimary}>
              <BalanceStrip
                who={stripProps.who}
                amount={stripProps.amount}
                polarity={stripProps.polarity}
              />
              {expenses.length === 0 && !expensesLoadError ? (
                <Hint>{t.detailHintEmpty}</Hint>
              ) : null}
              <div className={styles.softReceipts}>
                <SectionLabel>{t.detailReceiptsTitle}</SectionLabel>
                {expensesLoadError ? (
                  <p className={styles.copy} role="alert">
                    {t.loadError}
                  </p>
                ) : expenses.length === 0 ? (
                  <ReceiptRow emptyLabel={t.detailReceiptsEmpty} />
                ) : (
                  expenses.map((e) => (
                    <ReceiptRow
                      key={e.id}
                      title={e.description}
                      when={e.posted_date}
                      amount={formatCrcAmount(e.amount)}
                    />
                  ))
                )}
              </div>
              <p className={`${styles.copy} ${styles.mobileBack}`}>
                <Link className={styles.link} href="/lists">
                  {t.backToLists}
                </Link>
              </p>
            </div>
            <aside className={styles.detailSidebar}>
              {members.length > 0 && (
                <h1 className={styles.expenseTitle}>
                  <span>{listTitle}</span>
                </h1>
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
                    errorGeneric: t.errorGeneric,
                    errorInvalidName: t.errorInvalidName,
                    errorForbidden: t.errorForbidden,
                    errorUnauthorized: t.errorUnauthorized,
                  }}
                />
              ) : null}
              {members.length > 0 && (
                <TemporalNavigation
                  listId={listId}
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
              )}
              {isOwner && splitLoadError ? (
                <p className={styles.copy} role="alert">
                  {t.errorDefaultSplitLoad}
                </p>
              ) : null}
              <p className={styles.copy}>
                <Link className={styles.link} href="/lists">
                  {t.backToLists}
                </Link>
              </p>
            </aside>
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
          </div>
        )}
      </div>
      <TabBar
        listHref={`/lists/${encodeURIComponent(listId)}`}
        uploadHref="/upload"
        accountHref="/account"
        listLabel={t.tabList}
        uploadLabel={t.uploadLink}
        accountLabel={account.navAccount}
        ariaLabel={t.tabNavAria}
        active="list"
      />
    </main>
  );
}
