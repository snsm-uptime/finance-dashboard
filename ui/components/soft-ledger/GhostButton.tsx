import { forwardRef } from "react";

import { BaseButton, type BaseButtonProps, type DistributiveOmit } from "./BaseButton";

type GhostButtonProps = DistributiveOmit<BaseButtonProps, "variant">;

/** Outlined CTA: muted border+text idle, shifts to primary on hover. Never fills. rounded-sm only; never pill. */
export const GhostButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  GhostButtonProps
>(function GhostButton(props, ref) {
  return <BaseButton variant="ghost" ref={ref} {...props} />;
});
