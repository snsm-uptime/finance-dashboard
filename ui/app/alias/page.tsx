import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { fetchMe } from "@/lib/alias";
import { aliasMessages, detectLocale } from "@/lib/i18n/alias";
import { AliasSetupForm } from "./AliasSetupForm";
import { safeReturnTo } from "../sign-in/signInClient";
import styles from "../signup/signup.module.scss";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ returnTo?: string | string[] }>;

function resolveContinueHref(raw: string | string[] | undefined): string {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const safe = safeReturnTo(value);
  // Never bounce back into setup, and prefer lists over the marketing root.
  if (safe === "/" || safe.startsWith("/alias")) return "/lists";
  return safe;
}

/** Alias setup — the only app surface an authenticated user without an alias can reach. */
export default async function AliasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const continueHref = resolveContinueHref(params.returnTo);

  const me = await fetchMe();
  if (!me) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(continueHref)}`);
  }
  if (me.alias) {
    // Set-once: nothing to collect, so pass straight through (rename is deferred).
    redirect(continueHref);
  }

  const headerStore = await headers();
  const locale = detectLocale(headerStore.get("accept-language"));
  const t = aliasMessages[locale];

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.brand}>{t.brand}</p>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
        <AliasSetupForm messages={t} continueHref={continueHref} />
      </div>
    </main>
  );
}
