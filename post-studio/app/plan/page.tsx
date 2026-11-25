"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { QueueItem } from "@/lib/queue";
import type { Settings } from "@/lib/settings";
import { WeekPosts, usePlan } from "../Growth";
import MarketCard from "../keywords/MarketCard";
import ProfileTopics from "./ProfileTopics";
import type { Topic } from "./TopicGrid";
import WeekControls from "./WeekControls";
import { MAX_TOPICS, usePlanSettings } from "./usePlanSettings";
import { api, useStudio, useToast } from "../components/providers";
import { Icon, PageHead, Spinner, type IconName } from "../components/ui";

type Tab = "trending" | "week";

const TABS: { id: Tab; label: string; icon: IconName; blurb: string }[] = [
  { id: "trending", label: "Topic ideas", icon: "search", blurb: "Topics and keywords from your own profile and from what your audience is talking about. Select the ones you like, then plan your week or draft a post around them." },
  { id: "week", label: "Your week", icon: "calendar", blurb: "Posts for next week, built from your profile and the topics you selected. Fill the blanks, then send one to Review." },
];

/** Old anchors (#trending, #profile-plan) and new ones open the right tab. */
const fromHash = (h: string): Tab | null => (h === "trending" ? "trending" : h === "week" || h === "profile-plan" ? "week" : null);

/** Engage and Profile fixes moved to Advanced tools; old /plan#engage style links go there. */
const movedTo = (h: string): string | null =>
  h === "engage" || h === "comment" ? "/engage" : h === "profile" || h === "profile-fixes" ? "/profile" : null;

const TAB_KEY = "ps.planTab";

/** Step 2: ideas from what's trending and from your profile, in two tabs. */
export default function PlanPage() {
  const router = useRouter();
  const { refresh } = useStudio();
  const toast = useToast();
  const plan = usePlan();
  const settings = usePlanSettings();
  const [profileKw, setProfileKw] = useState<Topic[] | null>(null); // null = not loaded yet
  const [marketKw, setMarketKw] = useState<Topic[] | null>(null);
  const { picked, setPicked } = settings;
  const toggle = useCallback((k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= MAX_TOPICS ? p : [...p, k])), [setPicked]);

  // A refresh can drop topics you had selected: once both lists are loaded, keep only ones that still exist.
  useEffect(() => {
    if (!profileKw || !marketKw) return;
    const valid = new Set([...profileKw, ...marketKw].map((t) => t.keyword));
    setPicked((p) => (p.every((k) => valid.has(k)) ? p : p.filter((k) => valid.has(k))));
  }, [profileKw, marketKw, setPicked]);
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("trending");

  useEffect(() => {
    api<{ settings: Settings }>("/api/settings").then((d) => setS(d.settings)).catch(() => {});
    const moved = movedTo(window.location.hash.slice(1));
    if (moved) { router.replace(moved + (window.location.hash === "#comment" ? "#comment" : "")); return; }
    const h = fromHash(window.location.hash.slice(1));
    let saved: Tab | null = null;
    try { saved = fromHash(localStorage.getItem(TAB_KEY) ?? ""); } catch {}
    if (h || saved) setTab((h ?? saved)!);
    // Links to /plan#engage etc. while already on this page only change the hash.
    const onHash = () => {
      const m = movedTo(window.location.hash.slice(1));
      if (m) return router.replace(m);
      const t = fromHash(window.location.hash.slice(1));
      if (t) setTab(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function pick(t: Tab) {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
    window.history.replaceState(null, "", `#${t}`);
  }

  async function usePost(text: string, when: Date) {
    try {
      const f = new FormData();
      f.set("action", "draft");
      f.set("text", text);
      if (when > new Date()) f.set("scheduledAt", when.toISOString());
      const { item } = await api<{ item: QueueItem }>("/api/posts", { method: "POST", body: f });
      await refresh();
      toast("success", "Saved as a draft. Fill in any {{placeholders}}, then review and approve it.");
      router.push(`/compose?id=${item.id}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  const p = plan.plan;
  const count: Partial<Record<Tab, string>> = {
    week: p ? `${p.week.length}` : undefined,
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="page">
      <PageHead title="Plan" sub="Decide what to post next: from what's trending, or from your own profile." />

      <div className="plan-context">
        <Icon name="user" size={15} />
        <span>
          Writing for <b>{s?.audience || "your audience"}</b>
          {s?.focus ? <> · focus <b>{s.focus}</b></> : null}
        </span>
        <span className="spacer" />
        <Link href="/onboarding#about" className="meta">Edit in Onboarding</Link>
      </div>

      <div className="plan-tabs" role="tablist" aria-label="Plan">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className={tab === t.id ? "on" : ""} onClick={() => pick(t.id)}>
            <Icon name={t.icon} size={15} /> {t.label}
            {count[t.id] && <span className="tab-count">{count[t.id]}</span>}
          </button>
        ))}
      </div>

      <section className="card plan-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <p className="plan-blurb">{current.blurb}</p>

        {/* Kept mounted (just hidden) so a running search survives switching tabs. */}
        <div hidden={tab !== "trending"}>
          <div className="idea-section">
            <h3 className="idea-head"><span className="num">1</span> From your profile</h3>
            <p className="idea-sub">Topics and keywords where you have real proof to share. Built from your profile, nothing looked up online.</p>
            <ProfileTopics picked={picked} toggle={toggle} full={picked.length >= MAX_TOPICS} hasProfile={!!plan.score} profileLoaded={plan.loaded} onTopics={setProfileKw} />
          </div>
          <div className="idea-section">
            <h3 className="idea-head"><span className="num">2</span> Top keywords in the market</h3>
            <p className="idea-sub">What your audience is talking about right now, researched on the web, each with sources.</p>
            <MarketCard picked={picked} toggle={toggle} full={picked.length >= MAX_TOPICS} onTopics={setMarketKw} />
          </div>

          {picked.length > 0 && (
            <div className="pick-bar" role="region" aria-label="Selected topics">
              <div style={{ minWidth: 0 }}>
                <b>{picked.length} topic{picked.length === 1 ? "" : "s"} selected</b>
                <div className="pick-list">
                  {picked.map((k) => <span key={k} className="tag">{[...(profileKw ?? []), ...(marketKw ?? [])].find((x) => x.keyword === k)?.hashtag || k}</span>)}
                </div>
              </div>
              <span className="row tight" style={{ marginTop: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="ghost small" onClick={() => setPicked([])}>Clear</button>
                {picked.length <= 4 ? (
                  <Link className="btn secondary" href={`/compose?${picked.map((k) => `trend=${encodeURIComponent(k)}`).join("&")}`} title="Claude writes one post that links these topics to your own experience">
                    <Icon name="pen" size={14} /> Draft one post
                  </Link>
                ) : (
                  <button className="secondary" disabled title="A single post combines up to 4 topics"><Icon name="pen" size={14} /> Draft one post (max 4)</button>
                )}
                <button onClick={() => { pick("week"); plan.build({ count: settings.count, topics: picked }); }} disabled={plan.busy} title="Rebuild your week of posts around these topics">
                  {plan.busy ? <><Spinner /> Planning…</> : <><Icon name="calendar" size={14} /> Plan my {settings.count} post{settings.count === 1 ? "" : "s"} with {picked.length === 1 ? "this" : "these"} →</>}
                </button>
              </span>
            </div>
          )}
        </div>

        {tab === "week" && (
          <div className="stack">
            <WeekControls p={plan} count={settings.count} setCount={settings.setCount} picked={settings.picked} setPicked={settings.setPicked} goTrending={() => pick("trending")} />
            {p && <div className={`week-wrap ${plan.busy ? "busy" : ""}`}><WeekPosts plan={p} onUsePost={usePost} /></div>}
          </div>
        )}

      </section>
    </div>
  );
}
