"use client";

import Link from "next/link";
import { engagement, nextReading, postDate, startOf } from "@/lib/analytics";
import { fmtAge } from "./components/LineChart";
import EngageToday from "./components/EngageToday";
import PostRow from "./components/PostRow";
import { usePostActions } from "./components/postActions";
import { useStudio, workerRunning } from "./components/providers";
import { Callout, EmptyState, Icon, PageHead, Skeleton, Stat, firstLine, fmtNum, fmtRelative, fmtWhen } from "./components/ui";

export default function Overview() {
  const { data, error } = useStudio();
  const actions = usePostActions();

  if (error) return <div className="page"><PageHead title="Overview" /><Callout kind="error">{error}</Callout></div>;
  if (!data)
    return (
      <div className="page">
        <PageHead title="Overview" />
        <div className="grid-4"><Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} /></div>
      </div>
    );

  const items = data.items;
  const drafts = items.filter((p) => p.status === "draft");
  const queued = items.filter((p) => p.status === "queued").sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const failed = items.filter((p) => p.status === "failed");
  const weekStart = startOf(new Date(), "week");
  const postedWeek = items.filter((p) => p.status === "posted" && postDate(p) >= weekStart);
  const scored = items.filter((p) => p.score !== null && p.status !== "draft");
  const avgScore = scored.length ? scored.reduce((a, p) => a + p.score!, 0) / scored.length : null;
  const measuredWeek = postedWeek.filter((p) => p.metrics);
  const recent = [...items].filter((p) => p.status !== "cancelled").sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)).slice(0, 5);
  const next = queued[0];
  const running = workerRunning(data.workerAt);
  const due = items.map((p) => ({ p, n: nextReading(p) })).filter((x) => x.n?.overdue);

  const setup = [
    { done: !!data.account, label: "Connect LinkedIn", href: "/onboarding" },
    { done: !!data.settings.approverName, label: "Set your approver name", href: "/onboarding" },
    { done: items.length > 0, label: "Write your first post", href: "/compose" },
    { done: running, label: "Scheduler is running", href: "/queue" },
  ];
  const setupLeft = setup.filter((s) => !s.done);

  return (
    <div className="page">
      <PageHead title={data.account ? `Hi, ${data.account.name.split(" ")[0]}` : "Overview"} sub="What's going out, what needs you, and how it's doing.">
        <Link href="/queue" className="btn secondary"><Icon name="queue" /> Queue</Link>
        <Link href="/compose" className="btn"><Icon name="plus" /> New post</Link>
      </PageHead>

      <div className="stack">
        {due.length > 0 && (
          <Callout kind="warn">
            <b>{due.length === 1 ? "A reading is due" : `${due.length} readings are due`}</b>: copy the latest numbers from LinkedIn so the hourly and daily charts stay accurate.
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {due.map(({ p, n }) => (
                <li key={p.id}><Link href={`/posts/${p.id}`}>{firstLine(p.text).slice(0, 70)}</Link> <span className="meta">· {fmtAge(n!.hours)} reading, due {fmtWhen(n!.at.toISOString())}</span></li>
              ))}
            </ul>
          </Callout>
        )}
        {setupLeft.length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Get set up</h2><span className="hint">{setup.length - setupLeft.length} of {setup.length} done</span></div>
            <div className="items">
              {setup.map((s) => (
                <Link key={s.label} href={s.href} className="row tight" style={{ color: s.done ? "var(--muted)" : "var(--text)", gap: 10 }}>
                  <span className={`badge plain ${s.done ? "b-posted" : "b-draft"}`} style={{ width: 22, height: 22, padding: 0, justifyContent: "center" }}>
                    {s.done ? <Icon name="check" size={13} /> : null}
                  </span>
                  <span style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {failed.length > 0 && (
          <Callout kind="error">
            <b>{failed.length} post{failed.length === 1 ? "" : "s"} failed to publish.</b> <Link href="/posts?status=failed">Review and retry</Link>
          </Callout>
        )}
        {queued.length > 0 && !running && (
          <Callout kind="warn"><b>The scheduler isn&apos;t running</b>, so queued posts won&apos;t go out yet.</Callout>
        )}

        <EngageToday />

        <div className="grid-4">
          <Stat label="Drafts" value={drafts.length} sub={<Link href="/posts?status=draft">Open drafts</Link>} />
          <Stat label="In the queue" value={queued.length} sub={next ? `Next ${fmtRelative(next.scheduledAt!)}` : data.settings.queuePaused ? "Queue paused" : "Nothing scheduled"} />
          <Stat
            label="Published this week"
            value={postedWeek.length}
            sub={measuredWeek.length ? `${fmtNum(measuredWeek.reduce((a, p) => a + engagement(p)!, 0))} engagements` : postedWeek.some((p) => p.mode === "dry-run") ? "Includes dry runs" : "Since Monday"}
          />
          <Stat label="Avg. human score" value={avgScore === null ? "—" : avgScore.toFixed(0)} sub="Of approved posts (PASS is 70+)" />
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-head"><h2>Next scheduled post</h2><Link className="hint" href="/queue">Manage queue</Link></div>
            {next ? (
              <>
                <div className="row tight">
                  <Icon name="clock" />
                  <b>{fmtWhen(next.scheduledAt)}</b>
                  <span className="meta">({fmtRelative(next.scheduledAt!)})</span>
                  {data.settings.queuePaused && <span className="tag">queue paused</span>}
                </div>
                <p className="clamp-2" style={{ margin: "10px 0 12px" }}>{firstLine(next.text)}</p>
                <div className="row tight">
                  <Link className="btn secondary small" href={`/compose?id=${next.id}`}><Icon name="edit" size={13} /> Edit</Link>
                  <button className="secondary small" onClick={() => actions.publishNow(next)} disabled={actions.isBusy(next.id)}><Icon name="send" size={13} /> Publish now</button>
                </div>
                {queued.length > 1 && <p className="meta" style={{ marginBottom: 0 }}>Then {queued.length - 1} more, until {fmtWhen(queued[queued.length - 1].scheduledAt)}.</p>}
              </>
            ) : (
              <EmptyState icon="calendar" title="Nothing scheduled" action={<Link href="/compose" className="btn small"><Icon name="plus" size={14} /> Write a post</Link>}>
                {data.nextSlot ? `Your next free slot is ${fmtWhen(data.nextSlot)}.` : "Add posting slots in Settings to use the queue."}
              </EmptyState>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>Recent activity</h2><Link className="hint" href="/posts">All posts</Link></div>
            {recent.length === 0 ? (
              <EmptyState icon="pen" title="No posts yet">Your drafts, queued and published posts show up here.</EmptyState>
            ) : (
              <div className="items">
                {recent.map((p) => <PostRow key={p.id} post={p} actions={actions} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="credit">
        Humanizer and skills from the open-source LinkedIn agent skill pack by Jake Schincariol (MIT). Post Studio adds the compliance check, approval flow, queue and UI.
      </p>
    </div>
  );
}
