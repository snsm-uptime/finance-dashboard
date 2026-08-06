import Link from "next/link";
import { redirect } from "next/navigation";

import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import { resolveServerAuthenticatedLanding } from "@/lib/serverLanding";
import { fetchSession } from "@/lib/session";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await fetchSession();
  if (session) {
    redirect(await resolveServerAuthenticatedLanding());
  }

  return (
    <main className={styles.main}>
      <RedirectIfAuthenticated />
      <p className={styles.brand}>finance-helper</p>
      <h1 className={styles.title}>Stack is up</h1>
      <p className={styles.copy}>
        Compose services <code>db</code>, <code>api</code>, and <code>ui</code> are
        ready.{" "}
        <Link href="/signup">Create an account</Link> or{" "}
        <Link href="/sign-in">sign in</Link> to get your personal list.
      </p>
    </main>
  );
}
