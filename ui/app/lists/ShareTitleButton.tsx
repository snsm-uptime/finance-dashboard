"use client";

import { ShareIcon } from "@/app/icons";

export function ShareTitleButton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => {}}
      style={{
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        margin: 0,
        padding: "0.35rem",
        border: "none",
        borderRadius: "6px",
        background: "transparent",
        color: "var(--muted)",
        cursor: "pointer",
        lineHeight: 0,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.color = "var(--foreground)";
        target.style.background = "color-mix(in srgb, var(--accent) 12%, transparent)";
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.color = "var(--muted)";
        target.style.background = "transparent";
      }}
    >
      <ShareIcon style={{ width: "24px", height: "24px" }} />
    </button>
  );
}
