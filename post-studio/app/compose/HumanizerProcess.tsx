"use client";

import type { GateResult } from "@/lib/gate";
import { Icon, Spinner } from "../components/ui";
import { CheckBars, ScoreRing } from "./ScoreViz";

type State = "pending" | "active" | "done";
type Tone = "ok" | "none" | "warn";
type Row = { key: string; title: string; idle: string; state: State; finding?: string; tone?: Tone };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sum = (xs: { count: number }[]) => xs.reduce((a, x) => a + x.count, 0);

/** What each real step of the humanizer found, from its own report. */
function findings(g: GateResult): Record<string, { finding: string; tone: Tone }> {
  const r = g.report;
  const inv = sum(r.invisible), typ = sum(r.typographic), lex = sum(r.lexical);
  const problems = g.problems.length + (g.compliance.length ? 1 : 0);
  const verdict = g.after.verdict === "PASS" ? "ready" : g.after.verdict === "REVIEW" ? "almost there" : "still AI-sounding";
  return {
    hidden: inv ? { finding: `${plural(inv, "hidden character")} removed`, tone: "ok" } : { finding: "None found", tone: "none" },
    punct: typ
      ? { finding: `${plural(typ, "fix", "fixes")}: ${r.typographic.slice(0, 3).map((t) => `${t.name.toLowerCase()}${t.count > 1 ? ` ×${t.count}` : ""}`).join(", ")}`, tone: "ok" }
      : { finding: "Already clean", tone: "none" },
    words: lex
      ? {
          finding: `${plural(lex, "swap")}: ${r.lexical.slice(0, 2).map((l) => `“${l.find}” → “${l.replace || "(removed)"}”`).join(", ")}${r.lexical.length > 2 ? `, +${r.lexical.length - 2} more` : ""}`,
          tone: "ok",
        }
      : { finding: "No typical AI words", tone: "none" },
    patterns: r.structures.length
      ? { finding: `${r.structures.map((s) => s.name).join(", ")}: rewrite by hand`, tone: "warn" }
      : { finding: "No stock AI patterns", tone: "none" },
    score: { finding: `${g.before.human_score.toFixed(0)} → ${g.after.human_score.toFixed(0)} out of 100 · ${verdict}`, tone: g.after.verdict === "PASS" ? "ok" : "warn" },
    safety: problems
      ? { finding: `${plural(problems, "problem")} to fix before you can publish`, tone: "warn" }
      : { finding: g.warnings.length ? `OK, ${plural(g.warnings.length, "note")}` : "No problems", tone: "ok" },
  };
}

/**
 * The humanizer, step by step. While it runs: the steps pulse. When it's done: what each step found,
 * the score before and after, and the five checks behind it.
 */
export default function HumanizerProcess({
  mode, stage, elapsed, fixRound, gate, hasText, hasResult,
}: {
  mode: "clean" | "rewrite";
  stage: "rewriting" | "cleaning" | "fixing" | null;
  elapsed: number;
  fixRound: number;
  gate: GateResult | null;
  hasText: boolean;
  hasResult: boolean;
}) {
  const working = stage !== null;
  const finished = !working && hasResult && !!gate;
  const showClaude = mode === "rewrite" || stage === "fixing" || stage === "rewriting";
  const checks: State = working ? (stage === "cleaning" ? "active" : "pending") : finished ? "done" : "pending";
  const f = gate ? findings(gate) : null;

  const rows: Row[] = [];
  if (showClaude) {
    rows.push({
      key: "claude",
      title: stage === "fixing" ? `Claude fixes weak spots (round ${fixRound} of 2)` : "Claude rewrites in your voice",
      idle: "Reworks the opening and flat sentences with only your facts. About a minute.",
      state: stage === "rewriting" || stage === "fixing" ? "active" : working || finished ? "done" : "pending",
      finding: "Rewritten with your facts and voice",
      tone: "ok",
    });
  }
  rows.push(
    { key: "hidden", title: "Hidden characters", idle: "Invisible marks that give AI text away", state: checks, ...f?.hidden },
    { key: "punct", title: "Punctuation", idle: "Long dashes and curly quotes", state: checks, ...f?.punct },
    { key: "words", title: "AI words & phrases", idle: "Stock words like “delve” or “game-changer”", state: checks, ...f?.words },
    { key: "patterns", title: "Writing patterns", idle: "Stock structures that read as machine-made", state: checks, ...f?.patterns },
    { key: "score", title: "Human score", idle: "Five checks, out of 100. 70 or more is ready.", state: checks, ...f?.score },
    { key: "safety", title: "Safety check", idle: "Off-limits terms, blanks and the 3,000-character limit", state: checks, ...f?.safety },
  );

  const delta = gate ? Math.round(gate.after.human_score - gate.before.human_score) : 0;
  const title = working
    ? stage === "cleaning" ? "Humanizer is running" : stage === "fixing" ? "Raising your score" : `Claude is rewriting (${elapsed}s)`
    : finished ? "What the humanizer did" : "How the humanizer works";

  return (
    <section className={`hp ${working ? "running" : ""} ${finished ? "finished" : ""}`} aria-label="Humanizer process" aria-live="polite">
      {finished && gate ? (
        <div className="hp-top">
          <ScoreRing score={gate.after.human_score} verdict={gate.after.verdict} />
          <div>
            <b className="hp-title">{title}</b>
            <div className="hp-delta">
              Score {gate.before.human_score.toFixed(0)} → <b>{gate.after.human_score.toFixed(0)}</b>
              {delta !== 0 && <span className={`delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? `+${delta}` : delta}</span>}
            </div>
            <div className="meta">{gate.after.verdict === "PASS" ? "Sounds like a person. 70 or more counts as ready." : "Needs 70 or more to count as ready. See what to fix below."}</div>
          </div>
        </div>
      ) : (
        <div className="hp-head">
          <b>{working && <Spinner />} {title}</b>
          {working && stage !== "cleaning" && <span className="meta">Then the humanizer cleans and re-scores it</span>}
          {!working && !hasResult && <span className="meta">{hasText ? "Click the button above to run it" : "Add your text to begin"}</span>}
        </div>
      )}

      <ol className="hp-rows">
        {rows.map((r, i) => (
          <li key={r.key} className={`hp-row ${r.state} ${r.state === "done" ? r.tone ?? "" : ""}`} style={{ ["--i" as string]: i }}>
            <span className="hp-dot" aria-hidden>
              {r.state === "done" ? <Icon name={r.tone === "warn" ? "alert" : "check"} size={13} /> : r.state === "active" ? <Spinner /> : i + 1}
            </span>
            <b>{r.title}</b>
            <span className="hp-find">{r.state === "done" && r.finding ? r.finding : r.idle}</span>
          </li>
        ))}
      </ol>

      {finished && gate && (
        <div className="hp-checks">
          <div className="eg-label">The five checks behind the score</div>
          <CheckBars gate={gate} />
        </div>
      )}
    </section>
  );
}
