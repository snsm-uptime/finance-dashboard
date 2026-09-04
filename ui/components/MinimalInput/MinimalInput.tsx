import { forwardRef, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
};

const baseClasses =
  "min-w-0 border-none border-b-[1.5px] border-border bg-transparent font-inherit text-[0.85rem] text-foreground placeholder:text-muted outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Underline-style text input — no box, no fill, a single bottom rule.
 * Shared by any surface that wants the list-rename-input look (budgets
 * ghost card name field) without pulling in `lists.module.scss`.
 */
export const MinimalInput = forwardRef<HTMLInputElement, Props>(function MinimalInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={className ? `${baseClasses} ${className}` : baseClasses} {...rest} />;
});
