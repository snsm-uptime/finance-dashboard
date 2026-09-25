import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import styles from "./GhostTextField.module.scss";

type GhostTextFieldProps = InputHTMLAttributes<HTMLInputElement>;

/** Borderless single-line field: muted text until focus, no visible border/box — the List-rename look, reused wherever an inline rename needs to read as plain text. */
export const GhostTextField = forwardRef<HTMLInputElement, GhostTextFieldProps>(
  function GhostTextField({ className, ...props }, ref) {
    return <input ref={ref} className={`${styles.field} ${className ?? ""}`} {...props} />;
  },
);

type GhostTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multi-line variant of GhostTextField, for auto-growing inline editors. */
export const GhostTextArea = forwardRef<HTMLTextAreaElement, GhostTextAreaProps>(
  function GhostTextArea({ className, ...props }, ref) {
    return <textarea ref={ref} className={`${styles.field} ${className ?? ""}`} {...props} />;
  },
);
