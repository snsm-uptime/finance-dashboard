import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccountNavLink } from "@/components/AccountNavLink";
import { getApiInternalUrl } from "@/lib/api";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import { ListsPanel } from "./ListsPanel";
import type { ListItem } from "./listsClient";
import styles from "./lists.module.css";

export const dynamic = "force-dynamic";

type MembershipLoad =
  | { ok: true; lists: ListItem[] }
  | { ok: false };

async function fetchMembershipLists(): Promise<MembershipLoad> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const response = await fetch(`${getApiInternalUrl()}/lists`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) return { ok: false };
    const data = (await response.json()) as { lists?: ListItem[] };
    if (!Array.isArray(data.lists)) return { ok: false };
    return { ok: true, lists: data.lists };
  } catch {
    return { ok: false };
  }
}

function resolvePageLocale(languageCookie: string | undefined): Locale {
  if (languageCookie === "es" || languageCookie === "en") return languageCookie;
  return "en";
}

/** Minimal Lists surface with create/rename (Story 2.1). Homepage polish = 2.2. */
export default async function ListsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/lists");
  }

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const loaded = await fetchMembershipLists();

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.brand}>{t.brand}</p>
        <AccountNavLink />
      </div>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.copy}>{t.subtitle}</p>
      {loaded.ok ? (
        <ListsPanel
          initialLists={loaded.lists}
          currentUserId={session.user_id}
        />
      ) : (
        <p className={styles.error} role="alert">
          {t.loadError}
        </p>
      )}
      <p className={styles.copy}>
        <a className={styles.link} href="/upload">
          {t.uploadLink}
        </a>{" "}
        {t.uploadHint}
      </p>
    </main>
  );
}
