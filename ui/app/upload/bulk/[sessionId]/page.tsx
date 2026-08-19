import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { BulkReviewPanel } from "./BulkReviewPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Bulk review assign & commit (Story 4.7). Auth-gated only, same rationale
 * as ui/app/upload/page.tsx — this is a minimal entry point straight into
 * Bulk review since Story 4.6 does not (yet) build an Upload mode picker;
 * see this story's Completion Notes for the deviation note.
 */
export default async function BulkReviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/upload/bulk/${encodeURIComponent(sessionId)}`);
  }

  return <BulkReviewPanel sessionId={sessionId} />;
}
