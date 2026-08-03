import { cookies } from "next/headers";

import { getApiInternalUrl } from "@/lib/api";

export type SessionInfo = {
  authenticated: true;
  user_id: string;
};

/**
 * Server-side session check via api (forwards fh_session cookie).
 * Returns null when unauthenticated or upstream unreachable.
 */
export async function fetchSession(): Promise<SessionInfo | null> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const response = await fetch(`${getApiInternalUrl()}/auth/session`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      authenticated?: boolean;
      user_id?: string;
    };
    if (!data.authenticated || !data.user_id) {
      return null;
    }
    return { authenticated: true, user_id: data.user_id };
  } catch {
    return null;
  }
}
