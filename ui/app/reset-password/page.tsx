import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { detectLocale } from "@/lib/i18n/signin";
import { passwordResetMessages } from "@/lib/i18n/password-reset";
import { resolveServerAuthenticatedLanding } from "@/lib/serverLanding";
import { fetchSession } from "@/lib/session";
import { ResetPasswordForm } from "./ResetPasswordForm";
import styles from "../signup/signup.module.scss";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ token?: string | string[] }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await fetchSession();
  if (session) {
    redirect(await resolveServerAuthenticatedLanding());
  }

  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = typeof rawToken === "string" ? rawToken : "";

  const headerStore = await headers();
  const locale = detectLocale(headerStore.get("accept-language"));
  const t = passwordResetMessages[locale];

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t.resetTitle}</h1>
        <p className={styles.subtitle}>{t.resetSubtitle}</p>
        <ResetPasswordForm locale={locale} token={token} />
      </div>
    </main>
  );
}
