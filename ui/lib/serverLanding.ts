import { cookies } from "next/headers";

import { getApiInternalUrl } from "@/lib/api";
import { resolveAuthenticatedLanding } from "@/lib/landing";

type MePayload = {
  last_opened_list_id?: string | null;
};

/**
 * Server-side first-paint path: revalidate last-opened via GET /lists/{id}
 * (authorize_list_access read_list on the API) — never an ad-hoc membership contains-check.
 */
export async function resolveServerAuthenticatedLanding(options?: {
  inviteListId?: string | null;
}): Promise<string> {
  if (options?.inviteListId) {
    return resolveAuthenticatedLanding({ inviteListId: options.inviteListId });
  }

  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let lastOpened: string | null = null;
  try {
    const meRes = await fetch(`${getApiInternalUrl()}/auth/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as MePayload;
      if (typeof me.last_opened_list_id === "string" && me.last_opened_list_id) {
        lastOpened = me.last_opened_list_id;
      }
    }
  } catch {
    lastOpened = null;
  }

  if (!lastOpened) {
    return resolveAuthenticatedLanding();
  }

  let accessible = false;
  try {
    const detail = await fetch(
      `${getApiInternalUrl()}/lists/${encodeURIComponent(lastOpened)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        cache: "no-store",
      },
    );
    accessible = detail.ok;
  } catch {
    accessible = false;
  }

  return resolveAuthenticatedLanding({
    lastOpenedListId: lastOpened,
    lastOpenedStillAccessible: accessible,
  });
}
