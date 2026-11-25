import { NextResponse } from "next/server";
import { GROUPS, bump, engageState, type EngageGroup } from "@/lib/engage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await engageState());
}

/** { group: "reach"|"peers"|"buyers", delta: 1|-1 } */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { group?: string; delta?: number };
  if (!GROUPS.includes(b.group as EngageGroup)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
  return NextResponse.json(await bump(b.group as EngageGroup, b.delta === -1 ? -1 : 1));
}
