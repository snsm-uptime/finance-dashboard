import { redirect } from "next/navigation";

import { requireAlias } from "@/lib/alias";
import { fetchSession } from "@/lib/session";
import listsStyles from "@/app/lists/lists.module.scss";
import { CardsPanel } from "./CardsPanel";

export const dynamic = "force-dynamic";

/**
 * Standalone /cards route — card registration/routing, moved off Home.
 * Title/avatar/help chrome is owned by CardsPanel's useChromeHeader call
 * (chrome-header spec) — no page-local header markup here.
 */
export default async function CardsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/cards");
  }
  await requireAlias("/cards");

  return (
    <main className={listsStyles.main}>
      <CardsPanel />
    </main>
  );
}
