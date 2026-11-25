"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GrowthState, Plan, PlanBasis, Score } from "@/lib/growth";
import { liSearchUrl } from "./components/ui";

/** Tomorrow + offset, at HH:MM local time. */
function slot(dayOffset: number, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.max(0, Math.min(6, Math.round(dayOffset))));
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

const Copy = ({ text }: { text: string }) => (
  <button className="secondary" style={{ padding: "2px 10px", fontSize: 13 }} onClick={() => navigator.clipboard.writeText(text)}>
    Copy
  </button>
);

/** Saved score and plan, shared by Onboarding (score) and Plan (posts). */
function useGrowth() {
  const [score, setScore] = useState<(Score & { at: string; via?: string }) | null>(null);
  const [plan, setPlan] = useState<(Plan & { at: string; via?: string; basis?: PlanBasis }) | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/profile/score")
      .then((r) => r.json())
      .then((s: GrowthState) => {
        if (s.score) setScore(s.score);
        if (s.plan) setPlan(s.plan);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  return { score, setScore, plan, setPlan, loaded };
}

/** Onboarding: upload the profile PDF and get scored. */
export function ProfileScore({ onScored }: { onScored?: (scored: boolean) => void }) {
  const { score, setScore, loaded } = useGrowth();
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState<"score" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) onScored?.(!!score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, score]);

  async function runScore() {
    setBusy("score");
    setError(null);
    try {
      const form = new FormData();
      if (pdf) form.set("pdf", pdf);
      const r = await fetch("/api/profile/score", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Scoring failed");
      setScore(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pct = score && score.visible_max ? Math.round((score.visible_score / score.visible_max) * 100) : 0;

  return (
    <div>
      <div>
        <p className="meta">
          LinkedIn&apos;s sign-in doesn&apos;t share your headline or experience, so upload your profile PDF: on your
          profile, More → Save to PDF.
        </p>
        <div className="row">
          <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          <button onClick={runScore} disabled={busy !== null || (!pdf && !score)}>
            {busy === "score" ? "Claude is scoring…" : score ? "Re-score" : "Score my profile"}
          </button>
        </div>
        {score && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 22, margin: "4px 0" }}>
              <b>{score.visible_score}</b> / {score.visible_max}{" "}
              <span className="meta">({pct}% of what the PDF shows · scored {new Date(score.at).toLocaleString()}{score.via ? ` via ${score.via}` : ""})</span>
            </p>
            <p>{score.summary}</p>
            <table>
              <tbody>
                {score.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.score === null ? <span className="meta">n/a</span> : `${it.score}/${it.max}`}</td>
                    <td className="meta">{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 8 }}><b>Biggest gains:</b></p>
            <ol className="list">{score.top_fixes.map((f) => <li key={f}>{f}</li>)}</ol>
          </div>
        )}
      </div>

      {error && <p className="problem">{error}</p>}
    </div>
  );
}

export type SavedPlan = Plan & { at: string; via?: string; basis?: PlanBasis };

/** One loaded weekly plan, shared by the Plan page's tabs (rebuild in one tab updates all). */
export function usePlan() {
  const { score, plan, setPlan, loaded } = useGrowth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Builds a plan. With no options it repeats what the current plan was built from. */
  async function build(opts?: PlanBasis) {
    setBusy(true);
    setError(null);
    try {
      const body = opts ?? plan?.basis ?? {};
      const r = await fetch("/api/profile/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Plan failed");
      setPlan(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { score, plan, loaded, busy, error, build };
}
export type PlanState = ReturnType<typeof usePlan>;

/** The build / rebuild bar, with Claude's notes folded away. */
export function PlanBuilder({ p, what }: { p: PlanState; what: string }) {
  if (p.loaded && !p.score)
    return (
      <div className="empty-hint">
        <b>Score your profile first.</b> Claude builds your week from it.{" "}
        <Link href="/onboarding#profile" className="btn small">Go to Onboarding → Your profile</Link>
      </div>
    );
  return (
    <div className="plan-builder">
      <div className="row" style={{ marginTop: 0 }}>
        <button onClick={() => p.build()} disabled={p.busy || !p.score} className={p.plan ? "secondary" : ""}>
          {p.busy ? "Claude is planning (about a minute)…" : p.plan ? "Rebuild my plan" : "Plan my week"}
        </button>
        <span className="meta">
          {p.plan ? `Built ${new Date(p.plan.at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : `Builds ${what} from your profile score and the people you listed in Onboarding.`} Nothing is posted.
        </span>
      </div>
      {p.error && <p className="problem">{p.error}</p>}
      {p.plan?.notes && (
        <details className="notes">
          <summary>Claude&apos;s notes on this plan</summary>
          <p>{p.plan.notes}</p>
        </details>
      )}
    </div>
  );
}

/** Next week's posts as cards: when, what kind, the angle, blanks to fill, and the draft. */
export function WeekPosts({ plan, onUsePost }: { plan: SavedPlan; onUsePost: (text: string, when: Date) => void }) {
  const posts = [...plan.week].sort((a, b) => slot(a.day_offset, a.time).getTime() - slot(b.day_offset, b.time).getTime());
  return (
    <div className="week-list">
      {posts.map((p, i) => {
        const when = slot(p.day_offset, p.time);
        return (
          <article key={i} className="week-card">
            <div className="week-when">
              <b>{when.toLocaleDateString(undefined, { weekday: "short" })}</b>
              <span>{when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              <span className="meta">{when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="week-body">
              <div className="row tight" style={{ marginTop: 0 }}>
                <span className="tag">{p.type}</span>
                <span className="meta">Hook #{p.hook_id} · {p.hook_name}</span>
              </div>
              <p className="week-angle">{p.angle}</p>
              {p.placeholders.length > 0 && (
                <details className="blanks">
                  <summary>{p.placeholders.length} blank{p.placeholders.length === 1 ? "" : "s"} to fill before posting</summary>
                  <ul className="list">{p.placeholders.map((b) => <li key={b}>{b}</li>)}</ul>
                </details>
              )}
              <details className="draft-preview">
                <summary>Show draft</summary>
                <div className="diff" style={{ maxHeight: 260 }}>{p.draft}</div>
              </details>
            </div>
            <div className="week-act">
              <button onClick={() => onUsePost(p.draft, when)}>Use this post →</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Who to engage with: group cards with one-click LinkedIn searches, plus the people you named. */
export function EngagePlan({ plan }: { plan: SavedPlan }) {
  const e = plan.engagement;
  return (
    <div className="stack">
      <div className="engage-groups">
        {e.groups.map((g, i) => (
          <div key={`${g.kind}-${i}`} className="engage-group">
            <div className="row tight" style={{ marginTop: 0, justifyContent: "space-between" }}>
              <b style={{ textTransform: "capitalize" }}>{g.kind}</b>
              <span className="badge plain b-queued">{g.count} a day</span>
            </div>
            <p className="meta" style={{ margin: "6px 0 10px" }}>{g.who}</p>
            <div className="eg-label">Find them</div>
            <div className="search-chips">
              {g.search_terms.map((t) => (
                <a key={t} className="search-chip" href={liSearchUrl(t)} target="_blank" rel="noreferrer noopener" title={`Search LinkedIn posts for "${t}"`}>{t} ↗</a>
              ))}
            </div>
            <div className="eg-label" style={{ marginTop: 10 }}>What to add</div>
            <p style={{ margin: 0, fontSize: 13.5 }}>{g.comment_angle}</p>
          </div>
        ))}
      </div>
      {e.named.length > 0 && (
        <div>
          <div className="eg-label">People and companies you named</div>
          <div className="named-list">
            {e.named.map((n) => (
              <div key={n.name} className="named-item">
                <div><b>{n.name}</b><div className="meta">{n.why}</div></div>
                <a className="search-chip" href={liSearchUrl(n.name)} target="_blank" rel="noreferrer noopener" title={`Search LinkedIn posts by or about ${n.name}`}>Find their posts ↗</a>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="meta" style={{ margin: 0 }}>About {e.daily_minutes} minutes a day, before you post. Links open LinkedIn in your browser; you comment by hand.</p>
    </div>
  );
}

/** Profile rewrites to paste into LinkedIn yourself. */
export function ProfileFixes({ plan }: { plan: SavedPlan }) {
  const pr = plan.profile;
  return (
    <div className="stack">
      <div>
        <div className="eg-label">Headline options</div>
        <div className="stack" style={{ gap: 8 }}>
          {pr.headlines.map((h) => (
            <div key={h} className="copy-row"><span>{h}</span><Copy text={h} /></div>
          ))}
        </div>
      </div>
      <div>
        <div className="row tight" style={{ marginTop: 0, justifyContent: "space-between" }}><div className="eg-label">About</div><Copy text={pr.about} /></div>
        <details className="draft-preview" open>
          <summary>Show About text</summary>
          <div className="diff" style={{ maxHeight: 280 }}>{pr.about}</div>
        </details>
      </div>
      <div>
        <div className="eg-label">Experience</div>
        {pr.experience.map((x) => {
          const t = `${x.summary}\n\n${x.bullets.map((b) => `- ${b}`).join("\n")}`;
          return (
            <details key={x.role + x.dates} className="draft-preview">
              <summary>{x.role} · {x.company} <span className="meta">{x.dates}</span></summary>
              <div className="row tight" style={{ justifyContent: "flex-end" }}><Copy text={t} /></div>
              <div className="diff">{t}</div>
            </details>
          );
        })}
      </div>
      <div>
        <div className="eg-label">Pin these skills</div>
        <div className="chips">{pr.top_skills.map((k) => <span key={k} className="chip" style={{ cursor: "default" }}>{k}</span>)}</div>
      </div>
      {pr.other_fixes.length > 0 && (
        <div>
          <div className="eg-label">Other fixes</div>
          <ul className="list">{pr.other_fixes.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
