import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

const baseClass =
  "m-0 px-3 py-[9px] border-none rounded-sm bg-accent text-on-accent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55 disabled:cursor-not-allowed enabled:hover:brightness-105 no-underline inline-block";

const buttonStyle = {
  fontFamily: "var(--type-button-face)",
  fontSize: "var(--type-button-size)",
  fontWeight: "var(--type-button-weight)",
  lineHeight: "1.2",
} as const;

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  href?: undefined;
};

type PrimaryLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

/** Moss accent CTA — rounded.sm only; never pill. Renders a Link when `href` is given. */
export function PrimaryButton({
  children,
  className,
  href,
  ...rest
}: PrimaryButtonProps | PrimaryLinkProps) {
  const classes = className ? `${baseClass} ${className}` : baseClass;

  if (href !== undefined) {
    return (
      <Link
        href={href}
        className={classes}
        style={buttonStyle}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={classes} style={buttonStyle} {...buttonRest}>
      {children}
    </button>
  );
}
