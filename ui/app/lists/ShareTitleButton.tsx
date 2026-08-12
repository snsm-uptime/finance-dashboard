"use client";

import { ShareIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";

export function ShareTitleButton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <IconButton
      icon={<ShareIcon style={{ width: "24px", height: "24px" }} />}
      label={ariaLabel}
      variant="muted"
      onClick={() => {}}
    />
  );
}
