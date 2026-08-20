import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { IndividualReviewPanel } from "./IndividualReviewPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Individual review — phone swipe / desktop buttons (Story 4.8). Auth-gated
 * only, same minimal-entry-point rationale as
 * ui/app/upload/bulk/[sessionId]/page.tsx — Story 4.6 does not build an
 * Upload mode picker.
 */
export default async function IndividualReviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/upload/review/${encodeURIComponent(sessionId)}`);
  }

  return <IndividualReviewPanel sessionId={sessionId} />;
}
