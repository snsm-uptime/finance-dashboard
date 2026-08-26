"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { menuSurface } from "@/components/MenuSurface";

import styles from "./IconButtonPopup.module.scss";

const STAY_OPEN = "data-stay-open";

type TriggerProps = {
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  "aria-expanded"?: boolean | "true" | "false";
  "aria-haspopup"?: ButtonHTMLAttributes<HTMLButtonElement>["aria-haspopup"];
  "aria-controls"?: string;
};

export type IconButtonPopupProps = {
  /** IconButton (or anything that forwards button attrs) that toggles the popup. */
  button: ReactElement<TriggerProps>;
  /** Popup body. Menu items close the popup unless they set `data-stay-open`. */
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  panelRole?: string;
  /** Controlled open state. Omit to let the popup own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type IconButtonPopupItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  /** Keep the popup open after this item is chosen (e.g. swap panel content). */
  stayOpen?: boolean;
};

function isDisabledItem(item: Element): boolean {
  if (item instanceof HTMLButtonElement || item instanceof HTMLInputElement) {
    return item.disabled;
  }
  return item.getAttribute("aria-disabled") === "true";
}

function itemFromEvent(event: MouseEvent<HTMLElement>): Element | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest("button, a[href], [role='menuitem']");
}

/**
 * IconButton plus an anchored popup. Click the button to toggle; clicks inside
 * the panel work as usual; a click outside or on a panel item closes it.
 */
export function IconButtonPopup({
  button,
  children,
  className,
  panelClassName,
  panelRole = "menu",
  open: openProp,
  onOpenChange,
}: IconButtonPopupProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        rootRef.current.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  if (!isValidElement(button)) return null;

  const trigger = cloneElement(button, {
    onClick: (event) => {
      button.props.onClick?.(event);
      if (event.defaultPrevented || button.props.disabled) return;
      setOpen(!open);
    },
    "aria-expanded": open,
    "aria-haspopup": button.props["aria-haspopup"] ?? "menu",
    "aria-controls": open ? panelId : undefined,
  });

  function onPanelClick(event: MouseEvent<HTMLDivElement>) {
    const item = itemFromEvent(event);
    if (!item || !event.currentTarget.contains(item)) return;
    if (item.closest(`[${STAY_OPEN}]`)) return;
    if (isDisabledItem(item)) return;
    setOpen(false);
  }

  const panelClass = [menuSurface.panel, styles.panel, panelClassName]
    .filter(Boolean)
    .join(" ");

  const rootClass = [styles.root, open ? styles.open : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={rootClass} data-open={open || undefined}>
      <div className={styles.anchored}>
        {trigger}
        {open ? (
          <div
            id={panelId}
            role={panelRole}
            className={panelClass}
            onClick={onPanelClick}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function IconButtonPopupItem({
  danger = false,
  stayOpen = false,
  className,
  type = "button",
  ...rest
}: IconButtonPopupItemProps) {
  const classes = [
    menuSurface.item,
    styles.itemLayout,
    danger ? styles.itemDanger : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      role="menuitem"
      className={classes}
      data-stay-open={stayOpen ? "true" : undefined}
    />
  );
}
