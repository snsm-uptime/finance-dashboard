import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Individual review is superseded by row-level review (Story 4.10). The
 * statement-level API endpoints this page's buttons called (`/commit`,
 * `/skip`) are deleted, so rendering IndividualReviewPanel here would show a
 * fully-working UI whose every action 404s. Task 7.1 hid the entry Link in
 * UploadPanel; this closes the direct-URL / bookmark / back-button path too.
 *
 * IndividualReviewPanel.tsx is intentionally left in the tree — Story 4.13
 * rewrites it against the row-level endpoints and restores this route.
 */
export default async function IndividualReviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  redirect(`/upload/bulk/${encodeURIComponent(sessionId)}`);
}
