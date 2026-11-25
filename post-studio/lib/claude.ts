import "server-only";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { skillDir } from "./skills";

export const HOME = os.homedir();
export const VOICE_FILE = process.env.VOICE_FILE ?? path.join(HOME, ".claude/linkedin/voice.md");
export const MODEL = process.env.DRAFT_MODEL ?? "claude-opus-5-5";

export class ClaudeError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

const NO_CREDENTIALS =
  "No Anthropic credentials. Start Post Studio with ANTHROPIC_API_KEY set (or after `ant auth login`).";

/** Cheap pre-check so a missing key gives a clear message instead of an SDK stack. */
async function hasCredentials(): Promise<boolean> {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) return true;
  // `ant auth login` stores profiles here; the SDK reads them automatically.
  return readdir(path.join(HOME, ".config/anthropic")).then((f) => f.length > 0, () => false);
}

export async function claudeClient(): Promise<Anthropic> {
  if (!(await hasCredentials())) throw new ClaudeError(NO_CREDENTIALS, 401);
  try {
    return new Anthropic(); // ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile
  } catch {
    throw new ClaudeError(NO_CREDENTIALS, 401);
  }
}

/** Turn SDK errors into short messages for the UI. Most specific first. */
export function toClaudeError(e: unknown): ClaudeError {
  if (e instanceof ClaudeError) return e;
  if (e instanceof Anthropic.AuthenticationError)
    return new ClaudeError("Anthropic rejected the credentials. Check ANTHROPIC_API_KEY.", 401);
  if (e instanceof Anthropic.RateLimitError)
    return new ClaudeError("Rate limited by the Anthropic API. Wait a moment and retry.", 429);
  if (e instanceof Anthropic.BadRequestError)
    return new ClaudeError(`Anthropic API rejected the request: ${e.message}`, 400);
  if (e instanceof Anthropic.APIError) return new ClaudeError(`Anthropic API error ${e.status ?? ""}: ${e.message}`, 502);
  if (e instanceof Anthropic.AnthropicError) return new ClaudeError(`Anthropic client error: ${e.message}`, 500);
  return new ClaudeError((e as Error).message ?? "Unknown error", 500);
}

/** Shared checks on a parsed response. */
export function checkStop(r: { stop_reason: string | null }) {
  if (r.stop_reason === "refusal") throw new ClaudeError("Claude declined this request.", 422);
  if (r.stop_reason === "max_tokens") throw new ClaudeError("Claude's answer was cut off. Try again.", 502);
}

export const readSkill = (skill: string, file: string) => readFile(path.join(skillDir(skill), file), "utf8");
export const readVoice = () => readFile(VOICE_FILE, "utf8").catch(() => "");
