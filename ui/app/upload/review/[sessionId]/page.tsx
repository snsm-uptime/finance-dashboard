import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { IndividualReviewPanel } from "./IndividualReviewPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Individual review, restored on the row-level endpoints (Story 4.13).
 * Auth-gated only, same rationale as ui/app/upload/bulk/[sessionId]/page.tsx.
 */
export default async function IndividualReviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/upload/review/${encodeURIComponent(sessionId)}`);
  }

  return <IndividualReviewPanel sessionId={sessionId} />;
}
