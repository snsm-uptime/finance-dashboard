"use client";

import { usePathname, useRouter } from "next/navigation";

import { IconButton } from "@/components/IconButton";
import { HelpIcon } from "@/app/icons";

type DocsHelpButtonProps = {
  /** Page name inserted into the accessible name, e.g. "Lists" -> "Learn more about Lists". */
  pageName: string;
  /** Target `/docs#<anchor>` section for this page. */
  docsAnchor: string;
};

/**
 * Icon-only header button that deep-links to this page's matching /docs
 * section (Story 8.3). Carries the current page as a `?from=` query param so
 * `/docs`'s own chrome Back button can return here instead of always
 * bouncing to the landing page — plain visits to `/docs` (e.g. the landing
 * page's own link) don't set `from`, so Back there still goes to `/`.
 */
export function DocsHelpButton({ pageName, docsAnchor }: DocsHelpButtonProps) {
  const router = useRouter();
  const pathname = usePathname();

  function onClick() {
    const [path, hash] = docsAnchor.split("#");
    const from = encodeURIComponent(pathname ?? "/");
    router.push(`${path}?from=${from}${hash ? `#${hash}` : ""}`);
  }

  return (
    <IconButton
      icon={<HelpIcon className="size-5" />}
      label={`Learn more about ${pageName}`}
      onClick={onClick}
    />
  );
}
