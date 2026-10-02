import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { IndividualReviewPanel } from "./IndividualReviewPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Individual review, restored on the row-level endpoints (Story 4.13).
 * Auth-gated only, same rationale as ui/app/upload/bulk/[sessionId]/page.tsx.
 */
export default async function IndividualReviewPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/upload/review/${encodeURIComponent(sessionId)}`);
  }

  const params2 = await searchParams;
  const boundListId = typeof params2.listId === "string" ? params2.listId : undefined;

  return <IndividualReviewPanel sessionId={sessionId} boundListId={boundListId} />;
}
