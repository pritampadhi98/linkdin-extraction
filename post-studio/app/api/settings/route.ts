import { readFile, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { OFF_LIMITS_FILE } from "@/lib/compliance";
import { isLive } from "@/lib/linkedin";
import { readApprovals } from "@/lib/log";
import { clampHashtags, loadSettings, saveSettings, validSlots, type Settings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const [settings, offLimits, approvals] = await Promise.all([
    loadSettings(),
    readFile(OFF_LIMITS_FILE, "utf8").catch(() => ""),
    readApprovals(),
  ]);
  return NextResponse.json({ settings, offLimits, approvals, live: isLive(), liVersion: process.env.LI_VERSION ?? null });
}

/** Partial update: { approverName?, audience?, focus?, people?, slots?, queuePaused?, hashtagCount?, linkPlacement?, offLimits? } */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Settings> & { offLimits?: unknown };
  const patch: Partial<Settings> = {};
  if (body.approverName !== undefined) patch.approverName = String(body.approverName).trim().slice(0, 80);
  if (body.queuePaused !== undefined) patch.queuePaused = body.queuePaused === true;
  if (body.hashtagCount !== undefined) patch.hashtagCount = clampHashtags(body.hashtagCount);
  if (body.audience !== undefined) patch.audience = String(body.audience).trim().slice(0, 400);
  if (body.focus !== undefined) patch.focus = String(body.focus).trim().slice(0, 400);
  if (body.people !== undefined) patch.people = String(body.people).trim().slice(0, 4000);
  if (body.linkPlacement !== undefined) patch.linkPlacement = body.linkPlacement === "post" ? "post" : "comment";
  if (body.slots !== undefined) {
    const slots = validSlots(body.slots);
    if (!slots) return NextResponse.json({ error: "Each slot needs a day and a time (HH:MM)." }, { status: 400 });
    patch.slots = slots;
  }
  if (body.offLimits !== undefined) {
    const text = String(body.offLimits);
    if (text.length > 20_000) return NextResponse.json({ error: "Off-limits list is too long." }, { status: 400 });
    for (const line of text.split("\n").map((l) => l.trim())) {
      const m = line.match(/^\/(.+)\/$/);
      if (m) {
        try {
          new RegExp(m[1], "i");
        } catch {
          return NextResponse.json({ error: `Invalid pattern: ${line}` }, { status: 400 });
        }
      }
    }
    await writeFile(OFF_LIMITS_FILE, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  }
  const settings = await saveSettings(patch);
  return NextResponse.json({ ok: true, settings });
}
