import { useRef, useState } from "react";

export function useFormSubmission<T>(
  submitFn: (data: T) => Promise<{ ok: boolean; error?: string }>,
  options?: { onSuccess?: () => void }
): {
  pending: boolean;
  error: string | null;
  submit: (data: T) => Promise<boolean>;
  clearError: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `pending` state only reflects reality after React commits a render, so
  // two submit() calls dispatched before that commit (a fast real-world
  // double-click, or two distinct handlers firing in the same tick) would
  // both read a stale `pending=false` and both run submitFn concurrently —
  // e.g. double-submitting a Save action, which can 409 on its own re-sent
  // mutation. This ref is checked/set synchronously, closing that gap.
  const pendingRef = useRef(false);

  async function submit(data: T): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;

    setPending(true);
    setError(null);

    try {
      const result = await submitFn(data);
      if (!result.ok) {
        setError(result.error ?? "An error occurred");
        return false;
      }
      options?.onSuccess?.();
      return true;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function clearError(): void {
    setError(null);
  }

  return {
    pending,
    error,
    submit,
    clearError,
  };
}
