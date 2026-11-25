import "server-only";
import { checkClaims, type Claim } from "./claims";
import { checkCompliance, type ComplianceHit } from "./compliance";
import { detect, humanize, type CheckName, type DetectResult, type HumanizeReport } from "./humanizer";

const FIX_TIPS: Record<CheckName, string> = {
  BURSTINESS: "mix very short lines with longer ones",
  SPECIFICITY: "add real numbers and names (e.g. 3 organisations, 20+ tenants, Next.js, SSE) and cut vague lines",
  "SLOP DENSITY": "replace the stock words listed next to SLOP DENSITY with plain ones",
  FINGERPRINT: "replace long dashes and curly quotes with - and plain quotes",
  VOICE: 'write more like you talk: use I/we and contractions (didn\'t, it\'s), and break up "not X, it\'s Y" lines',
};

export const MAX_CHARS = 3000;

export type GateResult = {
  original: string;
  cleaned: string;
  report: HumanizeReport;
  before: DetectResult;
  after: DetectResult;
  compliance: ComplianceHit[];
  claims: Claim[]; // numbers in the draft; the unsupported ones need the approver to confirm them
  problems: string[]; // anything here blocks Approve
  warnings: string[]; // shown, but does not block
};

/** The full governance gate: humanize, score, compliance. Always run server-side. */
export async function runGate(original: string): Promise<GateResult> {
  const { text: cleaned, report } = await humanize(original);
  const [before, after, compliance, claims] = await Promise.all([
    detect(original),
    detect(cleaned),
    checkCompliance(cleaned),
    checkClaims(cleaned),
  ]);

  const problems: string[] = [];
  const warnings: string[] = [];
  if (!cleaned.trim()) problems.push("The draft is empty.");
  if (/\{\{.*?\}\}/.test(cleaned)) problems.push("The draft still has {{placeholders}}. Fill them in.");
  if (cleaned.length > MAX_CHARS)
    problems.push(`${cleaned.length} characters. LinkedIn's limit is ${MAX_CHARS}.`);
  if (compliance.length)
    problems.push(`${compliance.length} off-limits term(s) found. Remove them before publishing.`);
  if (after.verdict !== "PASS") {
    const weak = (Object.keys(after.checks) as CheckName[]).filter((c) => after.checks[c].score < 55);
    if (weak.length)
      for (const c of weak)
        warnings.push(
          `Humanizer verdict is ${after.verdict} because ${c} is ${after.checks[c].score.toFixed(1)} (needs 55.0 or more). Fix: ${FIX_TIPS[c]}.`,
        );
    else
      warnings.push(
        `Humanizer verdict is ${after.verdict}: overall ${after.human_score.toFixed(1)} needs 70+. Raise the lowest checks in the Human score panel.`,
      );
  }
  const unbacked = claims.filter((c) => !c.supported).length;
  if (unbacked)
    warnings.push(`${unbacked} number(s) are not in your own proof list. Confirm each one is true before you approve.`);
  if (report.lexical.length)
    warnings.push("Words were swapped automatically. Check each change still says what you meant.");

  return { original, cleaned, report, before, after, compliance, claims, problems, warnings };
}
