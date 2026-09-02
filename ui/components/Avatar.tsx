"use client";

import { useState } from "react";

import { pickAvatarColor, pickTextColor } from "@/lib/avatarColor";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export type AvatarProps = {
  /** Person label — used for the initial + always set as the native hover tooltip. */
  alias: string | null;
  /** Stable per-person id for the deterministic palette color (user_id, falling
   * back to member_id where only a membership id is available). */
  seed: string;
  /** Base64 data URI; renders the photo instead of the initials circle when set. */
  photoBase64?: string | null;
  size?: AvatarSize;
  className?: string;
};

const sizePx: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 128,
};

/** First alias character, uppercased; short-id fallback has no letter to show. */
function initialFor(alias: string | null): string {
  const trimmed = (alias ?? "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

/**
 * Shared avatar — photo when set, otherwise a deterministic colored initials
 * circle with auto-contrast text. Hovering either shows the alias via the
 * native `title` tooltip (no tooltip library exists yet).
 */
export function Avatar({ alias, seed, photoBase64, size = "sm", className }: AvatarProps) {
  const px = sizePx[size];
  const title = alias ?? undefined;
  const [photoFailed, setPhotoFailed] = useState(false);

  if (photoBase64 && !photoFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- base64 data URI, not a static asset next/image can optimize.
      <img
        src={photoBase64}
        alt={alias ?? ""}
        title={title}
        onError={() => setPhotoFailed(true)}
        className={`inline-block flex-shrink-0 rounded-[8px] object-cover ${className ?? ""}`}
        style={{ width: px, height: px }}
      />
    );
  }

  const bg = pickAvatarColor(seed);
  const fg = pickTextColor(bg);
  return (
    <span
      role="img"
      aria-label={alias ?? ""}
      title={title}
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-[8px] font-[600] leading-none ${className ?? ""}`}
      style={{
        width: px,
        height: px,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.round(px * 0.42),
      }}
    >
      {initialFor(alias)}
    </span>
  );
}
