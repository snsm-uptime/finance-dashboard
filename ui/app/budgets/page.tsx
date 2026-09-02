import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireAlias } from "@/lib/alias";
import { listsMessages } from "@/lib/i18n/lists";
import type { Locale } from "@/lib/i18n/locale";
import { fetchSession } from "@/lib/session";
import listsStyles from "@/app/lists/lists.module.scss";
import { BudgetsPanel } from "./BudgetsPanel";

export const dynamic = "force-dynamic";

function resolvePageLocale(languageCookie: string | undefined): Locale {
  if (languageCookie === "es" || languageCookie === "en") return languageCookie;
  return "en";
}

/** Standalone /budgets route (Story 7.1) — same auth/alias-gate shape as /home. */
export default async function BudgetsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/budgets");
  }
  await requireAlias("/budgets");

  const jar = await cookies();
  const locale = resolvePageLocale(jar.get("fh_lang_cache")?.value);
  const t = listsMessages[locale];

  return (
    <main className={listsStyles.main}>
      <div>
        <h1 className={listsStyles.title}>{t.budgetsTitle}</h1>
      </div>
      <BudgetsPanel />
    </main>
  );
}
