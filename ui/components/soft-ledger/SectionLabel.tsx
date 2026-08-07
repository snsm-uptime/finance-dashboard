import type { ReactNode } from "react";

import styles from "./SectionLabel.module.css";

type SectionLabelProps = {
  children: ReactNode;
};

export function SectionLabel({ children }: SectionLabelProps) {
  return <h2 className={styles.label}>{children}</h2>;
}
