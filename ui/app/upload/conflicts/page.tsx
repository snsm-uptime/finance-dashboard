import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { ConflictReviewPanel } from "./ConflictReviewPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ landingListId?: string }>;
};

/**
 * End-of-import same-price conflict review (Story 5.5). Reached from
 * IndividualReviewPanel/BulkReviewPanel post-finalize/commit when the
 * queue is non-empty — sits before Soft-Ledger, never after (UX-DR22).
 */
export default async function ConflictReviewPage({ searchParams }: PageProps) {
  const session = await fetchSession();
  const { landingListId } = await searchParams;
  if (!session) {
    redirect("/sign-in?returnTo=/upload/conflicts");
  }

  return <ConflictReviewPanel landingListId={landingListId ?? null} />;
}
