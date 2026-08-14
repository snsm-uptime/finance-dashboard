import { useEffect } from "react";

/**
 * Syncs a boolean form state value to a parent callback.
 * Calls the callback whenever the value or callback reference changes.
 *
 * @param value - The boolean state to sync (e.g., canSubmit, canSave)
 * @param onChange - Optional callback fired when value or callback changes. Should be memoized (useCallback) to avoid unnecessary effect runs.
 *
 * @example
 * const { pending } = useFormSubmission(submitFn, { onSuccess });
 * const canSubmit = amount.trim().length > 0 && !pending;
 * useFormStateSync(canSubmit, onCanSubmitChange); // Notifies parent when canSubmit changes
 *
 * @remarks
 * - The callback is invoked on mount with the initial value and whenever dependencies change.
 * - If onChange is undefined, the effect runs but safely does nothing.
 * - Parent is responsible for memoizing the callback to avoid unintended effect triggers.
 * - Errors thrown by the callback will propagate to React's error boundary.
 */
export function useFormStateSync(
  value: boolean,
  onChange?: (v: boolean) => void
): void {
  useEffect(() => {
    onChange?.(value);
  }, [value, onChange]);
}
