import {
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";

import styles from "./ButtonGroup.module.scss";

export type ButtonGroupOrientation = "horizontal" | "vertical";

type IconButtonLikeProps = {
  className?: string;
};

export type ButtonGroupProps = {
  /** Stack direction. Outer corners follow this axis; inner joints stay square. */
  orientation?: ButtonGroupOrientation;
  /**
   * IconButton instances, or components that compose IconButton
   * (e.g. FormIconSubmit) and forward `className` onto it.
   */
  buttons: ReadonlyArray<ReactElement<IconButtonLikeProps> | null | false | undefined>;
  className?: string;
  "aria-label"?: string;
};

/**
 * Bordered cluster of icon buttons. Rounds only the outer corners of the
 * group; inner dividers and hover fills stay square.
 */
export function ButtonGroup({
  orientation = "horizontal",
  buttons,
  className,
  "aria-label": ariaLabel,
}: ButtonGroupProps) {
  const orientationClass =
    orientation === "vertical" ? styles.vertical : styles.horizontal;
  const rootClass = className
    ? `${styles.group} ${orientationClass} ${className}`
    : `${styles.group} ${orientationClass}`;

  const items = buttons.filter((child): child is ReactElement<IconButtonLikeProps> =>
    isValidElement(child),
  );

  return (
    <div role="group" aria-label={ariaLabel} className={rootClass}>
      {items.map((child) => {
        const itemClass = child.props.className
          ? `${styles.item} ${child.props.className}`
          : styles.item;
        return cloneElement(child, { className: itemClass });
      })}
    </div>
  );
}
