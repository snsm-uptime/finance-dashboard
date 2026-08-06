"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Client guard for back/forward cache: if a session cookie is still valid,
 * bounce auth pages back to lists without requiring a full reload.
 */
export function RedirectIfAuthenticated({ to = "/" }: { to?: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!cancelled && response.ok) {
          router.replace(to);
          router.refresh();
        }
      } catch {
        // stay on page if session check fails
      }
    }

    void check();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void check();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router, to]);

  return null;
}
