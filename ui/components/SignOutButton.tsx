"use client";

import { useState } from "react";

import styles from "./SignOutButton.module.css";

type Props = {
  label?: string;
};

export function SignOutButton({ label = "Sign out" }: Props) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      // Full navigation avoids RSC cache / stale-cookie soft-nav loops.
      window.location.assign("/sign-in");
    }
  }

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void onClick()}
      disabled={pending}
    >
      {pending ? "Signing out…" : label}
    </button>
  );
}
