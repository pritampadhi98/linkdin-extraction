import { NextResponse } from "next/server";
import { DraftError, draftPost, type Trend } from "@/lib/draft";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { idea, facts, trend, trends } = (await req.json().catch(() => ({}))) as { idea?: string; facts?: string; trend?: Trend; trends?: Trend[] };
  if (typeof idea !== "string" || !idea.trim()) {
    return NextResponse.json({ error: "Send { idea: string, facts?: string }." }, { status: 400 });
  }
  if (idea.length > 4000 || (facts ?? "").length > 8000) {
    return NextResponse.json({ error: "Idea or facts too long." }, { status: 400 });
  }
  try {
    // Up to 4 topics; `trend` (one topic) still works.
    const list = (Array.isArray(trends) ? trends : trend ? [trend] : [])
      .filter((t) => t && typeof t.keyword === "string")
      .slice(0, 4)
      .map((t) => ({ keyword: t.keyword.slice(0, 100), hashtag: typeof t.hashtag === "string" ? t.hashtag.slice(0, 60) : null, why: String(t.why ?? "").slice(0, 600), angle: String(t.angle ?? "").slice(0, 600) }));
    return NextResponse.json(await draftPost(idea, facts ?? "", list));
  } catch (e) {
    const status = e instanceof DraftError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
