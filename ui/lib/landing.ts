/**
 * First-paint / post-auth landing choke (UX-DR9).
 * Story 2.4 passes inviteListId to land on the inviting list instead of remember-last.
 */
export type AuthenticatedLandingInput = {
  inviteListId?: string | null;
  lastOpenedListId?: string | null;
  lastOpenedStillAccessible?: boolean;
};

export function resolveAuthenticatedLanding(
  input: AuthenticatedLandingInput = {},
): string {
  const invite = input.inviteListId?.trim();
  if (invite) {
    return `/lists/${encodeURIComponent(invite)}`;
  }
  const remembered = input.lastOpenedListId?.trim();
  if (remembered && input.lastOpenedStillAccessible) {
    return `/lists/${encodeURIComponent(remembered)}`;
  }
  return "/home";
}
