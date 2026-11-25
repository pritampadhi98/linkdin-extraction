import { NextResponse } from "next/server";
import { runGate } from "@/lib/gate";
import { isLive, publishPost } from "@/lib/linkedin";
import { hashText } from "@/lib/claims";
import { logApproval, readApprovals } from "@/lib/log";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ live: isLive(), approvals: await readApprovals() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    approver?: string;
    acceptReview?: boolean;
  };
  if (typeof body.text !== "string" || !body.approver?.trim()) {
    return NextResponse.json({ error: "Send { text, approver }." }, { status: 400 });
  }

  // Never trust the browser's copy of the gate: run it again on exactly what will post.
  const gate = await runGate(body.text);
  if (gate.problems.length) {
    return NextResponse.json({ error: "Blocked by the gate.", gate }, { status: 422 });
  }
  if (gate.after.verdict !== "PASS" && !body.acceptReview) {
    return NextResponse.json(
      { error: `Verdict is ${gate.after.verdict}. Tick "approve anyway" to override.`, gate },
      { status: 422 },
    );
  }

  const confirmed: string[] = Array.isArray((body as { confirmedClaims?: string[] }).confirmedClaims) ? (body as { confirmedClaims: string[] }).confirmedClaims : [];
  const unconfirmed = gate.claims.filter((c) => !c.supported && !confirmed.includes(c.id));
  if (unconfirmed.length)
    return NextResponse.json({ error: `Confirm these numbers are true: ${unconfirmed.map((c) => c.id).join(", ")}.`, gate }, { status: 422 });

  const live = isLive();
  try {
    const { id } = live ? await publishPost(gate.cleaned) : { id: null };
    await logApproval({
      at: new Date().toISOString(),
      approver: body.approver.trim(),
      mode: live ? "live" : "dry-run",
      postId: id,
      score: gate.after.human_score,
      verdict: gate.after.verdict,
      chars: gate.cleaned.length,
      firstLine: gate.cleaned.split("\n")[0].slice(0, 120),
      textHash: hashText(gate.cleaned),
      confirmedClaims: gate.claims.filter((c) => confirmed.includes(c.id) || c.supported).map((c) => c.id),
    });
    return NextResponse.json({ ok: true, live, id, text: gate.cleaned });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
