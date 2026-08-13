import Link from "next/link";
import { redirect } from "next/navigation";

import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import { requireAlias } from "@/lib/alias";
import { resolveServerAuthenticatedLanding } from "@/lib/serverLanding";
import { fetchSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await fetchSession();
  if (session) {
    const destination = await resolveServerAuthenticatedLanding();
    // First signed-in visit (verify-off) must claim an alias before list chrome.
    await requireAlias(destination);
    redirect(destination);
  }

  return (
    <main className="flex flex-col gap-3 max-w-[36rem] mx-auto p-[4rem_1.5rem]">
      <RedirectIfAuthenticated />
      <p className="m-0 text-[0.85rem] uppercase tracking-[0.08em] text-muted">
        finance-helper
      </p>
      <h1 className="m-0 text-[2rem] font-semibold leading-[1.2]">Stack is up</h1>
      <p className="m-0 text-muted leading-[1.5]">
        Compose services <code className="font-mono text-[0.95em]">db</code>,{" "}
        <code className="font-mono text-[0.95em]">api</code>, and{" "}
        <code className="font-mono text-[0.95em]">ui</code> are ready.{" "}
        <Link href="/signup">Create an account</Link> or{" "}
        <Link href="/sign-in">sign in</Link> to get your personal list.
      </p>
    </main>
  );
}
