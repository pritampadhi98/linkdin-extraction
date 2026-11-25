import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { skillDir } from "./skills";

// The li-human skill (installed in ~/.claude/skills, or the copy bundled in post-studio/skills).
const SKILL_DIR = process.env.LI_HUMAN_DIR ?? skillDir("li-human");

export type HumanizeReport = {
  invisible: { name: string; count: number; action: string }[];
  typographic: { name: string; count: number; to: string }[];
  lexical: { find: string; replace: string; count: number; family: string }[];
  structures: { name: string; count: number; fix: string }[];
};

export type CheckName = "BURSTINESS" | "SPECIFICITY" | "SLOP DENSITY" | "FINGERPRINT" | "VOICE";

export type DetectResult = {
  checks: Record<CheckName, { score: number; detail: string }>;
  human_score: number;
  verdict: "PASS" | "REVIEW" | "FLAGGED";
};

/** Run a li-human script with `text` on stdin and parse its JSON stdout. */
function runScript<T>(script: string, text: string): Promise<T> {
  return new Promise((resolve, reject) => {
    // -I: isolated mode, so nothing in the cwd can shadow stdlib modules.
    const child = spawn("python3", ["-I", path.join(SKILL_DIR, script), "-", "--json"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", () => {
      // detect.py exits 1 when the verdict is not PASS, so judge by output, not exit code.
      try {
        resolve(JSON.parse(out) as T);
      } catch {
        reject(new Error(`${script} failed: ${err || out || "no output"}`));
      }
    });
    child.stdin.end(text);
  });
}

export async function humanize(text: string) {
  const r = await runScript<{ text: string; report: HumanizeReport }>("humanize.py", text);
  // Known side effect: deleting a stock phrase can leave "..". Keep real ellipses.
  const clean = r.text.trim().replace(/(?<!\.)\.\.(?!\.)/g, ".");
  return { text: clean, report: r.report };
}

export function detect(text: string) {
  return runScript<DetectResult>("detect.py", text);
}
