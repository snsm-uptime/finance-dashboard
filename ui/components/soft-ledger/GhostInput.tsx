import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

type GhostInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Rendered inside the bordered box, after the input (e.g. a submit IconButton). */
  trailing?: ReactNode;
  /** Extra classes for the bordered wrapper (e.g. `flex-1` to grow in a row). */
  wrapperClassName?: string;
};

/** Bordered text field: rounded box, transparent background, ghost placeholder/border. */
export const GhostInput = forwardRef<HTMLInputElement, GhostInputProps>(function GhostInput(
  { trailing, wrapperClassName, className, ...inputProps },
  ref,
) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[8px] border-2 border-border bg-background px-[0.65rem] py-[0.5rem] ${wrapperClassName ?? ""}`}
    >
      <input
        ref={ref}
        className={`min-w-0 flex-1 font-inherit text-[0.9rem] bg-transparent text-foreground placeholder:text-muted outline-none ${className ?? ""}`}
        {...inputProps}
      />
      {trailing}
    </div>
  );
});
