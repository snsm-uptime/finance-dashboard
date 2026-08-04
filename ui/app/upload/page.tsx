import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/SignOutButton";
import { fetchSession } from "@/lib/session";
import styles from "../lists/lists.module.css";

export const dynamic = "force-dynamic";

/** Protected upload entry stub — full import pipeline is Epic 4. */
export default async function UploadPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/upload");
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.brand}>finance-helper</p>
        <SignOutButton />
      </div>
      <h1 className={styles.title}>Upload</h1>
      <p className={styles.copy}>
        Statement upload lands in Epic 4. This route is auth-gated so sign-out
        can be verified now.
      </p>
      <p className={styles.copy}>
        <a className={styles.link} href="/lists">
          Back to lists
        </a>
      </p>
    </main>
  );
}
