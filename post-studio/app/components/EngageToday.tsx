"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, useStudio, useToast } from "./providers";
import { Icon, fmtWhen, liSearchUrl } from "./ui";

type Group = "reach" | "peers" | "buyers";
export type EngageState = {
  date: string;
  counts: Record<Group, number>;
  goal: number;
  streak: number;
  targets: (Record<Group, number> & { minutes: number; terms: Record<Group, string[]> }) | null;
};

const ROWS: { g: Group; label: string; who: string }[] = [
  { g: "reach", label: "Reach", who: "Big voices your audience reads" },
  { g: "peers", label: "Peers", who: "People with the same problems" },
  { g: "buyers", label: "Hiring / buyers", who: "People who could hire or promote you" },
];

export const REMIND_KEY = "ps.engageRemind";

/** When your next post goes out: the earliest queued or scheduled post, else the next free slot. */
export function useNextPostTime(): Date | null {
  const { data } = useStudio();
  if (!data) return null;
  const now = Date.now();
  const upcoming = data.items
    .filter((p) => p.status === "queued" && p.scheduledAt && new Date(p.scheduledAt).getTime() > now)
    .map((p) => new Date(p.scheduledAt!).getTime())
    .sort((a, b) => a - b)[0];
  if (upcoming) return new Date(upcoming);
  return data.nextSlot ? new Date(data.nextSlot) : null;
}

/** Overview card: today's engagement targets from your plan, tick-off counters, streak and reminder. */
export default function EngageToday() {
  const toast = useToast();
  const next = useNextPostTime();
  const [s, setS] = useState<EngageState | null>(null);
  const [remind, setRemind] = useState(false);

  const load = useCallback(() => api<EngageState>("/api/engage").then(setS).catch(() => {}), []);
  useEffect(() => {
    load();
    try { setRemind(localStorage.getItem(REMIND_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted"); } catch {}
  }, [load]);

  async function bump(group: Group, delta: 1 | -1) {
    try {
      setS(await api<EngageState>("/api/engage", { method: "POST", json: { group, delta } }));
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function toggleRemind() {
    if (typeof Notification === "undefined") return toast("error", "This browser doesn't support notifications.");
    if (remind) {
      try { localStorage.setItem(REMIND_KEY, "0"); } catch {}
      setRemind(false);
      return toast("info", "Reminders off.");
    }
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (p !== "granted") return toast("error", "Notifications are blocked for this site. Allow them in the browser to get reminders.");
    try { localStorage.setItem(REMIND_KEY, "1"); } catch {}
    setRemind(true);
    toast("success", "You'll get a reminder 30 minutes before your next post, while Post Studio is open.");
  }

  if (!s) return null;
  const t = s.targets;
  const done = s.counts.reach + s.counts.peers + s.counts.buyers;
  const pct = s.goal ? Math.min(100, Math.round((done / s.goal) * 100)) : 0;
  const finished = s.goal > 0 && done >= s.goal;
  const soon = next && next.getTime() - Date.now() < 3 * 3600_000 && next.getTime() > Date.now();

  return (
    <div className="card engage">
      <div className="card-head">
        <h2><Icon name="user" /> Engage today</h2>
        <span className="row tight" style={{ marginTop: 0 }}>
          {s.streak > 0 && <span className="badge b-posted plain" title="Days in a row with today's target met">{s.streak}-day streak</span>}
          {t && <span className="hint">{t.minutes} min · before you post</span>}
        </span>
      </div>

      {!t ? (
        <p className="meta" style={{ margin: 0 }}>
          Build your weekly plan to get daily targets: <Link href="/plan#week">Plan → Your week → Plan my week</Link>.
        </p>
      ) : (
        <>
          {soon && !finished && (
            <div className="engage-nudge">
              <Icon name="clock" size={14} /> Your next post goes out {fmtWhen(next!.toISOString())}. Your plan says to engage first, so people see your name before your post.
            </div>
          )}
          <div className="engage-progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={s.goal} aria-label="Comments today">
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="meta" style={{ margin: "6px 0 10px" }}>
            {finished ? <b className="good">Done for today: {done} of {s.goal} comments.</b> : <>{done} of {s.goal} comments today</>}
          </p>
          <div className="engage-rows">
            {ROWS.map(({ g, label, who }) => (
              <div key={g} className="engage-row">
                <div style={{ minWidth: 0 }}>
                  <b>{label}</b> <span className="meta">{who}</span>
                  <div className="search-chips" style={{ marginTop: 4 }}>
                    {t.terms[g].slice(0, 2).map((q) => (
                      <a key={q} className="search-chip" href={liSearchUrl(q)} target="_blank" rel="noreferrer noopener" title={`Search LinkedIn posts for "${q}"`}>{q} ↗</a>
                    ))}
                  </div>
                </div>
                <div className="engage-count">
                  <button className="secondary small" onClick={() => bump(g, -1)} disabled={s.counts[g] === 0} aria-label={`Undo one ${label} comment`}>−</button>
                  <span className={s.counts[g] >= t[g] && t[g] > 0 ? "good" : ""}><b>{s.counts[g]}</b> / {t[g]}</span>
                  <button className="small" onClick={() => bump(g, 1)} aria-label={`Count one ${label} comment`}>+1</button>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link href="/engage#comment" className="btn secondary small"><Icon name="sparkle" size={13} /> Draft a comment</Link>
            <button className="ghost small" onClick={toggleRemind} aria-pressed={remind}>
              <Icon name="clock" size={13} /> {remind ? "Reminder on" : "Remind me before posts"}
            </button>
          </div>
          <p className="meta" style={{ margin: "6px 0 0" }}>Search opens LinkedIn in your browser. You comment by hand, then tap +1.</p>
        </>
      )}
    </div>
  );
}
