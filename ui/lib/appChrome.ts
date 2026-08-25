import type { TabKey } from "@/components/soft-ledger/TabBar";

const APP_CHROME_PREFIXES = ["/home", "/lists", "/upload", "/account"] as const;

/** Authenticated product surfaces that keep the bottom tab bar mounted. */
export function showsAppChrome(pathname: string): boolean {
  return APP_CHROME_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function tabKeyFromPath(pathname: string): TabKey | undefined {
  if (
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/lists" ||
    pathname.startsWith("/lists/")
  ) {
    return "home";
  }
  if (pathname === "/upload" || pathname.startsWith("/upload/")) return "upload";
  if (pathname === "/account" || pathname.startsWith("/account/")) return "account";
  return undefined;
}
