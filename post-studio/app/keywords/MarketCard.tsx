"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MarketState } from "@/lib/market";
import TopicGrid, { type Topic } from "../plan/TopicGrid";
import { api, useToast } from "../components/providers";
import { EmptyState, Icon, Spinner, fmtWhen } from "../components/ui";

/** What the target audience is discussing now: Claude + web search, every topic with its sources. */
export default function MarketCard({ picked, toggle, full, onTopics }: { picked: string[]; toggle: (keyword: string) => void; full: boolean; onTopics: (t: Topic[] | null) => void }) {
  const toast = useToast();
  const [market, setMarket] = useState<MarketState | null>(null);
  const [audience, setAudience] = useState("");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const report = useCallback((m: MarketState | null) => { setMarket(m); onTopics(m?.keywords ?? []); }, [onTopics]);

  useEffect(() => {
    api<{ market: MarketState | null; defaultAudience: string; defaultFocus: string }>("/api/keywords/market")
      .then((d) => {
        report(d.market);
        // What you saved in Onboarding → About you.
        setAudience(d.defaultAudience);
        setFocus(d.defaultFocus);
      })
      .catch(() => report(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setBusy(true);
    try {
      const d = await api<{ market: MarketState }>("/api/keywords/market", { method: "POST", json: { audience, focus } });
      report(d.market);
      toast("success", `Found ${d.market.keywords.length} topics with sources.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginTop: 0 }}>
        <button onClick={run} disabled={busy || loading || !audience.trim()}>
          {busy ? <><Spinner /> Searching the web (1-3 minutes)…</> : <><Icon name="search" size={14} /> {market ? "Refresh trending topics" : "Find trending topics"}</>}
        </button>
        <span className="meta">
          {market ? `Last researched ${fmtWhen(market.at)}. ` : ""}Claude searches the web; topics without a source are dropped.
        </span>
      </div>
      {!loading && !audience.trim() && (
        <p className="warning" style={{ margin: "8px 0 0" }}>Add who you write for in <Link href="/onboarding#about">Onboarding → About you</Link> first.</p>
      )}

      {loading ? null : !market ? (
        <EmptyState icon="search" title="No research yet">Find what your audience is talking about right now. Every topic comes with sources and a &quot;Draft post&quot; button.</EmptyState>
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {market.notes && (
            <details className="notes">
              <summary>About these results ({market.keywords.length} topics)</summary>
              <p>{market.notes} Check the sources before you rely on a claim.</p>
            </details>
          )}
          <TopicGrid topics={market.keywords} picked={picked} toggle={toggle} full={full} kind="market" />
        </div>
      )}
    </div>
  );
}
