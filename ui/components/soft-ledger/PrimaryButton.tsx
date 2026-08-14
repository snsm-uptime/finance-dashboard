import type { ButtonHTMLAttributes, ReactNode } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Moss accent CTA — rounded.sm only; never pill. */
export function PrimaryButton({
  children,
  className,
  type = "button",
  ...rest
}: PrimaryButtonProps) {
  const baseClass =
    "m-0 px-3 py-[9px] border-none rounded-sm bg-accent text-on-accent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55 disabled:cursor-not-allowed enabled:hover:brightness-105";
  const classes = className ? `${baseClass} ${className}` : baseClass;
  return (
    <button
      type={type}
      className={classes}
      style={{
        fontFamily: "var(--type-button-face)",
        fontSize: "var(--type-button-size)",
        fontWeight: "var(--type-button-weight)",
        lineHeight: "1.2",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
