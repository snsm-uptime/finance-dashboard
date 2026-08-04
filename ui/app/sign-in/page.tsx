import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import { detectLocale, signInMessages } from "@/lib/i18n/signin";
import { fetchSession } from "@/lib/session";
import { SignInForm } from "./SignInForm";
import styles from "../signup/signup.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ returnTo?: string | string[] }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await fetchSession();
  if (session) {
    redirect("/lists");
  }

  const params = await searchParams;
  const rawReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;

  const headerStore = await headers();
  const locale = detectLocale(headerStore.get("accept-language"));
  const t = signInMessages[locale];

  return (
    <main className={styles.shell}>
      <RedirectIfAuthenticated />
      <div className={styles.card}>
        <p className={styles.brand}>{t.brand}</p>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
        <SignInForm locale={locale} returnTo={rawReturnTo} />
      </div>
    </main>
  );
}
