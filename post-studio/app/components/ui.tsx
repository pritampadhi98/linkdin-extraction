"use client";

import type { ReactNode } from "react";
import type { QueueItem } from "@/lib/queue";

// ---------- Icons (simple 24px stroke icons, no dependency) ----------

const PATHS = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  queue: "M4 5h16M4 10h16M4 15h10M4 20h7M18 15v6M15 18h6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  tag: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  plus: "M12 5v14M5 12h14",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  calendar: "M3 6h18v15H3zM3 10h18M8 3v4M16 3v4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M19 12l-7 7-7-7",
  pause: "M8 5v14M16 5v14",
  play: "M7 4v16l13-8z",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  image: "M3 5h18v14H3zM3 16l5-5 5 5M14 14l2-2 5 5M15.5 9.5h.01",
  download: "M12 3v12M7 10l5 5 5-5M4 20h16",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------- Status ----------

export type DisplayStatus = "draft" | "queued" | "scheduled" | "posting" | "posted" | "failed" | "cancelled";

export function displayStatus(p: QueueItem): DisplayStatus {
  if (p.status === "queued") return p.timing === "slot" ? "queued" : "scheduled";
  return p.status;
}

const LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  scheduled: "Scheduled",
  posting: "Publishing",
  posted: "Published",
  failed: "Failed",
  cancelled: "Removed",
};

export const statusLabel = (s: DisplayStatus) => LABEL[s];

export const isOverdue = (p: QueueItem) =>
  p.status === "queued" && !!p.scheduledAt && new Date(p.scheduledAt).getTime() < Date.now() - 2 * 60_000;

export function StatusBadge({ post }: { post: QueueItem }) {
  const s = displayStatus(post);
  return (
    <span className="row tight" style={{ gap: 6, display: "inline-flex" }}>
      <span className={`badge b-${s}`}>{LABEL[s]}</span>
      {post.status === "posted" && post.mode === "dry-run" && <span className="tag" title="Live posting was off, so nothing went to LinkedIn">dry run</span>}
      {isOverdue(post) && <span className="tag" title="Past its time. Is the worker running?">overdue</span>}
    </span>
  );
}

export function VerdictBadge({ verdict, score }: { verdict: string | null; score: number | null }) {
  if (!verdict || score === null) return null;
  return <span className={`badge plain ${verdict}`}>{score.toFixed(0)} {verdict}</span>;
}

// ---------- Layout bits ----------

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row tight">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon-wrap"><Icon name={icon} size={20} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Callout({ kind, children }: { kind: "info" | "warn" | "error" | "good"; children: ReactNode }) {
  const icon: IconName = kind === "good" ? "check" : kind === "info" ? "info" : "alert";
  return (
    <div className={`callout ${kind}`} role={kind === "error" ? "alert" : undefined}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub !== undefined && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Skeleton({ h = 60 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} />;
}

export function Spinner() {
  return <Icon name="refresh" className="spin" size={14} />;
}

// ---------- Formatting ----------

export const firstLine = (t: string) => t.split("\n").find((l) => l.trim())?.trim() ?? "(empty)";

export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" })}, ${time}`;
}

export function fmtRelative(iso: string): string {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const a = Math.abs(s);
  const [n, u] = a < 60 ? [a, "second"] : a < 3600 ? [Math.round(a / 60), "minute"] : a < 86400 ? [Math.round(a / 3600), "hour"] : [Math.round(a / 86400), "day"];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(s < 0 ? -n : n, u as Intl.RelativeTimeFormatUnit);
}

export const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
export function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A LinkedIn post search for these words, opened in the browser. Nothing is read or posted by Post Studio. */
export const liSearchUrl = (q: string) => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}`;
