import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApiInternalUrl } from "@/lib/api";
import { fetchSession } from "@/lib/session";
import { asImportSession, type ImportSession } from "./uploadClient";
import { UploadPanel } from "./UploadPanel";

export const dynamic = "force-dynamic";

async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

async function fetchActiveImportSessionOnServer(): Promise<ImportSession | null> {
  try {
    const response = await fetch(`${getApiInternalUrl()}/import/sessions/active`, {
      headers: {
        Accept: "application/json",
        Cookie: await cookieHeader(),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("fetchActiveImportSessionOnServer: upstream error", response.status);
      return null;
    }
    const body: unknown = await response.json();
    if (body === null) return null;
    return asImportSession(body);
  } catch (error) {
    console.error("fetchActiveImportSessionOnServer: request failed", error);
    return null;
  }
}

/** Upload PDF → detect/split → Import Session (Story 4.6). Auth-gated only —
 * upload is a global entry point (EXPERIENCE.md), not list-scoped, so no
 * alias gate here (mirrors api's import_sessions router). */
export default async function UploadPage() {
  const session = await fetchSession();
  if (!session) {
    redirect("/sign-in?returnTo=/upload");
  }

  const initialSession = await fetchActiveImportSessionOnServer();
  return <UploadPanel initialSession={initialSession} />;
}
