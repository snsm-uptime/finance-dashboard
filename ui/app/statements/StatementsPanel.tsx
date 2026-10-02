"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useChromeHeader } from "@/components/ChromeBack";
import { ChromeAvatarLink } from "@/components/ChromeAvatarLink";
import { usePreferences } from "@/components/PreferencesProvider";
import { SpinnerIcon } from "@/app/icons";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
import { statementsCopy } from "@/lib/i18n/statements";
import { fetchStatementGroups, type StatementCardGroup, type StatementsClientMessages } from "./statementsClient";

type Props = {
  refreshToken?: number;
};

export function StatementsPanel({ refreshToken = 0 }: Props = {}) {
  const { locale, me } = usePreferences();
  const t = statementsCopy(locale);
  const router = useRouter();
  const [groups, setGroups] = useState<StatementCardGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useChromeHeader({
    leading: me ? (
      <ChromeAvatarLink alias={me.alias} userId={me.user_id} photoBase64={me.photo_base64} />
    ) : null,
    title: t.title,
    trailing: <DocsHelpButton pageName="Statements" docsAnchor="/docs#statements" />,
  });

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
      const result = await fetchStatementGroups(messages);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        setGroups([]);
      } else {
        setLoadError(null);
        setGroups(result.groups);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  if (loadError) {
    return (
      <main className="flex flex-col items-center justify-center p-4 min-h-screen">
        <p className="text-center text-muted mb-4">{loadError}</p>
      </main>
    );
  }

  const isEmpty = !loading && groups.length === 0;

  return (
    <main className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <SpinnerIcon className="size-6 text-muted" />
            <span className="ml-2 text-muted">{t.loading}</span>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-muted mb-4">{t.emptyState}</p>
            <a
              href="/upload"
              className="inline-block px-4 py-2 rounded bg-accent text-white hover:opacity-90 transition-opacity"
            >
              {t.emptyStateCta}
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.card_id || "no-card"}>
                <h2 className="text-lg font-semibold mb-3 px-2">
                  {group.card_label ?? t.noCardGroupLabel}
                </h2>
                <ul className="space-y-2">
                  {group.statements.map((stmt) => (
                    <li key={stmt.statement_id}>
                      <button
                        onClick={() => router.push(`/statements/${stmt.statement_id}`)}
                        className="w-full text-left p-3 rounded border border-border hover:bg-surface transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm text-muted">
                              {stmt.period_start} to {stmt.period_end}
                            </div>
                            <div className="text-xs text-muted mt-1">
                              {stmt.item_count} {t.periodSummaryItemCount}
                            </div>
                            {stmt.destination_list_names.filter(Boolean).length > 0 && (
                              <div className="text-xs text-muted mt-1">
                                {t.periodSummaryDestination}: {stmt.destination_list_names.filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
