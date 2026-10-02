"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { useChromeHeader } from "@/components/ChromeBack";
import { usePreferences } from "@/components/PreferencesProvider";
import { SpinnerIcon } from "@/app/icons";
import { statementsCopy } from "@/lib/i18n/statements";
import { fetchStatementSummary, type StatementSummary, type StatementsClientMessages } from "../statementsClient";
import { StatementSummaryCard } from "./StatementSummaryCard";
import listsStyles from "@/app/lists/lists.module.scss";

/**
 * Period summary page — shows statement dates, item count, destination list(s),
 * and a "View items" button that navigates to the retouch view.
 *
 * Focus management: captures focus on the "View items" button before navigating,
 * so returning via back navigation can restore it (AC #4 requirement).
 */
export default function StatementDetailPage() {
  const params = useParams<{ statementId: string }>();
  const statementId = params.statementId;
  const { locale } = usePreferences();
  const t = statementsCopy(locale);
  useChromeHeader({ title: "Statement" });

  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messages: StatementsClientMessages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
    }),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!statementId) return;
      const result = await fetchStatementSummary(statementId, messages);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        setSummary(null);
      } else {
        setLoadError(null);
        setSummary(result.summary);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementId]);

  if (loadError) {
    return (
      <main className={listsStyles.main}>
        <div className="flex flex-col items-center justify-center p-4 min-h-screen">
          <p className="text-center text-muted mb-4">{loadError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className={listsStyles.main}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <SpinnerIcon className="size-6 text-muted" />
              <span className="ml-2 text-muted">{t.loading}</span>
            </div>
          ) : summary ? (
            <div className="max-w-md mx-auto">
              <StatementSummaryCard summary={summary} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted">{t.errorGeneric}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
