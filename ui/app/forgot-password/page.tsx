import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { detectLocale } from "@/lib/i18n/signin";
import { passwordResetMessages } from "@/lib/i18n/password-reset";
import { fetchSession } from "@/lib/session";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import styles from "../signup/signup.module.css";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const session = await fetchSession();
  if (session) {
    redirect("/lists");
  }

  const headerStore = await headers();
  const locale = detectLocale(headerStore.get("accept-language"));
  const t = passwordResetMessages[locale];

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.brand}>{t.brand}</p>
        <h1 className={styles.title}>{t.forgotTitle}</h1>
        <p className={styles.subtitle}>{t.forgotSubtitle}</p>
        <ForgotPasswordForm locale={locale} />
      </div>
    </main>
  );
}
