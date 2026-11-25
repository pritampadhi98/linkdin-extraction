"use client";

import Link from "next/link";
import type { MarketState } from "@/lib/market";
import { Icon } from "../components/ui";

export type Topic = MarketState["keywords"][number];

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Topic cards, shared by "From your profile" and "Top in the market". Select to combine; Draft post for one. */
export default function TopicGrid({
  topics, picked, toggle, full, kind,
}: {
  topics: Topic[];
  picked: string[];
  toggle: (keyword: string) => void;
  full: boolean;
  kind: "profile" | "market";
}) {
  return (
    <div className="trend-grid">
      {topics.map((k) => {
        const on = picked.includes(k.keyword);
        const blocked = !on && full;
        return (
          <article key={`${kind}:${k.keyword}`} className={`trend-card ${on ? "picked" : ""}`}>
            <div className="trend-top">
              <b className="trend-title">{k.keyword}</b>
              <span className="row tight" style={{ marginTop: 0, flexWrap: "nowrap" }}>
                {k.hashtag && <span className="tag">{k.hashtag}</span>}
                <button type="button" className={`pick-btn ${on ? "on" : ""}`} aria-pressed={on} disabled={blocked} onClick={() => toggle(k.keyword)}
                  title={blocked ? "You can select up to 6 topics" : on ? "Remove from your selection" : "Select to plan your week or draft a post around it"}>
                  {on ? <><Icon name="check" size={13} /> Selected</> : <><Icon name="plus" size={13} /> Select</>}
                </button>
              </span>
            </div>
            <p className="trend-why">{k.why}</p>
            <div className={`trend-angle ${k.angle ? "" : "none"}`}>
              <span className="eg-label">Your angle</span>
              {k.angle || "No angle from your proof list yet. Add a related number or story in your voice profile."}
            </div>
            <div className="trend-foot">
              <div className="search-chips">
                {k.sources.length === 0 ? (
                  <span className="source-chip profile-chip"><Icon name="user" size={11} /> From your profile</span>
                ) : (
                  k.sources.map((src) => (
                    <a key={src.url} className="source-chip" href={src.url} target="_blank" rel="noreferrer noopener" title={src.title}>
                      {host(src.url)}{src.date ? ` · ${src.date}` : ""}
                    </a>
                  ))
                )}
              </div>
              <Link className="btn small secondary" href={`/compose?trend=${encodeURIComponent(k.keyword)}`} title="Claude drafts a post on just this topic">
                <Icon name="pen" size={13} /> Draft post
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
