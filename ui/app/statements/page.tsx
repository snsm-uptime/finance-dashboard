import { redirect } from "next/navigation";

import { requireAlias } from "@/lib/alias";
import { fetchSession } from "@/lib/session";
import listsStyles from "@/app/lists/lists.module.scss";
import { StatementsPanel } from "./StatementsPanel";

export const dynamic = "force-dynamic";

/**
 * Standalone /statements route — statement browsing by card/IBAN group.
 * Title/avatar/help chrome is owned by StatementsPanel's useChromeHeader call
 * (chrome-header spec) — no page-local header markup here.
 */
export default async function StatementsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/statements");
  }
  await requireAlias("/statements");

  return (
    <main className={listsStyles.main}>
      <StatementsPanel />
    </main>
  );
}
