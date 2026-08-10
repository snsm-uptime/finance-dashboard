"use client";

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
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
        <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8.59 13.51L15.41 17.49"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15.41 6.51L8.59 10.49"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
