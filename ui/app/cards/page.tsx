import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAlias } from "@/lib/alias";
import { cardsCopy } from "@/lib/i18n/cards";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import listsStyles from "@/app/lists/lists.module.scss";
import { CardsPanel } from "./CardsPanel";

export const dynamic = "force-dynamic";

function resolvePageLocale(languageCookie: string | undefined): Locale {
  if (languageCookie === "es" || languageCookie === "en") return languageCookie;
  return "en";
}

/** Standalone /cards route — card registration/routing, moved off Home. */
export default async function CardsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/cards");
  }
  await requireAlias("/cards");

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = cardsCopy(locale);

  return (
    <main className={listsStyles.main}>
      <div>
        <h1 className={listsStyles.title}>{t.title}</h1>
        <p className={listsStyles.copy}>{t.subtitle}</p>
      </div>
      <CardsPanel />
    </main>
  );
}
