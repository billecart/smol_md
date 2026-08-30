import { useCallback, useMemo, useState } from "react";
import {
  clampActiveIndex,
  nextMatchIndex,
  previousMatchIndex,
} from "../utils/inPageFind";

export type InPageFind = {
  isOpen: boolean;
  query: string;
  matchCount: number;
  activeIndex: number;
  open: (prefill?: string) => void;
  close: () => void;
  setQuery: (q: string) => void;
  setMatchCount: (n: number) => void;
  goNext: () => void;
  goPrev: () => void;
};

export function useInPageFind(): InPageFind {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [matchCount, setMatchCountState] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const open = useCallback((prefill?: string) => {
    setIsOpen(true);
    if (prefill !== undefined) {
      setQueryState(prefill);
    }
    setActiveIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQueryState("");
    setMatchCountState(0);
    setActiveIndex(0);
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setActiveIndex(0);
  }, []);

  const setMatchCount = useCallback((n: number) => {
    setMatchCountState(n);
    setActiveIndex((i) => clampActiveIndex(i, n));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((i) => nextMatchIndex(i, matchCount));
  }, [matchCount]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => previousMatchIndex(i, matchCount));
  }, [matchCount]);

  return useMemo(
    () => ({
      isOpen,
      query,
      matchCount,
      activeIndex,
      open,
      close,
      setQuery,
      setMatchCount,
      goNext,
      goPrev,
    }),
    [
      isOpen,
      query,
      matchCount,
      activeIndex,
      open,
      close,
      setQuery,
      setMatchCount,
      goNext,
      goPrev,
    ],
  );
}
