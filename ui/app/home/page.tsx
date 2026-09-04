import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAlias } from "@/lib/alias";
import { getApiInternalUrl } from "@/lib/api";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import { ListsPanel } from "@/app/lists/ListsPanel";
import type { ListItem } from "@/app/lists/listsClient";
import listsStyles from "@/app/lists/lists.module.scss";
import { HomeChrome } from "./HomeChrome";

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

/** Home: Lists only — Cards moved to its own /cards route. */
export default async function Home() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/home");
  }
  // No list chrome without an alias — redirects to setup on first signed-in visit.
  const me = await requireAlias("/home");

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];
  const loaded = await fetchMembershipLists();

  return (
    <main className={listsStyles.main}>
      <HomeChrome
        title={t.title}
        alias={me.alias}
        userId={me.user_id}
        photoBase64={me.photo_base64}
      />

      {loaded.ok ? (
        <ListsPanel initialLists={loaded.lists} currentUserId={session.user_id} />
      ) : (
        <p className={listsStyles.error} role="alert">
          {t.loadError}
        </p>
      )}
    </main>
  );
}
