"use client";

import { useCallback, useEffect, useState } from "react";

export const MAX_POSTS = 7;
export const MAX_TOPICS = 6;
export const DEFAULT_POSTS = 4;
const PICK_KEY = "ps.planTopics";
const COUNT_KEY = "ps.planCount";

/** The topics you selected and how many posts you want. Remembered on this computer, shared by the Plan tabs. */
export function usePlanSettings() {
  const [picked, setPickedState] = useState<string[]>([]);
  const [count, setCountState] = useState(DEFAULT_POSTS);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PICK_KEY) ?? "[]");
      if (Array.isArray(p)) setPickedState(p.filter((x): x is string => typeof x === "string").slice(0, MAX_TOPICS));
      const c = Number(localStorage.getItem(COUNT_KEY));
      if (c >= 1 && c <= MAX_POSTS) setCountState(Math.round(c));
    } catch {}
  }, []);

  const setPicked = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    setPickedState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      try { localStorage.setItem(PICK_KEY, JSON.stringify(v)); } catch {}
      return v;
    });
  }, []);

  const setCount = useCallback((n: number) => {
    const v = Math.min(MAX_POSTS, Math.max(1, Math.round(n)));
    setCountState(v);
    try { localStorage.setItem(COUNT_KEY, String(v)); } catch {}
  }, []);

  return { picked, setPicked, count, setCount };
}
