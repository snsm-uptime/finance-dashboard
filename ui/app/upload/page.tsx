import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { UploadPanel } from "./UploadPanel";

export const dynamic = "force-dynamic";

/** Upload PDF → detect/split → Import Session (Story 4.6). Auth-gated only —
 * upload is a global entry point (EXPERIENCE.md), not list-scoped, so no
 * alias gate here (mirrors api's import_sessions router). */
export default async function UploadPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/upload");
  }

  return <UploadPanel />;
}
