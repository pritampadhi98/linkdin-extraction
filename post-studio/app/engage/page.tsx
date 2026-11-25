"use client";

import { EngagePlan, PlanBuilder, usePlan } from "../Growth";
import CommentHelper from "../plan/CommentHelper";
import EngageToday from "../components/EngageToday";
import { Icon, PageHead } from "../components/ui";

/** Advanced tools: daily engagement. Whose posts to comment on, and help drafting the comment. You post it yourself. */
export default function EngagePage() {
  const plan = usePlan();
  return (
    <div className="page">
      <PageHead title="Engage" sub="Whose posts to comment on each day, and help drafting the comment. You post it yourself." />
      <div className="stack">
        <ol className="how-steps" aria-label="How to do today's engagement">
          <li><span>1</span><div><b>Find a post</b>Click a search chip below. LinkedIn opens with matching posts.</div></li>
          <li><span>2</span><div><b>Copy its text</b>Pick a post where you have a real number or story to add.</div></li>
          <li><span>3</span><div><b>Draft here</b>Paste it in <a href="#comment">Draft a comment</a>. Claude writes 2 options in your voice.</div></li>
          <li><span>4</span><div><b>Post and count</b>Copy one, post it on LinkedIn yourself, then tap +1.</div></li>
        </ol>
        <EngageToday />
        <section className="card">
          <PlanBuilder p={plan} what="your daily engagement list" />
          {plan.plan && <div style={{ marginTop: 14 }}><EngagePlan plan={plan.plan} /></div>}
        </section>
        <section className="card" id="comment">
          <div className="card-head"><h2><Icon name="sparkle" size={16} /> Draft a comment</h2><span className="hint">For your daily engagement. You post it yourself</span></div>
          <CommentHelper />
        </section>
      </div>
    </div>
  );
}
