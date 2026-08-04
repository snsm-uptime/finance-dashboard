import { headers } from "next/headers";

import { detectLocale } from "@/lib/i18n/signin";
import { verifyMessages } from "@/lib/i18n/verify";
import { VerifyForm } from "./VerifyForm";
import styles from "../signup/signup.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ token?: string | string[] }>;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] ?? "" : "";

  const headerStore = await headers();
  const locale = detectLocale(headerStore.get("accept-language"));
  const t = verifyMessages[locale];

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.brand}>{t.brand}</p>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
        <VerifyForm locale={locale} token={token} />
      </div>
    </main>
  );
}
