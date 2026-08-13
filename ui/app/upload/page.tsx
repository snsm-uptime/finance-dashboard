import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountNavLink } from "@/components/AccountNavLink";
import { requireAlias } from "@/lib/alias";
import { fetchSession } from "@/lib/session";
import styles from "../lists/lists.module.scss";

export const dynamic = "force-dynamic";

/** Protected upload entry stub — full import pipeline is Epic 4. */
export default async function UploadPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/upload");
  }
  await requireAlias("/upload");

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.brand}>finance-helper</p>
        <AccountNavLink />
      </div>
      <h1 className={styles.title}>Upload</h1>
      <p className={styles.copy}>
        Statement upload lands in Epic 4. This route is auth-gated so sign-out
        can be verified now.
      </p>
      <p className={styles.copy}>
        <Link className={styles.link} href="/lists">
          Back to lists
        </Link>
      </p>
    </main>
  );
}
