"use client";

import { useRouter } from "next/navigation";

import { usePreferences } from "@/components/PreferencesProvider";
import { uploadCopy } from "@/lib/i18n/upload";
import type { ImportSession } from "../../uploadClient";

type ImportCompletionSummaryProps = {
  session: ImportSession;
};

export function ImportCompletionSummary({ session }: ImportCompletionSummaryProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const router = useRouter();

  function onContinue() {
    // Story 5.7 conflict review inserts after this summary and before land.
    const landing = session.landing_list_id;
    router.push(landing ? `/lists/${encodeURIComponent(landing)}` : "/lists");
  }

  return (
    <section
      aria-label={t.completionTitle}
      className="mx-auto flex w-full max-w-[26rem] flex-col gap-4 px-[1.5rem] py-[2rem]"
    >
      <h1 className="m-0 text-[1.15rem] font-[550]">{t.completionTitle}</h1>
      <ul className="m-0 list-none p-0 text-[0.95rem] leading-relaxed">
        {session.committed_by_list.map((group) => (
          <li key={group.list_id} className="mb-2">
            {t.completionImportedToList
              .replace("{count}", String(group.count))
              .replace("{list}", group.name)}
          </li>
        ))}
        <li className="mb-2">
          {t.completionDeleted.replace("{count}", String(session.deleted_count))}
        </li>
        <li className="mb-2">
          {t.completionZeroExcluded.replace(
            "{count}",
            String(session.zero_amount_excluded_count),
          )}
        </li>
        {session.failed_statements.map((failed) => (
          <li key={failed.id} className="mb-2">
            {t.completionFailedStatement.replace(
              "{filename}",
              failed.filename || failed.product_id,
            )}
          </li>
        ))}
        <li className="mb-2">
          {t.completionImportedNew.replace("{count}", String(session.imported_new_count))}
        </li>
        <li>
          {t.completionSkippedDuplicate.replace(
            "{count}",
            String(session.skipped_duplicate_count),
          )}
        </li>
      </ul>
      <button
        type="button"
        className="inline-flex items-center justify-center self-start rounded-sm border-none bg-accent px-3 py-[9px] text-[0.95rem] font-[550] text-on-accent"
        onClick={onContinue}
      >
        {t.completionContinue}
      </button>
    </section>
  );
}
