import { useEffect } from "react";

export function useFormStateSync(
  value: boolean,
  onChange?: (v: boolean) => void
): void {
  useEffect(() => {
    onChange?.(value);
  }, [value, onChange]);
}
