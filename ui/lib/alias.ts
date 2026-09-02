import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApiInternalUrl } from "@/lib/api";

export type MeAccount = {
  user_id: string;
  email: string;
  alias: string | null;
  photo_base64: string | null;
};

/**
 * Server-side account read via api (forwards fh_session cookie).
 * Returns null when unauthenticated or upstream unreachable.
 */
export async function fetchMe(): Promise<MeAccount | null> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const response = await fetch(`${getApiInternalUrl()}/auth/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      user_id?: string;
      email?: string;
      alias?: string | null;
      photo_base64?: string | null;
    };
    if (!data.user_id) return null;
    return {
      user_id: data.user_id,
      email: data.email ?? "",
      alias: typeof data.alias === "string" && data.alias ? data.alias : null,
      photo_base64: typeof data.photo_base64 === "string" && data.photo_base64 ? data.photo_base64 : null,
    };
  } catch {
    return null;
  }
}

/** Setup URL carrying where to land once the alias is claimed. */
export function aliasSetupHref(returnTo: string): string {
  return `/alias?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * List chrome needs a person label, so an authenticated account without an
 * alias is sent to setup first. Verification-on and verification-off both land
 * here; the api enforces the same rule with `alias_required`.
 */
export async function requireAlias(returnTo: string): Promise<MeAccount> {
  const me = await fetchMe();
  if (!me) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (!me.alias) {
    redirect(aliasSetupHref(returnTo));
  }
  return me;
}
