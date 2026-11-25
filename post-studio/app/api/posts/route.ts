import { NextResponse } from "next/server";
import { loadConnection } from "@/lib/connection";
import { hashText } from "@/lib/claims";
import { runGate } from "@/lib/gate";
import { isLive } from "@/lib/linkedin";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type NewImage, lastHeartbeat, listQueue, postOne, savePost } from "@/lib/queue";
import { loadSettings, nextFreeSlot } from "@/lib/settings";

export const runtime = "nodejs";

/** Everything the dashboard needs in one call. Never returns the LinkedIn token. */
export async function GET() {
  const [items, settings, workerAt, conn] = await Promise.all([listQueue(), loadSettings(), lastHeartbeat(), loadConnection()]);
  const taken = items.filter((x) => x.status === "queued" && x.scheduledAt).map((x) => x.scheduledAt!);
  return NextResponse.json({
    live: isLive(),
    settings,
    workerAt,
    nextSlot: nextFreeSlot(settings.slots, taken)?.toISOString() ?? null,
    account: conn && new Date(conn.expiresAt) > new Date() ? { name: conn.name, picture: conn.picture } : null,
    items,
  });
}

const bad = (error: string, status = 400, extra?: object) => NextResponse.json({ error, ...extra }, { status });

/**
 * Save, queue, schedule or publish a post. multipart/form-data:
 *   action: draft | queue | schedule | publish
 *   id? (update an existing draft/queued/failed post), text, approver, scheduledAt (ISO, for schedule),
 *   acceptReview ("true"), image? + altText, removeImage ("true")
 * Anything other than a draft runs the full gate server-side on exactly what will post.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return bad("Send multipart form data.");

  const action = String(form.get("action") ?? "");
  if (!["draft", "queue", "schedule", "publish"].includes(action)) return bad("Unknown action.");
  const id = String(form.get("id") ?? "") || undefined;
  const text = String(form.get("text") ?? "");
  const approver = String(form.get("approver") ?? "").trim().slice(0, 80);
  const acceptReview = form.get("acceptReview") === "true";
  const confirmed = String(form.get("confirmedClaims") ?? "").split("\n").filter(Boolean);
  const altText = String(form.get("altText") ?? "").trim();
  const removeImage = form.get("removeImage") === "true";
  const file = form.get("image");
  const rawAt = String(form.get("scheduledAt") ?? "");
  const links = String(form.get("links") ?? "")
    .split(/\s+/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\/[^\s<>"]+$/.test(l))
    .slice(0, 10);
  const scheduledAt = rawAt ? new Date(rawAt) : null;

  if (!text.trim()) return bad("Write something first.");
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return bad("Pick a valid date and time.");

  let image: NewImage | undefined;
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES[file.type]) return bad("Image must be PNG, JPEG or GIF.");
    if (file.size > MAX_IMAGE_BYTES) return bad("Image must be under 8 MB.");
    image = { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type, altText: altText.slice(0, 300) };
  }
  const imageChange = image ? { set: image } : removeImage ? { remove: true } : undefined;

  try {
    if (action === "draft") {
      const item = await savePost(
        { id, text, status: "draft", scheduledAt: scheduledAt?.toISOString() ?? null, approver, score: null, verdict: null, links },
        imageChange,
      );
      return NextResponse.json({ ok: true, item });
    }

    if (!approver) return bad("Add the approver's name.");
    if (image && !altText) return bad("Add alt text for the image (what's in it).");

    let at: Date;
    if (action === "schedule") {
      if (!scheduledAt) return bad("Pick a date and time.");
      if (scheduledAt.getTime() < Date.now() - 60_000) return bad("That time is in the past.");
      at = scheduledAt;
    } else if (action === "queue") {
      const [items, settings] = await Promise.all([listQueue(), loadSettings()]);
      const taken = items.filter((x) => x.status === "queued" && x.id !== id && x.scheduledAt).map((x) => x.scheduledAt!);
      const slot = nextFreeSlot(settings.slots, taken);
      if (!slot) return bad("No posting slots are set. Add some in Settings, or pick a time.");
      at = slot;
    } else {
      at = new Date();
    }

    const gate = await runGate(text);
    if (gate.problems.length) return bad(gate.problems[0], 422, { gate });
    if (gate.after.verdict !== "PASS" && !acceptReview)
      return bad(`The human score verdict is ${gate.after.verdict}. Tick "approve anyway" to override.`, 422, { gate });

    const unconfirmed = gate.claims.filter((c) => !c.supported && !confirmed.includes(c.id));
    if (unconfirmed.length)
      return bad(`Confirm these numbers are true: ${unconfirmed.map((c) => c.id).join(", ")}.`, 422, { gate });

    const saved = await savePost(
      {
        id,
        text: gate.cleaned,
        textHash: hashText(gate.cleaned),
        confirmedClaims: gate.claims.filter((c) => confirmed.includes(c.id) || c.supported).map((c) => c.id),
        status: "queued",
        timing: action === "schedule" ? "exact" : action === "queue" ? "slot" : "now",
        scheduledAt: at.toISOString(),
        approver,
        score: gate.after.human_score,
        verdict: gate.after.verdict,
        links,
      },
      imageChange,
    );
    if (action !== "publish") return NextResponse.json({ ok: true, item: saved });

    const item = await postOne(saved.id);
    if (item.status === "failed") return bad(item.error ?? "Publishing failed.", 502, { item });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return bad((e as Error).message);
  }
}
