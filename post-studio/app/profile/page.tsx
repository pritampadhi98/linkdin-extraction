"use client";

import { PlanBuilder, ProfileFixes, usePlan } from "../Growth";
import { PageHead } from "../components/ui";

/** Advanced tools: rewrites for your headline, About and experience. Copy them into LinkedIn yourself. */
export default function ProfileFixesPage() {
  const plan = usePlan();
  return (
    <div className="page">
      <PageHead title="Profile fixes" sub="Rewrites for your headline, About and experience. Copy them into LinkedIn yourself." />
      <section className="card">
        <PlanBuilder p={plan} what="profile rewrites" />
        {plan.plan && <div style={{ marginTop: 14 }}><ProfileFixes plan={plan.plan} /></div>}
      </section>
    </div>
  );
}
