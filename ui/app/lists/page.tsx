import styles from "./lists.module.css";

/** Minimal Lists homepage first-paint (EXPERIENCE). Empty-state copy not journeyed. */
export default function ListsPage() {
  return (
    <main className={styles.main}>
      <p className={styles.brand}>finance-helper</p>
      <h1 className={styles.title}>Lists</h1>
      <p className={styles.copy}>
        Your personal list is ready. Shared lists and invites land in later
        stories.
      </p>
    </main>
  );
}
