import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { loadState, suggestProfileTopics } from "@/lib/growth";

export const runtime = "nodejs";
export const maxDuration = 300;

/** The last saved topic ideas from the profile. */
export async function GET() {
  return NextResponse.json({ topics: (await loadState()).topics ?? null });
}

/** Claude reads the profile and suggests 8 topics and keywords, each with an angle from the user's own proof. */
export async function POST() {
  try {
    return NextResponse.json({ topics: await suggestProfileTopics() });
  } catch (e) {
    const status = e instanceof ClaudeError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
