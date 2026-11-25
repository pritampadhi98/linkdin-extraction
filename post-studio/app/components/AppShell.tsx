"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { nextReading } from "@/lib/analytics";
import EngageReminder from "./EngageReminder";
import { Providers, useStudio, workerRunning } from "./providers";
import { Icon, type IconName } from "./ui";

type Step = { href: string; label: string; hint: string; match: (path: string) => boolean };

/** The path a new user follows, in order. Each step says what it's for. */
const STEPS: Step[] = [
  { href: "/onboarding", label: "Onboarding", hint: "Connect LinkedIn", match: (p) => p.startsWith("/onboarding") },
  { href: "/plan", label: "Plan", hint: "Trends + your profile", match: (p) => p.startsWith("/plan") },
  { href: "/compose", label: "Review", hint: "Write, check, approve", match: (p) => p.startsWith("/compose") },
  { href: "/queue", label: "Schedule", hint: "What goes out, when", match: (p) => p.startsWith("/queue") },
  { href: "/analytics", label: "Analytics", hint: "Readings and charts", match: (p) => p.startsWith("/analytics") || /^\/posts\/[^/]+/.test(p) },
];

const ADVANCED: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/posts", label: "All posts", icon: "list", match: (p) => p === "/posts" },
  { href: "/engage", label: "Engage", icon: "user", match: (p) => p.startsWith("/engage") },
  { href: "/profile", label: "Profile fixes", icon: "edit", match: (p) => p.startsWith("/profile") },
  { href: "/keywords", label: "Keywords", icon: "tag", match: (p) => p.startsWith("/keywords") },
];


/** Short live status for each step, from the shared studio data. */
function useStepStatus() {
  const { data } = useStudio();
  if (!data) return { done: [] as boolean[], badge: [] as (string | null)[] };
  const drafts = data.items.filter((x) => x.status === "draft").length;
  const queued = data.items.filter((x) => x.status === "queued").length;
  const posted = data.items.filter((x) => x.status === "posted");
  const due = posted.filter((p) => nextReading(p)?.overdue).length;
  const setUp = !!data.account && !!data.settings.approverName && !!data.settings.audience;
  return {
    done: [setUp, false, posted.length > 0, posted.length > 0, false],
    badge: [
      setUp ? null : "to do",
      null,
      drafts ? `${drafts} draft${drafts > 1 ? "s" : ""}` : null,
      queued ? `${queued} queued` : null,
      due ? `${due} due` : posted.length ? `${posted.length} live` : null,
    ],
  };
}

function Steps({ compact }: { compact?: boolean }) {
  const path = usePathname();
  const { done, badge } = useStepStatus();
  return (
    <ol className={`steps-nav ${compact ? "compact" : ""}`} aria-label="Start here, in order">
      {STEPS.map((s, i) => {
        const active = s.match(path);
        return (
          <li key={s.href}>
            <Link href={s.href} className={`${active ? "active" : ""} ${done[i] ? "done" : ""}`} aria-current={active ? "page" : undefined} title={s.hint}>
              <span className="num" aria-hidden>{done[i] && !active ? <Icon name="check" size={13} /> : i + 1}</span>
              <span className="label">
                {s.label}
                {!compact && <small>{s.hint}</small>}
              </span>
              {badge[i] && <span className={`badge-hint ${badge[i] === "to do" || badge[i]?.endsWith("due") ? "warn" : ""}`}>{badge[i]}</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Advanced() {
  const path = usePathname();
  const [open, setOpen] = useState(false); // always starts closed
  const current = ADVANCED.find((a) => a.match(path));
  // Closed again after you pick a page, so it only ever shows when you ask for it.
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="advanced">
      <button type="button" className={`adv-toggle ${current && !open ? "here" : ""}`} aria-expanded={open} aria-controls="advanced-nav" onClick={() => setOpen((o) => !o)}>
        <span className={`caret ${open ? "open" : ""}`} aria-hidden>▶</span> Advanced tools
        {current && !open && <span className="adv-current">{current.label}</span>}
      </button>
      {open && (
        <nav id="advanced-nav" className="nav" aria-label="Advanced tools">
          {ADVANCED.map((a) => {
            const active = a.match(path);
            return (
              <Link key={a.href} href={a.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <Icon name={a.icon} /> {a.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/** Flat row for small screens: the steps, then the advanced pages. */
function MobileNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {STEPS.map((s, i) => (
        <Link key={s.href} href={s.href} className={s.match(path) ? "active" : ""}>{i + 1}. {s.label}</Link>
      ))}
      {ADVANCED.map((a) => (
        <Link key={a.href} href={a.href} className={a.match(path) ? "active" : ""}>{a.label}</Link>
      ))}
    </nav>
  );
}

function Status() {
  const { data } = useStudio();
  if (!data) return null;
  const running = workerRunning(data.workerAt);
  return (
    <>
      <span className={`mode ${data.live ? "live" : ""}`} title={data.live ? "Approved posts go to LinkedIn" : "Test mode: nothing reaches LinkedIn"}>
        <Icon name={data.live ? "bolt" : "info"} size={13} />
        {data.live ? "Live posting" : "Test mode"}
      </span>
      <span title={running ? "Publishes scheduled posts on time" : "Scheduled posts won't go out until it's running"}>
        <span className={`dot ${running ? "on" : "off"}`} /> Scheduler {running ? "running" : "not running"}
        {data.settings.queuePaused && " · queue paused"}
      </span>
      <span>
        <span className={`dot ${data.account ? "on" : "off"}`} /> {data.account ? data.account.name : "LinkedIn not connected"}
      </span>
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <EngageReminder />
      <div className="shell">
        <aside className="sidebar">
          <Link href="/" className="brand" style={{ color: "var(--text)", textDecoration: "none" }}>
            <span className="brand-mark">PS</span> Post Studio
          </Link>
          <div className="brand-sub">LinkedIn posts, safely</div>
          <div className="side-rule" />
          <div className="side-eyebrow">Start here, in order</div>
          <Steps />
          <Advanced />
          <div className="sidebar-foot">
            <Status />
          </div>
        </aside>
        <header className="topbar">
          <div className="topbar-row">
            <div className="brand" style={{ padding: 0 }}>
              <span className="brand-mark">PS</span> Post Studio
            </div>
            <Link href="/compose" className="btn small"><Icon name="plus" size={14} /> New post</Link>
          </div>
          <MobileNav />
        </header>
        <div className="content">{children}</div>
      </div>
    </Providers>
  );
}
