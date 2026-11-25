"use client";

import { useEffect } from "react";
import type { EngageState } from "./EngageToday";
import { REMIND_KEY, useNextPostTime } from "./EngageToday";

/**
 * Browser notification 30 minutes before your next post, if today's engagement isn't done.
 * Only works while a Post Studio tab is open (no background service).
 */
export default function EngageReminder() {
  const next = useNextPostTime();
  const at = next?.getTime() ?? null;

  useEffect(() => {
    if (!at || typeof Notification === "undefined") return;
    let on = false;
    try { on = localStorage.getItem(REMIND_KEY) === "1"; } catch {}
    if (!on || Notification.permission !== "granted") return;
    const fireAt = at - 30 * 60_000;
    const delay = fireAt - Date.now();
    if (delay < 0 || delay > 24 * 3600_000) return;
    const firedKey = `ps.engageReminded.${at}`;
    try { if (localStorage.getItem(firedKey)) return; } catch {}
    const timer = window.setTimeout(async () => {
      try {
        const s = (await fetch("/api/engage").then((r) => r.json())) as EngageState;
        const done = s.counts.reach + s.counts.peers + s.counts.buyers;
        if (s.goal > 0 && done >= s.goal) return;
        const time = new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        const n = new Notification("Engage before you post", {
          body: `Your post goes out at ${time}. ${s.targets?.minutes ?? 20} minutes of comments first: ${done}${s.goal ? ` of ${s.goal}` : ""} done.`,
        });
        n.onclick = () => { window.focus(); window.location.href = "/"; };
        try { localStorage.setItem(firedKey, "1"); } catch {}
      } catch {}
    }, delay);
    return () => window.clearTimeout(timer);
  }, [at]);

  return null;
}
