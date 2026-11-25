import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { suggestComments } from "@/lib/comment";

export const runtime = "nodejs";
export const maxDuration = 300;

/** { post, author? } -> two comment drafts for the user to edit and post by hand. Nothing is posted. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { post?: string; author?: string };
  const post = String(body.post ?? "").trim();
  if (post.length < 20) return NextResponse.json({ error: "Paste the post you want to comment on." }, { status: 400 });
  if (post.length > 6000) return NextResponse.json({ error: "That post is too long." }, { status: 400 });
  try {
    const out = await suggestComments(post, String(body.author ?? "").trim().slice(0, 120));
    if (!out.options.length) return NextResponse.json({ error: "No usable comments came back. Try again." }, { status: 502 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ClaudeError ? e.status : 500 });
  }
}
