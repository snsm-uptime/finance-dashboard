import { redirect } from "next/navigation";

import { fetchSession } from "@/lib/session";
import { SessionReviewRoute } from "./SessionReviewRoute";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Entry point for an existing queued upload (clicked from UploadPanel's
 * list): loads the session and defers to SessionReviewPanel's fixed-list
 * auto-routing (Story 4.19) instead of assuming individual review.
 */
export default async function SessionReviewPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const session = await fetchSession();
  if (!session) {
    redirect(`/sign-in?returnTo=/upload/session/${encodeURIComponent(sessionId)}`);
  }

  const params2 = await searchParams;
  const boundListId = typeof params2.listId === "string" ? params2.listId : undefined;

  return <SessionReviewRoute sessionId={sessionId} boundListId={boundListId} />;
}
