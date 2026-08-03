import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <p className={styles.brand}>finance-helper</p>
      <h1 className={styles.title}>Stack is up</h1>
      <p className={styles.copy}>
        Compose services <code>db</code>, <code>api</code>, and <code>ui</code> are
        ready for feature work. Auth and lists land in later stories.
      </p>
    </main>
  );
}
