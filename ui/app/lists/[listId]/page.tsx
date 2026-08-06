import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountNavLink } from "@/components/AccountNavLink";
import { getApiInternalUrl } from "@/lib/api";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import { DefaultSplitPanel } from "../DefaultSplitPanel";
import { InviteForm } from "../InviteForm";
import type { DefaultSplitPayload } from "../listsClient";
import styles from "../lists.module.css";

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

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const header = await cookieHeader();

  let detail: DetailPayload | null = null;
  let defaultSplit: DefaultSplitPayload | null = null;
  let splitLoadError = false;
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
      const splitRes = await fetch(
        `${getApiInternalUrl()}/lists/${encodeURIComponent(listId)}/default-split`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(header ? { Cookie: header } : {}),
          },
          cache: "no-store",
        },
      );
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
    } else {
      loadError = true;
    }
  } catch {
    loadError = true;
  }

  const listTitle = detail?.name;
  const isOwner = Boolean(detail?.owner_id && detail.owner_id === session.user_id);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div className={styles.detailNavBrand}>
          <p className={styles.brand}>{t.brand}</p>
          {listTitle ? (
            <p className={styles.detailNavTitle}>{listTitle}</p>
          ) : null}
        </div>
        <AccountNavLink />
      </div>
      {notFound ? (
        <>
          <h1 className={styles.title}>{t.detailNotFound}</h1>
          <p className={styles.copy}>
            <Link className={styles.link} href="/lists">
              {t.backToLists}
            </Link>
          </p>
        </>
      ) : loadError || !listTitle ? (
        <>
          <h1 className={styles.title}>{t.loadError}</h1>
          <p className={styles.copy}>
            <Link className={styles.link} href="/lists">
              {t.backToLists}
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className={styles.copy}>
            <Link className={styles.link} href="/lists">
              {t.backToLists}
            </Link>
          </p>
          <section className={styles.detailSection} aria-labelledby="settle-heading">
            <h2 id="settle-heading" className={styles.sectionTitle}>
              {t.detailSettleTitle}
            </h2>
            <p className={styles.copy}>{t.detailSettleEmpty}</p>
          </section>
          <section
            className={styles.detailSection}
            aria-labelledby="receipts-heading"
          >
            <h2 id="receipts-heading" className={styles.sectionTitle}>
              {t.detailReceiptsTitle}
            </h2>
            <p className={styles.copy}>{t.detailReceiptsEmpty}</p>
          </section>
          {isOwner ? (
            <InviteForm
              listId={listId}
              messages={{
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
            />
          ) : null}
          {splitLoadError ? (
            <p className={styles.copy} role="alert">
              {t.errorDefaultSplitLoad}
            </p>
          ) : null}
          {defaultSplit ? (
            <DefaultSplitPanel
              listId={listId}
              isOwner={isOwner}
              initial={defaultSplit}
              messages={{
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
          ) : null}
        </>
      )}
    </main>
  );
}
