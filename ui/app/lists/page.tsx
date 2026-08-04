import { redirect } from "next/navigation";

import { AccountNavLink } from "@/components/AccountNavLink";
import { fetchSession } from "@/lib/session";
import styles from "./lists.module.css";

export const dynamic = "force-dynamic";

/** Minimal Lists homepage first-paint (EXPERIENCE). Empty-state copy not journeyed. */
export default async function ListsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/lists");
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.brand}>finance-helper</p>
        <AccountNavLink />
      </div>
      <h1 className={styles.title}>Lists</h1>
      <p className={styles.copy}>
        Your personal list is ready. Shared lists and invites land in later
        stories.
      </p>
      <p className={styles.copy}>
        <a className={styles.link} href="/upload">
          Upload
        </a>{" "}
        (protected stub — statement import lands in Epic 4).
      </p>
    </main>
  );
}
