import { redirect } from "next/navigation";

import { requireAlias } from "@/lib/alias";
import { fetchSession } from "@/lib/session";
import listsStyles from "@/app/lists/lists.module.scss";
import { BudgetsPanel } from "./BudgetsPanel";

export const dynamic = "force-dynamic";

/**
 * Standalone /budgets route (Story 7.1) — same auth/alias-gate shape as /home.
 * Title/avatar/help chrome is owned by BudgetsPanel's useChromeHeader call
 * (chrome-header spec) — no page-local header markup here.
 */
export default async function BudgetsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/budgets");
  }
  await requireAlias("/budgets");

  return (
    <main className={listsStyles.main}>
      <BudgetsPanel />
    </main>
  );
}
