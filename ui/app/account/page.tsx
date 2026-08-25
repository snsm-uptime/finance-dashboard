import { redirect } from "next/navigation";

import { AccountMenu } from "@/components/AccountMenu";
import { fetchSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Minimal Account menu (UX-DR10) — language, theme, default review list, password reset, sign out. */
export default async function AccountPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/account");
  }

  return <AccountMenu />;
}
