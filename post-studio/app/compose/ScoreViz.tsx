"use client";

import type { GateResult } from "@/lib/gate";
import type { CheckName } from "@/lib/humanizer";

type Verdict = GateResult["after"]["verdict"];

const VERDICT_COLOR: Record<Verdict, string> = { PASS: "var(--pass)", REVIEW: "var(--review)", FLAGGED: "var(--fail)" };
const scoreColor = (s: number) => (s >= 70 ? "var(--pass)" : s >= 55 ? "var(--review)" : "var(--fail)");

/** Animated 0-100 ring. The small tick marks 70, the score that counts as ready. */
export function ScoreRing({ score, verdict, size = 88 }: { score: number; verdict: Verdict; size?: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = VERDICT_COLOR[verdict];
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Human score ${Math.round(score)} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
      <circle className="ring-arc" cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
      <line x1="50" y1="3" x2="50" y2="15" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" transform={`rotate(${0.7 * 360} 50 50)`}>
        <title>70 = ready to publish</title>
      </line>
      <text x="50" y="55" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--text)">{Math.round(score)}</text>
      <text x="50" y="70" textAnchor="middle" fontSize="10" fill="var(--muted)">out of 100</text>
    </svg>
  );
}

const CHECKS: [CheckName, string, string][] = [
  ["BURSTINESS", "Sentence variety", "A mix of short and long sentences"],
  ["SPECIFICITY", "Concrete details", "Real numbers, names and tools"],
  ["SLOP DENSITY", "Plain words", "No typical AI words"],
  ["FINGERPRINT", "Clean punctuation", "No long dashes or curly quotes"],
  ["VOICE", "Sounds like you", "I/we and contractions"],
];

/** The five checks behind the score, each as a small bar. Weak ones (under 55) are flagged. */
export function CheckBars({ gate }: { gate: GateResult }) {
  return (
    <div className="cbars">
      {CHECKS.map(([c, label, hint]) => {
        const v = gate.after.checks[c];
        const was = gate.before.checks[c]?.score;
        const weak = v.score < 55;
        return (
          <div key={c} className={`cbar ${weak ? "weak" : ""}`} title={`${v.detail}\n${hint}`}>
            <div className="cbar-top">
              <span>{label}</span>
              <b style={{ color: scoreColor(v.score) }}>{v.score.toFixed(0)}</b>
            </div>
            <div className="cbar-track" role="meter" aria-valuenow={Math.round(v.score)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
              <span style={{ width: `${v.score}%`, background: scoreColor(v.score) }} />
            </div>
            {typeof was === "number" && Math.round(was) !== Math.round(v.score) && <span className="cbar-was">was {was.toFixed(0)}</span>}
          </div>
        );
      })}
    </div>
  );
}
