"use client";

import Link from "next/link";
import type { PlanState } from "../Growth";
import { Icon, Spinner } from "../components/ui";
import { MAX_POSTS } from "./usePlanSettings";

/** Your week: how many posts, which topics, and a rebuild button that tells you when the plan is out of date. */
export default function WeekControls({
  p, count, setCount, picked, setPicked, goTrending,
}: {
  p: PlanState;
  count: number;
  setCount: (n: number) => void;
  picked: string[];
  setPicked: (v: string[] | ((prev: string[]) => string[])) => void;
  goTrending: () => void;
}) {
  if (p.loaded && !p.score)
    return (
      <div className="empty-hint">
        <b>Score your profile first.</b> Claude builds your week from it.{" "}
        <Link href="/onboarding#profile" className="btn small">Go to Onboarding → Your profile</Link>
      </div>
    );

  const plan = p.plan;
  // A plan from before this feature has no saved basis: it had no topics and as many posts as it holds.
  const basis = plan ? (plan.basis ?? { count: plan.week.length, topics: [] as string[] }) : null;
  const sameTopics = !!basis && basis.topics.length === picked.length && basis.topics.every((t) => picked.includes(t));
  const stale = !!basis && (basis.count !== count || !sameTopics);
  const build = () => p.build({ count, topics: picked });
  const label = p.busy ? "Claude is planning (about a minute)…" : !plan ? `Plan my ${count} post${count === 1 ? "" : "s"}` : stale ? "Rebuild with these settings" : "Rebuild my plan";

  return (
    <div className="week-controls">
      <div className="wc-grid">
        <div>
          <div className="eg-label">How many posts</div>
          <div className="seg" role="radiogroup" aria-label="How many posts">
            {Array.from({ length: MAX_POSTS }, (_, i) => i + 1).map((n) => (
              <button key={n} className={count === n ? "on" : ""} aria-pressed={count === n} onClick={() => setCount(n)} disabled={p.busy}>{n}</button>
            ))}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="eg-label">Built from</div>
          <div className="topic-chips">
            <span className="topic-chip fixed"><Icon name="user" size={12} /> Your profile</span>
            {picked.map((k) => (
              <span key={k} className="topic-chip">
                {k}
                <button type="button" aria-label={`Remove ${k}`} onClick={() => setPicked((x) => x.filter((y) => y !== k))} disabled={p.busy}><Icon name="x" size={11} /></button>
              </span>
            ))}
            <button type="button" className="topic-add" onClick={goTrending}><Icon name="plus" size={12} /> {picked.length ? "Change topics" : "Add topics"}</button>
          </div>
        </div>
      </div>

      {stale && !p.busy && (
        <div className="engage-nudge">
          <Icon name="refresh" size={14} /> You changed {basis!.count !== count && !sameTopics ? "the post count and topics" : basis!.count !== count ? "the post count" : "the topics"}. Rebuild to update your plan.
        </div>
      )}

      <div className="row" style={{ marginTop: 0 }}>
        <button onClick={build} disabled={p.busy || !p.score} className={plan && !stale ? "secondary" : ""}>
          {p.busy ? <Spinner /> : <Icon name="sparkle" size={14} />} {label}
        </button>
        <span className="meta">
          {plan ? `Built ${new Date(plan.at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} for ${plan.week.length} post${plan.week.length === 1 ? "" : "s"}${basis && basis.topics.length ? ` and ${basis.topics.length} topic${basis.topics.length === 1 ? "" : "s"}` : ""}. ` : ""}Nothing is posted.
        </span>
      </div>
      {p.error && <p className="problem">{p.error}</p>}
      {plan && plan.week.length === 0 && !p.busy && (
        <div className="callout warn" style={{ display: "block" }}>
          <b>Claude didn&apos;t write any posts this time.</b> It stopped to check something with you first. Read its note below, fix it (often your profile PDF in{" "}
          <Link href="/onboarding#profile">Onboarding</Link>), then rebuild.
        </div>
      )}
      {plan?.notes && (
        <details className="notes" open={plan.week.length === 0}>
          <summary>Claude&apos;s notes on this plan</summary>
          <p>{plan.notes}</p>
        </details>
      )}
    </div>
  );
}
