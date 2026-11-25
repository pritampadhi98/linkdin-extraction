// Where each LinkedIn skill lives. Shared by the app and the queue worker (plain Node), so no "server-only".
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const INSTALLED = path.join(os.homedir(), ".claude", "skills");
const BUNDLED = path.join(process.cwd(), "skills"); // post-studio/skills, shipped with the repo

/**
 * The folder for one skill, in this order:
 *  1. SKILLS_DIR (set in .env.local)
 *  2. ~/.claude/skills/<name>, if you installed it for Claude Code (your edits win)
 *  3. post-studio/skills/<name>, the copy bundled with the repo
 */
export function skillDir(name: string): string {
  if (process.env.SKILLS_DIR) return path.join(process.env.SKILLS_DIR, name);
  const installed = path.join(INSTALLED, name);
  return existsSync(path.join(installed, "SKILL.md")) ? installed : path.join(BUNDLED, name);
}

/** For a status line: where the app is reading skills from right now. */
export const skillSource = (name = "li-post") =>
  process.env.SKILLS_DIR ? "SKILLS_DIR" : skillDir(name).startsWith(INSTALLED) ? "~/.claude/skills" : "bundled (post-studio/skills)";
