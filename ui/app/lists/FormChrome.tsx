"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import iconStyles from "@/components/FormIconSubmit/FormIconSubmit.module.scss";

const FormHeaderActionHostContext = createContext<HTMLElement | null>(null);

/** Provides a DOM host in the chrome header for form action icons (save/send). */
export function FormHeaderActionHostProvider({
  host,
  children,
}: {
  host: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <FormHeaderActionHostContext.Provider value={host}>
      {children}
    </FormHeaderActionHostContext.Provider>
  );
}

export function useFormHeaderActionHost(): HTMLElement | null {
  return useContext(FormHeaderActionHostContext);
}

/**
 * Renders children in the sheet/form chrome header when a host exists;
 * otherwise falls back to an inline left-aligned row (sidebar).
 */
export function FormHeaderAction({ children }: { children: ReactNode }) {
  const host = useContext(FormHeaderActionHostContext);
  if (host) {
    return createPortal(children, host);
  }
  return <div className={iconStyles.row}>{children}</div>;
}
