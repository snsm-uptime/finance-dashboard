import { useState } from "react";

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

  async function submit(data: T): Promise<boolean> {
    if (pending) return false;

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
