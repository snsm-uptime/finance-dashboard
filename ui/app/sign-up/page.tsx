import { redirect } from "next/navigation";

/**
 * Legacy deep-link alias from Story 2.3 emails that used `/sign-up?invite=`.
 * As-built signup route is `/signup`.
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacySignUpRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const query = qs.toString();
  redirect(query ? `/signup?${query}` : "/signup");
}
