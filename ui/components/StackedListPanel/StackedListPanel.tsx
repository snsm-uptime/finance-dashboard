import type { ReactNode } from "react";
import { SpinnerIcon } from "@/app/icons";

const DEFAULT_WRAPPER_CLASS = "relative flex flex-col gap-2";
const DEFAULT_LIST_CLASS = "list-none m-0 p-0 flex flex-col gap-2";
const DEFAULT_ITEM_CLASS =
  "py-[0.6rem] px-[0.85rem] rounded-[8px] border border-border bg-surface";
const DEFAULT_LOADING_CLASS = "flex justify-center py-2 text-muted";
const DEFAULT_ERROR_CLASS = "text-owe text-[0.9rem]";
const DEFAULT_EMPTY_CLASS = "text-muted text-[0.85rem]";

export type StackedListPanelProps<T> = {
  ariaLabel?: string;
  wrapperClassName?: string;
  /** Ghost-styled input/form rendered above the stack (e.g. RegisterCardForm). */
  input: ReactNode;
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  itemClassName?: string;
  listClassName?: string;
  loading?: boolean;
  loadingLabel?: string;
  loadingClassName?: string;
  error?: string | null;
  errorClassName?: string;
  emptyLabel?: string;
  emptyClassName?: string;
  /** sr-only aria-live announcement, e.g. "Card registered". */
  liveRegionText?: string;
};

/**
 * Ghost input above a vertically stacked list, extracted from the cards
 * section on Home. Each item renders inside a wrapper row via `renderItem`.
 * Class name props default to the cards styling; pass overrides to match a
 * different visual treatment (e.g. lists.module.scss).
 */
export function StackedListPanel<T>({
  ariaLabel,
  wrapperClassName = DEFAULT_WRAPPER_CLASS,
  input,
  items,
  itemKey,
  renderItem,
  itemClassName = DEFAULT_ITEM_CLASS,
  listClassName = DEFAULT_LIST_CLASS,
  loading = false,
  loadingLabel,
  loadingClassName = DEFAULT_LOADING_CLASS,
  error,
  errorClassName = DEFAULT_ERROR_CLASS,
  emptyLabel,
  emptyClassName = DEFAULT_EMPTY_CLASS,
  liveRegionText,
}: StackedListPanelProps<T>) {
  return (
    <section aria-label={ariaLabel} className={wrapperClassName}>
      {/* absolute: an in-flow sr-only node is still a flex item and would eat
          an extra `gap` slot even though it renders at zero size. */}
      {liveRegionText !== undefined ? (
        <p className="sr-only absolute" aria-live="polite">
          {liveRegionText}
        </p>
      ) : null}

      {input}

      {loading ? (
        <div className={loadingClassName} role="status" aria-label={loadingLabel}>
          <SpinnerIcon className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <p className={errorClassName} role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className={emptyClassName}>{emptyLabel}</p>
      ) : (
        <ul className={listClassName}>
          {items.map((item) => (
            <li key={itemKey(item)} className={itemClassName}>
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
