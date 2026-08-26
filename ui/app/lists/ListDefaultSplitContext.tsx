"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DefaultSplitPayload } from "./listsClient";

type ListDefaultSplitContextValue = {
  defaultSplit: DefaultSplitPayload | null;
  setDefaultSplit: (next: DefaultSplitPayload) => void;
};

const ListDefaultSplitContext = createContext<ListDefaultSplitContextValue | null>(
  null,
);

export function ListDefaultSplitProvider({
  initial,
  children,
}: {
  initial: DefaultSplitPayload | null;
  children: ReactNode;
}) {
  const [defaultSplit, setSplit] = useState<DefaultSplitPayload | null>(initial);

  useEffect(() => {
    setSplit(initial);
  }, [initial]);

  const setDefaultSplit = useCallback((next: DefaultSplitPayload) => {
    setSplit(next);
  }, []);

  const value = useMemo(
    () => ({ defaultSplit, setDefaultSplit }),
    [defaultSplit, setDefaultSplit],
  );

  return (
    <ListDefaultSplitContext.Provider value={value}>
      {children}
    </ListDefaultSplitContext.Provider>
  );
}

export function useOptionalListDefaultSplit(): ListDefaultSplitContextValue | null {
  return useContext(ListDefaultSplitContext);
}
