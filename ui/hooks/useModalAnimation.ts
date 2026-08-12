import { useEffect, useState } from "react";

export function useModalAnimation(
  open: boolean,
  options?: { closeAnimationMs?: number }
) {
  const closeAnimationMs = options?.closeAnimationMs ?? 280;
  const [phase, setPhase] = useState<"unmounted" | "mounting" | "open" | "closing">(
    "unmounted"
  );

  // Respond to open prop changes: transition to mounting or closing
  useEffect(() => {
    if (open && phase === "unmounted") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("mounting");
    } else if (!open && phase !== "unmounted" && phase !== "closing") {
      setPhase("closing");
    }
  }, [open, phase]);

  // Handle mounting phase: trigger visibility animation
  useEffect(() => {
    if (phase === "mounting") {
      const show = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setPhase("open");
        });
      });
      return () => window.cancelAnimationFrame(show);
    }
  }, [phase]);

  // Handle closing phase: delay unmounting for animation
  useEffect(() => {
    if (phase === "closing") {
      const hide = window.setTimeout(() => {
        setPhase("unmounted");
      }, closeAnimationMs);
      return () => window.clearTimeout(hide);
    }
  }, [phase, closeAnimationMs]);

  return { phase };
}
