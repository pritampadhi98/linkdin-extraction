import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** A factual claim found in a draft: a number, with a little text around it. */
export type Claim = {
  id: string; // stable key: the normalised number
  text: string; // the claim as written, with a few words around it
  supported: boolean; // the same number appears in the user's own proof
  evidence: string | null; // the line of the proof that has it
};

const VOICE_FILE = process.env.VOICE_FILE ?? path.join(os.homedir(), ".claude/linkedin/voice.md");

/** "35-40%" -> "35-40%", "1,200+" -> "1200", "$2.5M" -> "$2.5m". Same number, same key. */
const norm = (s: string) => s.toLowerCase().replace(/[\s,+]/g, "").replace(/(\d)to(\d)/, "$1-$2");

// A number is a claim when it has a unit (% x k m $ ms s) or at least two digits. Years are skipped.
const NUM = /(?<![\w#])\$?\d[\d,]*(?:\.\d+)?(?:\s?(?:-|–|to)\s?\d[\d,]*(?:\.\d+)?)?\s?(?:%|x\b|k\b|m\b|ms\b|s\b|\+)?/gi;

export function extractClaims(text: string): { id: string; text: string }[] {
  const out = new Map<string, string>();
  for (const m of text.matchAll(NUM)) {
    const raw = m[0].trim();
    const digits = raw.replace(/\D/g, "");
    const hasUnit = /[%$+]|x$|k$|m$|ms$|s$/i.test(raw);
    if (!hasUnit && digits.length < 2) continue; // "3 things" is not a measurement
    if (/^(19|20)\d{2}$/.test(raw)) continue; // a year
    const start = Math.max(0, (m.index ?? 0) - 24);
    const end = Math.min(text.length, (m.index ?? 0) + raw.length + 24);
    const around = text.slice(start, end).replace(/\s+/g, " ").trim();
    const id = norm(raw);
    if (!out.has(id)) out.set(id, `${start > 0 ? "…" : ""}${around}${end < text.length ? "…" : ""}`);
  }
  return [...out].map(([id, t]) => ({ id, text: t }));
}

/** The user's own facts: the voice profile (its "proof" lines included). */
async function proofLines(): Promise<string[]> {
  const raw = await readFile(VOICE_FILE, "utf8").catch(() => "");
  const out: string[] = [];
  let banned = false; // inside a section about what NOT to say: those numbers are not proof
  for (const l of raw.split("\n")) {
    if (/^#{1,6}\s/.test(l)) banned = /off[- ]?limits|never|avoid|don'?t|do not|can'?t/i.test(l);
    if (banned || !/\d/.test(l) || /\(TODO\)/.test(l)) continue;
    if (/do not use|don'?t use|never (say|use|write)|conflicts with|can'?t attribute|off[- ]?limits/i.test(l)) continue;
    out.push(l);
  }
  return out;
}

/** Every number in the draft, and whether the user's own proof backs it. Needs no AI, so it can't be talked round. */
export async function checkClaims(text: string): Promise<Claim[]> {
  const lines = await proofLines();
  const known = lines.map((l) => ({ line: l.trim(), ids: new Set(extractClaims(l).map((c) => c.id)) }));
  return extractClaims(text).map((c) => {
    const hit = known.find((k) => k.ids.has(c.id));
    return { ...c, supported: !!hit, evidence: hit ? hit.line.slice(0, 160) : null };
  });
}

export const hashText = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 16);
