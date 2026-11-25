"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MarketState } from "@/lib/market";
import { api, useToast } from "../components/providers";
import { EmptyState, Icon, Spinner, fmtWhen } from "../components/ui";
import TopicGrid, { type Topic } from "./TopicGrid";

/** Topics and keywords drawn from your own profile: where your real proof is strongest. */
export default function ProfileTopics({
  picked, toggle, full, hasProfile, profileLoaded, onTopics,
}: {
  picked: string[];
  toggle: (keyword: string) => void;
  full: boolean;
  hasProfile: boolean;
  profileLoaded: boolean;
  onTopics: (t: Topic[] | null) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<MarketState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const report = useCallback((d: MarketState | null) => { setData(d); onTopics(d?.keywords ?? []); }, [onTopics]);

  useEffect(() => {
    api<{ topics: MarketState | null }>("/api/profile/topics")
      .then((d) => report(d.topics))
      .catch(() => report(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setBusy(true);
    try {
      const d = await api<{ topics: MarketState }>("/api/profile/topics", { method: "POST", json: {} });
      report(d.topics);
      toast("success", `Found ${d.topics.keywords.length} topics from your profile.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (profileLoaded && !hasProfile)
    return (
      <div className="empty-hint">
        <b>Score your profile first.</b> Topics and keywords come from it.{" "}
        <Link href="/onboarding#profile" className="btn small">Go to Onboarding → Your profile</Link>
      </div>
    );

  return (
    <div>
      <div className="row" style={{ marginTop: 0 }}>
        <button onClick={run} disabled={busy || loading || !profileLoaded}>
          {busy ? <><Spinner /> Reading your profile…</> : <><Icon name="sparkle" size={14} /> {data ? "Refresh from my profile" : "Suggest topics from my profile"}</>}
        </button>
        <span className="meta">{data ? `Last suggested ${fmtWhen(data.at)}. ` : ""}Built only from your own proof; nothing is looked up online.</span>
      </div>
      {loading ? null : !data ? (
        <EmptyState icon="user" title="No topics yet">Claude reads your profile and suggests topics and keywords where you have real proof to share.</EmptyState>
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {data.notes && (
            <details className="notes">
              <summary>About these topics ({data.keywords.length})</summary>
              <p>{data.notes}</p>
            </details>
          )}
          <TopicGrid topics={data.keywords} picked={picked} toggle={toggle} full={full} kind="profile" />
        </div>
      )}
    </div>
  );
}
