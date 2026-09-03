"use client";

import {
  Children,
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import styles from "./Tooltip.module.scss";

type Props = {
  /** Text shown in the bubble. Empty/falsy suppresses the tooltip entirely. */
  label: string;
  /** Suppresses the tooltip (e.g. the trigger is disabled or already self-labeled). */
  disabled?: boolean;
  /**
   * The single trigger element to clone — Tooltip attaches hover/focus
   * handlers and a merged ref directly onto it (no wrapper DOM node), then
   * portals the bubble into `document.body` on show, positioned from this
   * element's `getBoundingClientRect()`.
   */
  children: ReactElement<Record<string, unknown>>;
};

type Coords = { top: number; left: number; placement: "above" | "below" };

/** Extra px above the trigger's top edge, matching the prior `-top-7` offset feel. */
const GAP_PX = 4;

/**
 * If the trigger's top edge is closer to the viewport top than this, flip
 * the bubble to render below the trigger instead of above it, so it can't
 * be pushed off-screen (e.g. a header icon button). Roughly bubble height +
 * gap + a little margin; not tuned further since this is a coarse guard,
 * not a full collision system.
 */
const TOP_FLIP_THRESHOLD_PX = 48;

/** Standard hover/focus delay before the bubble appears; hiding is always instant. */
const SHOW_DELAY_MS = 500;

export function Tooltip({ label, disabled = false, children }: Props) {
  const suppressed = disabled || !label;
  const triggerRef = useRef<HTMLElement | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  // Hover and keyboard-focus-visible are tracked independently (rather than
  // one combined "isActive" flag toggled by whichever of
  // mouseenter/mouseleave/focus/blur fires) so that being both hovered and
  // focused at once doesn't let either single "leave" event hide the
  // tooltip out from under the other still-active trigger — mirrors the
  // original CSS `:hover, :has(:focus-visible)` OR logic. They're refs, not
  // state: they never drive render output directly (only `coords` does),
  // so tracking them imperatively lets the handlers below update visibility
  // synchronously without routing through an effect.
  const hoveredRef = useRef(false);
  const focusVisibleRef = useRef(false);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the "adjusting state when a prop changes" pattern (see
  // https://react.dev/learn/you-might-not-need-an-effect) rather than a
  // `useEffect`: if `suppressed` flips to `true` while the tooltip is
  // shown, reset immediately during render so that un-suppressing later
  // can't resurrect a stale position without a fresh hover/focus event.
  const [prevSuppressed, setPrevSuppressed] = useState(suppressed);
  if (suppressed !== prevSuppressed) {
    setPrevSuppressed(suppressed);
    if (suppressed) {
      // Resetting these refs here (rather than in an event handler/effect)
      // is the one place this component intentionally deviates from "refs
      // aren't touched during render": it mirrors the official
      // adjust-state-on-prop-change pattern this whole block follows, and
      // these two refs never feed render output (only `coords`, a real
      // state value, does) — so there's no correctness hazard the lint is
      // guarding against here.
      /* eslint-disable-next-line react-hooks/refs */
      hoveredRef.current = false;
      /* eslint-disable-next-line react-hooks/refs */
      focusVisibleRef.current = false;
      if (showTimeoutRef.current !== null) {
        clearTimeout(showTimeoutRef.current);
        /* eslint-disable-next-line react-hooks/refs */
        showTimeoutRef.current = null;
      }
      if (coords !== null) {
        setCoords(null);
      }
    }
  }
  const single = Children.only(children);
  const childProps = single.props as Record<string, unknown> & {
    ref?: Ref<HTMLElement>;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
  };
  const existingRef = childProps.ref;
  // Callback ref merging our own measurement ref with any ref already on
  // the child (e.g. IconButton's forwarded ref) — the standard React
  // ref-merge pattern. React only ever calls this on attach/detach (commit
  // phase), never during render, so it's safe despite the compiler's
  // static (and here, overly conservative) ref-safety lint.
  /* eslint-disable react-hooks/immutability, react-hooks/preserve-manual-memoization -- react-hooks/preserve-manual-memoization is a false positive here: the render-time `setCoords`/ref resets above (the "adjust state on prop change" block) make the Compiler bail on preserving this hook's memoization, but this callback's own behavior is unaffected — it doesn't read any state touched by that block. */
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof existingRef === "function") {
        existingRef(node);
      } else if (existingRef) {
        (existingRef as { current: HTMLElement | null }).current = node;
      }
    },
    [existingRef],
  );
  /* eslint-enable react-hooks/immutability */

  const updatePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    // Flip below the trigger when there isn't room above (e.g. a header
    // icon button near the top of the viewport) instead of always
    // positioning above via `rect.top - GAP_PX`, which can push the bubble
    // off-screen.
    if (rect.top < TOP_FLIP_THRESHOLD_PX) {
      setCoords({
        top: rect.bottom + GAP_PX,
        left: rect.left + rect.width / 2,
        placement: "below",
      });
    } else {
      setCoords({
        top: rect.top - GAP_PX,
        left: rect.left + rect.width / 2,
        placement: "above",
      });
    }
  }, []);

  // Visible whenever hovered OR focus-visible (independent refs, see
  // above) — called imperatively from the handlers below on every
  // hover/focus transition, so it stays in sync without an effect.
  const syncVisibility = useCallback(() => {
    if (showTimeoutRef.current !== null) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hoveredRef.current || focusVisibleRef.current) {
      showTimeoutRef.current = setTimeout(() => {
        showTimeoutRef.current = null;
        if (hoveredRef.current || focusVisibleRef.current) {
          updatePosition();
        }
      }, SHOW_DELAY_MS);
    } else {
      setCoords(null);
    }
  }, [updatePosition]);

  useEffect(() => {
    return () => {
      if (showTimeoutRef.current !== null) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);

  // Recompute while visible so the bubble tracks the trigger through
  // scrolling/resizing mid-hover; listener is only live while shown.
  useEffect(() => {
    if (coords === null) return undefined;
    function handle() {
      updatePosition();
    }
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [coords, updatePosition]);

  // Suppressed: render the trigger untouched (no ref merge, no handlers) —
  // still inside the same Fragment shape as the unsuppressed path below, so
  // toggling `disabled`/`suppressed` at runtime (e.g. IconButtonPopup
  // flipping `aria-expanded` on every open/close) never changes the type of
  // element Tooltip returns at this position. If the two branches returned
  // different shapes (bare element vs. Fragment), React would remount the
  // trigger — dropping its DOM identity/focus — on every such toggle.
  const trigger = suppressed
    ? single
    : // mergedRef is a stable callback ref (see above); cloneElement only
    // forwards it as a prop here, it doesn't read `.current`.
    /* eslint-disable-next-line react-hooks/refs */
    cloneElement(single, {
      ref: mergedRef,
      onMouseEnter: (event: MouseEvent) => {
        childProps.onMouseEnter?.(event);
        hoveredRef.current = true;
        syncVisibility();
      },
      onMouseLeave: (event: MouseEvent) => {
        childProps.onMouseLeave?.(event);
        hoveredRef.current = false;
        syncVisibility();
      },
      onFocus: (event: FocusEvent) => {
        childProps.onFocus?.(event);
        // Only show for keyboard (focus-visible) focus, not mouse-click
        // focus — clicking any icon button would otherwise pop the
        // tooltip up right after the click. jsdom's `:focus-visible`
        // support is limited (see Tooltip.test.tsx), but this is the
        // standard DOM way to distinguish the two in real browsers.
        const target = event.target as HTMLElement;
        if (target.matches(":focus-visible")) {
          focusVisibleRef.current = true;
          syncVisibility();
        }
      },
      onBlur: (event: FocusEvent) => {
        childProps.onBlur?.(event);
        focusVisibleRef.current = false;
        syncVisibility();
      },
    });

  return (
    <>
      {trigger}
      {!suppressed && coords && typeof document !== "undefined"
        ? createPortal(
          <span
            className={styles.bubble}
            data-testid="tooltip-bubble"
            style={{
              top: coords.top,
              left: coords.left,
              transform:
                coords.placement === "below"
                  ? "translate(-50%, 0)"
                  : undefined,
            }}
          >
            {label}
          </span>,
          document.body,
        )
        : null}
    </>
  );
}
