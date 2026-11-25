"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { buckets, keywordStats, keywords, postDate, type KeywordStat, type Period } from "@/lib/analytics";
import BarChart from "../components/BarChart";
import { useStudio } from "../components/providers";
import { RangeControls, useRange } from "../components/useRange";
import { EmptyState, Icon, PageHead, Skeleton, StatusBadge, firstLine, fmtNum, fmtWhen } from "../components/ui";

type Scope = "posted" | "all";
type Sort = "count" | "posts" | "engagement";

function Trend({ k }: { k: KeywordStat }) {
  if (k.prevCount === 0) return <span className="tag">new</span>;
  const d = k.count - k.prevCount;
  if (d === 0) return <span className="meta">same</span>;
  return <span className={d > 0 ? "up" : "down"}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
}

function Keywords() {
  const { data } = useStudio();
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get("k");
  const r = useRange("30d");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>("count");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  useEffect(() => setPeriod(r.suggested === "week" || r.days > 14 ? "week" : "day"), [r.suggested, r.days]);

  const pool = useMemo(
    () => (data?.items ?? []).filter((p) => p.status !== "cancelled" && (scope === "all" || p.status === "posted")),
    [data, scope],
  );
  const inRange = pool.filter((p) => postDate(p) >= r.from && postDate(p) < r.to);
  const inPrev = pool.filter((p) => postDate(p) >= r.prevFrom && postDate(p) < r.prevTo);
  const stats = useMemo(() => keywordStats(inRange, inPrev), [inRange, inPrev]);

  const needle = q.trim().toLowerCase();
  const rows = stats
    .filter((s) => !needle || s.keyword.includes(needle))
    .sort((a, b) =>
      sort === "posts" ? b.posts.length - a.posts.length || b.count - a.count
      : sort === "engagement" ? (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1) || b.count - a.count
      : 0,
    )
    .slice(0, 50);
  const maxCount = Math.max(1, ...rows.map((s) => s.count));
  const anyMetrics = stats.some((s) => s.avgEngagement !== null);
  const sel = selected ? stats.find((s) => s.keyword === selected) ?? null : null;
  const selPosts = selected ? pool.filter((p) => keywords(p.text).includes(selected)) : [];

  return (
    <div className="page">
      <PageHead title="Keywords" sub="The words and hashtags in your own posts, and how they perform." />

      <h2 style={{ margin: "8px 0 12px" }}>Your posts</h2>

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row tight" style={{ gap: 12 }}>
          <RangeControls r={r} />
          <div className="seg" role="group" aria-label="Which posts">
            <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>All posts</button>
            <button className={scope === "posted" ? "on" : ""} onClick={() => setScope("posted")}>Published only</button>
          </div>
          <span className="spacer" />
          <input type="search" placeholder="Search keywords" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} aria-label="Search keywords" />
        </div>
      </div>

      {!data ? (
        <Skeleton h={300} />
      ) : stats.length === 0 ? (
        <div className="card">
          <EmptyState icon="tag" title="No keywords in this range" action={<Link href="/compose" className="btn"><Icon name="plus" /> Write a post</Link>}>
            Keywords come from the text of your posts. Try a longer range{scope === "posted" ? ' or "All posts"' : ""}.
          </EmptyState>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h2>Top keywords <span className="meta">· {inRange.length} post{inRange.length === 1 ? "" : "s"} · trend vs {r.prevLabel}</span></h2>
            <div className="seg" role="group" aria-label="Sort by">
              <button className={sort === "count" ? "on" : ""} onClick={() => setSort("count")}>Most used</button>
              <button className={sort === "posts" ? "on" : ""} onClick={() => setSort("posts")}>Most posts</button>
              <button className={sort === "engagement" ? "on" : ""} onClick={() => setSort("engagement")} disabled={!anyMetrics} title={anyMetrics ? "" : "Add metrics to published posts first"}>Most engaging</button>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="meta">No keyword matches “{q}”.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Keyword</th><th style={{ width: "28%" }}>Frequency</th><th className="num">Posts</th><th className="num">Trend</th><th className="num" title="Average reactions + comments + reposts per measured post">Avg. engagement</th></tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.keyword} onClick={() => router.replace(`/keywords?k=${encodeURIComponent(s.keyword)}`)} style={{ cursor: "pointer", background: s.keyword === selected ? "var(--accent-soft)" : undefined }}>
                      <td className="meta">{i + 1}</td>
                      <td><b>{s.keyword}</b></td>
                      <td>
                        <div className="row tight" style={{ gap: 8, flexWrap: "nowrap" }}>
                          <div className="kw-bar" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                          <span className="meta">{s.count}</span>
                        </div>
                      </td>
                      <td className="num">{s.posts.length}</td>
                      <td className="num"><Trend k={s} /></td>
                      <td className="num">{s.avgEngagement === null ? <span className="faint">—</span> : <>{fmtNum(s.avgEngagement)} <span className="meta">({s.measuredPosts})</span></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!anyMetrics && <p className="meta" style={{ marginBottom: 0 }}>Engagement shows once published posts have metrics (Posts → Published → Add metrics).</p>}
        </div>
      )}

      {selected && (
        <>
          <div className="backdrop" style={{ background: "rgba(10,15,22,.25)" }} onClick={() => router.replace("/keywords")} />
          <aside className="drawer" aria-label={`Posts with ${selected}`}>
            <div className="row tight" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{selected}</h2>
              <span className="spacer" />
              <button className="ghost icon" aria-label="Close" onClick={() => router.replace("/keywords")}><Icon name="x" /></button>
            </div>
            {sel ? (
              <div className="grid" style={{ gap: 10, marginBottom: 16 }}>
                <div className="card stat" style={{ padding: 12 }}><div className="label">Uses in range</div><div className="value" style={{ fontSize: 22 }}>{sel.count}</div><div className="sub"><Trend k={sel} /> vs {r.prevLabel}</div></div>
                <div className="card stat" style={{ padding: 12, marginTop: 0 }}><div className="label">Avg. engagement</div><div className="value" style={{ fontSize: 22 }}>{sel.avgEngagement === null ? "—" : fmtNum(sel.avgEngagement)}</div><div className="sub">{sel.measuredPosts} measured post{sel.measuredPosts === 1 ? "" : "s"}</div></div>
              </div>
            ) : (
              <p className="meta">Not used in the selected range. All posts that use it:</p>
            )}
            {sel && (
              <div style={{ marginBottom: 16 }}>
                <b style={{ fontSize: 13 }}>Trend ({period === "week" ? "weekly" : "daily"})</b>
                <BarChart
                  title="Uses"
                  height={150}
                  data={buckets(sel.posts, period, r.from, new Date(r.to.getTime() - 1)).map((b) => ({
                    label: b.label,
                    value: b.posts.reduce((a, p) => a + keywords(p.text).filter((k) => k === selected).length, 0),
                  }))}
                />
              </div>
            )}
            <b style={{ fontSize: 13 }}>Posts ({selPosts.length})</b>
            <div className="items" style={{ marginTop: 8 }}>
              {selPosts.map((p) => (
                <Link key={p.id} href={`/compose?id=${p.id}`} className="item" style={{ gridTemplateColumns: "1fr", color: "var(--text)", textDecoration: "none" }}>
                  <div>
                    <div className="title clamp-2">{firstLine(p.text)}</div>
                    <div className="sub"><StatusBadge post={p} /><span>{fmtWhen(postDate(p).toISOString())}</span></div>
                  </div>
                </Link>
              ))}
              {selPosts.length === 0 && <p className="meta">No posts use this keyword.</p>}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default function KeywordsPage() {
  return <Suspense><Keywords /></Suspense>;
}
