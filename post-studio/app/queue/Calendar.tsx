"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { QueueItem } from "@/lib/queue";
import type { Settings } from "@/lib/settings";
import { Icon, displayStatus, firstLine, type DisplayStatus } from "../components/ui";

type Mode = "week" | "month";

const STATUS: Partial<Record<DisplayStatus, string>> = {
  posted: "Published",
  posting: "Publishing",
  scheduled: "Scheduled",
  queued: "Queued",
  draft: "Planned draft",
  failed: "Failed",
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const hhmm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Weeks start on Monday. */
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** When a post belongs on the calendar: published → when it went out; otherwise its (planned) time. */
function placedAt(p: QueueItem): Date | null {
  if (p.status === "cancelled") return null;
  const iso = p.status === "posted" ? p.postedAt : p.scheduledAt;
  return iso ? new Date(iso) : null;
}

export default function Calendar({ items, settings }: { items: QueueItem[]; settings: Settings }) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const today = startOfDay(new Date());
  const now = new Date();

  const days = useMemo(() => {
    if (mode === "week") return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    const n = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return Array.from({ length: n }, (_, i) => addDays(start, i));
  }, [mode, anchor]);

  const byDay = useMemo(() => {
    const m = new Map<string, { p: QueueItem; at: Date }[]>();
    for (const p of items) {
      const at = placedAt(p);
      if (!at) continue;
      const k = dayKey(at);
      m.set(k, [...(m.get(k) ?? []), { p, at }]);
    }
    for (const list of m.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
    return m;
  }, [items]);

  /** Free posting slots on a day: in the future and not already taken by a post at that time. */
  function openSlots(d: Date) {
    if (d < today) return [];
    const taken = new Set((byDay.get(dayKey(d)) ?? []).map(({ at }) => hhmm(at)));
    return settings.slots
      .filter((s) => s.day === d.getDay())
      .map((s) => {
        const [h, m] = s.time.split(":").map(Number);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
      })
      .filter((at) => at > now && !taken.has(hhmm(at)));
  }

  const undated = items.filter((p) => p.status === "draft" && !p.scheduledAt).length;
  const title =
    mode === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  const step = (dir: 1 | -1) =>
    setAnchor(mode === "week" ? addDays(anchor, 7 * dir) : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  const inView = days.flatMap((d) => byDay.get(dayKey(d)) ?? []);
  const count = (s: DisplayStatus) => inView.filter(({ p }) => displayStatus(p) === s).length;
  const maxPerCell = mode === "month" ? 3 : 8;

  return (
    <div className="card cal">
      <div className="cal-head">
        <div className="row tight" style={{ marginTop: 0 }}>
          <button className="secondary small icon-btn" onClick={() => step(-1)} aria-label={mode === "week" ? "Previous week" : "Previous month"}>‹</button>
          <button className="secondary small" onClick={() => setAnchor(today)}>Today</button>
          <button className="secondary small icon-btn" onClick={() => step(1)} aria-label={mode === "week" ? "Next week" : "Next month"}>›</button>
          <h2 className="cal-title">{title}</h2>
        </div>
        <div className="seg" role="radiogroup" aria-label="Calendar range">
          {(["week", "month"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-legend" aria-label="Legend">
        <span><i className="dot s-posted" /> Published {count("posted")}</span>
        <span><i className="dot s-scheduled" /> Scheduled {count("scheduled")}</span>
        <span><i className="dot s-queued" /> Queued {count("queued")}</span>
        <span><i className="dot s-draft" /> Planned draft {count("draft")}</span>
        {count("failed") > 0 && <span><i className="dot s-failed" /> Failed {count("failed")}</span>}
        <span><i className="dot s-slot" /> Open slot</span>
      </div>

      <div className={`cal-grid ${mode}`}>
        {days.slice(0, 7).map((d) => (
          <div key={`h${d.getDay()}`} className="cal-dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
        ))}
        {days.map((d) => {
          const list = byDay.get(dayKey(d)) ?? [];
          const slots = openSlots(d);
          const isToday = d.getTime() === today.getTime();
          const outside = mode === "month" && d.getMonth() !== anchor.getMonth();
          const shown = list.slice(0, maxPerCell);
          return (
            <div key={dayKey(d)} className={`cal-day ${isToday ? "today" : ""} ${d < today ? "past" : ""} ${outside ? "outside" : ""}`}>
              <div className="cal-date">
                <span className="cal-dow-inline">{d.toLocaleDateString(undefined, { weekday: "short" })} </span>
                {d.getDate()}
                {isToday && <span className="cal-today">Today</span>}
              </div>
              {shown.map(({ p, at }) => {
                const ds = displayStatus(p);
                const href = p.status === "posted" ? `/posts/${p.id}` : `/compose?id=${p.id}`;
                return (
                  <Link key={p.id} href={href} className={`cal-item s-${ds}`} title={`${STATUS[ds] ?? ds} · ${hhmm(at)} · ${firstLine(p.text)}`}>
                    <span className="cal-time">
                      {ds === "failed" ? <Icon name="alert" size={11} /> : <i className={`dot s-${ds}`} />} {hhmm(at)}
                      <span className="sr-only"> {STATUS[ds]}</span>
                    </span>
                    <span className="cal-text">{firstLine(p.text)}</span>
                  </Link>
                );
              })}
              {list.length > shown.length && (
                <button className="cal-more" onClick={() => { setAnchor(d); setMode("week"); }}>+{list.length - shown.length} more</button>
              )}
              {slots.map((at) => (
                <Link key={at.toISOString()} href={`/compose?at=${encodeURIComponent(at.toISOString())}`} className="cal-slot" title="Open posting slot: write a post for this time">
                  <Icon name="plus" size={11} /> {hhmm(at)}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      {undated > 0 && (
        <p className="meta" style={{ margin: "12px 0 0" }}>
          {undated} draft{undated === 1 ? "" : "s"} without a date. <Link href="/posts?status=draft">Open drafts</Link> to plan a time.
        </p>
      )}
    </div>
  );
}
