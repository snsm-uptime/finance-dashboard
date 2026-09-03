"use client";

import { useChromeHeader } from "@/components/ChromeBack";

/** Opts sign-in into AppShell's header only (no TabBar) — Back to the landing page. */
export function SignInChrome() {
  useChromeHeader({ backHref: "/", title: "Finance Helper" });
  return null;
}
