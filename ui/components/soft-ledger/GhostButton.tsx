import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./GhostButton.module.scss";

const baseClass =
  "m-0 px-3 py-[9px] border-[3px] border-solid border-accent rounded-sm bg-transparent text-accent font-bold cursor-pointer transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55 disabled:cursor-not-allowed no-underline inline-block";

const buttonStyle = {
  fontFamily: "var(--type-button-face)",
  fontSize: "var(--type-button-size)",
  lineHeight: "1.2",
} as const;

type GhostButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  href?: undefined;
};

type GhostLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
};

/**
 * Outlined CTA: thick accent border, bold accent text, transparent fill.
 * On hover/focus it elevates like UploadButton's chrome (M3 shadow, lifts
 * up) and fills accent — but the label fades to transparent instead of
 * flipping to a readable color, matching FileImportMorphIcon's chrome.
 * Renders a Link when `href` is given.
 */
export function GhostButton({
  children,
  className,
  href,
  ...rest
}: GhostButtonProps | GhostLinkProps) {
  const classes = [baseClass, styles.button, className].filter(Boolean).join(" ");

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
