import { useState, useCallback } from "react";

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
  const [matchCount, setMatchCount] = useState(0);
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
    setMatchCount(0);
    setActiveIndex(0);
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setActiveIndex(0);
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((i) => (matchCount > 0 ? (i + 1) % matchCount : 0));
  }, [matchCount]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) =>
      matchCount > 0 ? (i - 1 + matchCount) % matchCount : 0,
    );
  }, [matchCount]);

  return {
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
  };
}
