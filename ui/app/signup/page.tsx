import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import { detectLocale, signupMessages } from "@/lib/i18n/signup";
import { fetchSession } from "@/lib/session";
import { SignupForm } from "./SignupForm";
import styles from "./signup.module.css";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const session = await fetchSession();
  if (session) {
    redirect("/lists");
  }

  const headerStore = await headers();
  const locale = detectLocale(headerStore.get("accept-language"));
  const t = signupMessages[locale];

  return (
    <main className={styles.shell}>
      <RedirectIfAuthenticated />
      <div className={styles.card}>
        <p className={styles.brand}>{t.brand}</p>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
        <SignupForm locale={locale} />
      </div>
    </main>
  );
}
