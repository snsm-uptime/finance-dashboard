"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

import { statementsCopy } from "@/lib/i18n/statements";
import { usePreferences } from "@/components/PreferencesProvider";
import { StatementSummary } from "../statementsClient";

type Props = {
  summary: StatementSummary;
};

export function StatementSummaryCard({ summary }: Props) {
  const { locale } = usePreferences();
  const t = statementsCopy(locale);
  const router = useRouter();
  const viewItemsButtonRef = useRef<HTMLButtonElement>(null);

  function handleViewItems() {
    // Capture the button element for focus restoration on back
    const button = viewItemsButtonRef.current;
    if (button) {
      sessionStorage.setItem(
        `statement-${summary.statement_id}-focus-return`,
        "true"
      );
    }
    router.push(`/statements/${summary.statement_id}/items`);
  }

  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold mb-2">Period</h2>
          <p className="text-sm text-muted">
            {summary.period_start} to {summary.period_end}
          </p>
        </div>

        <div>
          <h3 className="text-base font-semibold mb-2">{t.periodSummaryItemCount}</h3>
          <p className="text-sm text-muted">{summary.item_count} items</p>
        </div>

        {summary.destination_list_names.length > 0 && (
          <div>
            <h3 className="text-base font-semibold mb-2">{t.periodSummaryDestination}</h3>
            <ul className="text-sm text-muted space-y-1">
              {summary.destination_list_names.map((name, idx) => (
                <li key={idx}>{name || "Unknown list"}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          ref={viewItemsButtonRef}
          onClick={handleViewItems}
          className="w-full mt-4 px-4 py-2 rounded bg-accent text-white hover:opacity-90 transition-opacity"
        >
          {t.viewItemsAction}
        </button>
      </div>
    </div>
  );
}
