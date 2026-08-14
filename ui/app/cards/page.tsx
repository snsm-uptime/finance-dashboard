import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { CardsPanel } from "./CardsPanel";

export const dynamic = "force-dynamic";

/** Cards management page (Story 4.1) — auth-gated only, not alias-gated. */
export default async function CardsPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/cards");
  }

  return <CardsPanel />;
}
