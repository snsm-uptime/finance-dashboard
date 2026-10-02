"use client";

import { useRouter } from "next/navigation";

import { useChromeHeader } from "@/components/ChromeBack";
import listsStyles from "@/app/lists/lists.module.scss";

/**
 * Minimal shell for the retouch list — Story 12.1 creates this with just the
 * heading and back-nav plumbing (focus management for AC #4). The actual list
 * content (ReceiptRow, edit/delete/move actions, live-region announcements) is
 * Story 12.2's scope and will be filled in-place here.
 */
export default function StatementItemsPage() {
  const router = useRouter();

  useChromeHeader({
    title: "Items",
    onBack: () => {
      router.back();
    },
  });

  return (
    <main className={listsStyles.main}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {/* TODO: Story 12.2 — render statement retouch list here */}
          <ul>{/* Statement item rows will be added in Story 12.2 */}</ul>
        </div>
      </div>
    </main>
  );
}
