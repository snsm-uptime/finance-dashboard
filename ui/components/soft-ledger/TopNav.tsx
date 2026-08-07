import styles from "./TopNav.module.css";

type TopNavProps = {
  brand: string;
  listTitle: string;
};

/** Brand left / list title right only — no Account chrome. */
export function TopNav({ brand, listTitle }: TopNavProps) {
  return (
    <header className={styles.nav}>
      <p className={styles.brand}>{brand}</p>
      {listTitle ? <h1 className={styles.listTitle}>{listTitle}</h1> : null}
    </header>
  );
}
