import { forwardRef } from "react";

import { BaseButton, type BaseButtonProps, type DistributiveOmit } from "./BaseButton";

type AccentButtonProps = DistributiveOmit<BaseButtonProps, "variant">;

/** Blue accent CTA — outline idle, fills solid on hover. rounded-sm only; never pill. */
export const AccentButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  AccentButtonProps
>(function AccentButton(props, ref) {
  return <BaseButton variant="accent" ref={ref} {...props} />;
});
