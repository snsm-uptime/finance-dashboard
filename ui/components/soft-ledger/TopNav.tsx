type TopNavProps = {
  brand: string;
  listTitle: string;
};

/** Brand left / list title right only — no Account chrome. */
export function TopNav({ brand, listTitle }: TopNavProps) {
  return (
    <header className="flex items-baseline justify-between gap-[var(--space-4)] py-[var(--space-3)] px-nav-x">
      <p
        className="m-0 text-muted"
        style={{
          fontFamily: "var(--type-brand-face)",
          fontSize: "var(--type-brand-size)",
          fontWeight: "var(--type-brand-weight)",
          letterSpacing: "var(--type-brand-tracking)",
        }}
      >
        {brand}
      </p>
      {listTitle ? (
        <h1
          className="m-0 text-foreground text-right min-w-0 truncate"
          style={{
            fontFamily: "var(--type-list-title-face)",
            fontSize: "var(--type-list-title-size)",
            fontWeight: "var(--type-list-title-weight)",
          }}
        >
          {listTitle}
        </h1>
      ) : null}
    </header>
  );
}
