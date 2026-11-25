// The post store: drafts, the publishing queue and published posts, in data/queue.json.
// Shared by the Next.js server and the queue worker (plain Node), so no "server-only" import.
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { historyOf } from "./analytics";
import { checkCompliance } from "./compliance";
import { isLive, publishPost } from "./linkedin";
import { logApproval } from "./log";
import { hashText } from "./claims";
import { loadSettings } from "./settings";

const DATA = path.join(process.cwd(), "data");
const FILE = path.join(DATA, "queue.json");
const HEARTBEAT = path.join(DATA, "worker.json");
export const IMAGE_DIR = path.join(DATA, "images");

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** draft → queued → posting → posted | failed. cancelled = removed from the queue. */
export type QueueStatus = "draft" | "queued" | "posting" | "posted" | "failed" | "cancelled";
/** How a queued post got its time: next free slot, a time the user picked, or "publish now". */
export type Timing = "slot" | "exact" | "now";

export type Metrics = {
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  updatedAt: string;
};

/** One reading of a published post's numbers, optionally with the LinkedIn screenshot it came from. */
export type Snapshot = {
  id: string;
  at: string; // ISO: when the numbers were read
  approx?: boolean; // true when "at" comes from LinkedIn's rounded age ("2h"), not an exact time
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  shot?: { file: string; contentType: string };
};

export const SHOT_DIR = path.join(DATA, "shots");

export type QueueItem = {
  id: string;
  text: string; // humanized and gated once queued; as typed while a draft
  scheduledAt: string | null; // ISO. For drafts: an optional planned time
  timing?: Timing;
  status: QueueStatus;
  approver: string;
  score: number | null;
  verdict: string | null;
  image: { file: string; contentType: string; altText: string } | null;
  createdAt: string;
  updatedAt?: string;
  postedAt?: string;
  mode?: "live" | "dry-run";
  postId?: string | null;
  error?: string;
  metrics?: Metrics; // the latest snapshot (kept so totals stay simple)
  history?: Snapshot[]; // every reading you've entered, oldest first
  textHash?: string; // fingerprint of the exact text the approver confirmed
  confirmedClaims?: string[]; // numbers the approver ticked as true
  links?: string[]; // reference links (for a first comment, or already in the text)
};

export type NewImage = { bytes: Buffer; contentType: string; altText: string };

async function load(): Promise<QueueItem[]> {
  const raw = await readFile(FILE, "utf8").catch(() => "[]");
  return JSON.parse(raw) as QueueItem[];
}

/** Atomic write: temp file then rename, so a crash never leaves half a queue. */
async function save(items: QueueItem[]) {
  await mkdir(DATA, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2), "utf8");
  await rename(tmp, FILE);
}

async function update(id: string, patch: Partial<QueueItem>) {
  const items = await load();
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return undefined;
  items[i] = { ...items[i], ...patch, updatedAt: new Date().toISOString() };
  await save(items);
  return items[i];
}

async function storeImage(id: string, image: NewImage): Promise<QueueItem["image"]> {
  const file = `${id}-${Date.now()}.${IMAGE_TYPES[image.contentType]}`;
  await mkdir(IMAGE_DIR, { recursive: true });
  await writeFile(path.join(IMAGE_DIR, file), image.bytes);
  return { file, contentType: image.contentType, altText: image.altText };
}

const dropImage = (img: QueueItem["image"]) =>
  img ? unlink(path.join(IMAGE_DIR, img.file)).catch(() => {}) : Promise.resolve();

/** Newest first by the date that matters for each status. */
export const sortKey = (x: QueueItem) => x.postedAt ?? x.scheduledAt ?? x.updatedAt ?? x.createdAt;

export const listQueue = async () => (await load()).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

export const getPost = async (id: string) => (await load()).find((x) => x.id === id);

export async function imagePath(id: string): Promise<{ path: string; contentType: string } | null> {
  const it = await getPost(id);
  if (!it?.image) return null;
  return { path: path.join(IMAGE_DIR, path.basename(it.image.file)), contentType: it.image.contentType };
}

/** Kept for the original /api/queue route: approve + schedule at an exact time. */
export async function enqueue(
  item: { text: string; scheduledAt: string; approver: string; score: number; verdict: string },
  image: NewImage | null,
): Promise<QueueItem> {
  return savePost({ ...item, status: "queued", timing: "exact" }, image ? { set: image } : undefined);
}

export type SaveInput = {
  id?: string;
  text: string;
  status: "draft" | "queued";
  timing?: Timing;
  scheduledAt: string | null;
  approver: string;
  score: number | null;
  verdict: string | null;
  links?: string[];
  textHash?: string;
  confirmedClaims?: string[];
};

/**
 * Create a post, or update an editable one (draft, queued, failed, cancelled).
 * image: { set } replaces it, { remove: true } drops it, undefined keeps what is there.
 */
export async function savePost(input: SaveInput, image?: { set?: NewImage; remove?: boolean }): Promise<QueueItem> {
  const items = await load();
  const now = new Date().toISOString();
  const existing = input.id ? items.find((x) => x.id === input.id) : undefined;
  if (input.id && !existing) throw new Error("That post no longer exists.");
  if (existing && !["draft", "queued", "failed", "cancelled"].includes(existing.status))
    throw new Error(`A ${existing.status} post can't be edited. Duplicate it instead.`);

  const id = existing?.id ?? randomUUID();
  let img = existing?.image ?? null;
  if (image?.set) {
    await dropImage(img);
    img = await storeImage(id, image.set);
  } else if (image?.remove) {
    await dropImage(img);
    img = null;
  }

  const fields = {
    text: input.text.replace(/\r\n?/g, "\n"),
    status: input.status,
    timing: input.timing,
    scheduledAt: input.scheduledAt,
    approver: input.approver,
    score: input.score,
    verdict: input.verdict,
    image: img,
    links: input.links ?? existing?.links ?? [],
    textHash: input.textHash,
    confirmedClaims: input.confirmedClaims,
    error: undefined,
    updatedAt: now,
  };
  if (existing) {
    Object.assign(existing, fields);
    await save(items);
    return existing;
  }
  const full: QueueItem = { id, createdAt: now, ...fields };
  items.push(full);
  await save(items);
  return full;
}

/** Take a queued post off the queue. Its image is kept so it can be re-queued or duplicated. */
export async function cancel(id: string) {
  const items = await load();
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error("Not found.");
  if (it.status !== "queued") throw new Error(`Can't cancel a ${it.status} post.`);
  it.status = "cancelled";
  it.updatedAt = new Date().toISOString();
  await save(items);
}

/** Move a queued, failed or cancelled post back to drafts. */
export async function unschedule(id: string) {
  const it = await getPost(id);
  if (!it) throw new Error("Not found.");
  if (!["queued", "failed", "cancelled"].includes(it.status)) throw new Error(`Can't move a ${it.status} post to drafts.`);
  return update(id, { status: "draft", error: undefined });
}

/** Delete from Post Studio. Published posts stay on LinkedIn. */
export async function deletePost(id: string) {
  const items = await load();
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error("Not found.");
  if (it.status === "posting") throw new Error("It's being published right now. Try again in a minute.");
  await save(items.filter((x) => x.id !== id));
  await dropImage(it.image);
  for (const h of it.history ?? []) if (h.shot) await unlink(path.join(SHOT_DIR, path.basename(h.shot.file))).catch(() => {});
}

/** Copy any post into a new draft, image included. */
export async function duplicatePost(id: string): Promise<QueueItem> {
  const items = await load();
  const src = items.find((x) => x.id === id);
  if (!src) throw new Error("Not found.");
  const newId = randomUUID();
  let image: QueueItem["image"] = null;
  if (src.image) {
    const file = `${newId}-${Date.now()}.${IMAGE_TYPES[src.image.contentType]}`;
    await copyFile(path.join(IMAGE_DIR, src.image.file), path.join(IMAGE_DIR, file)).then(
      () => (image = { ...src.image!, file }),
      () => (image = null),
    );
  }
  const now = new Date().toISOString();
  const copy: QueueItem = {
    id: newId,
    text: src.text,
    scheduledAt: null,
    status: "draft",
    approver: "",
    score: null,
    verdict: null,
    image,
    createdAt: now,
    updatedAt: now,
  };
  items.push(copy);
  await save(items);
  return copy;
}

/**
 * Reorder the queue. The queued posts keep the same set of times; the times are handed
 * out in the new order, earliest first. ids must be exactly the currently queued posts.
 */
export async function reorderQueue(ids: string[]) {
  const items = await load();
  const queued = items.filter((x) => x.status === "queued");
  if (ids.length !== queued.length || !queued.every((q) => ids.includes(q.id)))
    throw new Error("The queue changed. Refresh and try again.");
  const times = queued.map((q) => q.scheduledAt!).sort();
  ids.forEach((id, i) => {
    const it = items.find((x) => x.id === id)!;
    if (it.scheduledAt !== times[i]) {
      it.scheduledAt = times[i];
      it.updatedAt = new Date().toISOString();
    }
  });
  await save(items);
}

export type NewSnapshot = Omit<Snapshot, "id" | "shot"> & { shot?: { bytes: Buffer; contentType: string } };

const latest = (h: Snapshot[]): Metrics | undefined => {
  const s = h.at(-1);
  return s && { impressions: s.impressions, reactions: s.reactions, comments: s.comments, reposts: s.reposts, updatedAt: s.at };
};

/** Add one reading; keeps history sorted by time and `metrics` = the latest reading. */
export async function addSnapshot(id: string, n: NewSnapshot) {
  const it = await getPost(id);
  if (!it) throw new Error("Not found.");
  if (it.status !== "posted") throw new Error("Metrics only apply to published posts.");
  if (it.postedAt && new Date(n.at) < new Date(it.postedAt)) throw new Error("That time is before the post was published.");
  if (new Date(n.at).getTime() > Date.now() + 60_000) throw new Error("That time is in the future.");
  const snap: Snapshot = { id: randomUUID(), at: n.at, impressions: n.impressions, reactions: n.reactions, comments: n.comments, reposts: n.reposts };
  if (n.approx) snap.approx = true;
  if (n.shot) {
    const ext = IMAGE_TYPES[n.shot.contentType];
    if (!ext) throw new Error("Screenshot must be PNG, JPEG or GIF.");
    if (n.shot.bytes.length > MAX_IMAGE_BYTES) throw new Error("Screenshot is over 8 MB.");
    await mkdir(SHOT_DIR, { recursive: true });
    const file = `${id}-${snap.id}.${ext}`;
    await writeFile(path.join(SHOT_DIR, file), n.shot.bytes);
    snap.shot = { file, contentType: n.shot.contentType };
  }
  const history = [...historyOf(it).map((h) => (h.id === "legacy" ? { ...h, id: randomUUID() } : h)), snap].sort((a, b) => a.at.localeCompare(b.at));
  return update(id, { history, metrics: latest(history) });
}

export async function deleteSnapshot(id: string, snapId: string) {
  const it = await getPost(id);
  if (!it) throw new Error("Not found.");
  const all = historyOf(it);
  const gone = all.find((h) => h.id === snapId);
  if (!gone) throw new Error("That reading is already gone.");
  const history = all.filter((h) => h.id !== snapId);
  if (gone.shot) await unlink(path.join(SHOT_DIR, path.basename(gone.shot.file))).catch(() => {});
  return update(id, { history, metrics: latest(history) });
}

export async function shotPath(id: string, snapId: string) {
  const s = (await getPost(id))?.history?.find((h) => h.id === snapId)?.shot;
  return s ? { path: path.join(SHOT_DIR, path.basename(s.file)), contentType: s.contentType } : null;
}

/** "Add metrics" without a time: a reading taken now. */
export const setMetrics = (id: string, m: Omit<Metrics, "updatedAt">) => addSnapshot(id, { ...m, at: new Date().toISOString() });

/** Publish one queued post now. Claims it first so the worker can't post it twice. */
export async function postOne(id: string): Promise<QueueItem> {
  const items = await load();
  const item = items.find((x) => x.id === id);
  if (!item) throw new Error("Not found.");
  if (item.status !== "queued") throw new Error(`Can't publish a ${item.status} post.`);
  item.status = "posting";
  await save(items);

  const live = isLive();
  try {
    // The off-limits list may have changed since approval: check again right before posting.
    const hits = await checkCompliance(item.text);
    if (hits.length) throw new Error(`Off-limits term now present: ${hits.map((h) => h.match).join(", ")}`);
    if (/\{\{.*?\}\}/.test(item.text)) throw new Error("Unfilled {{placeholder}}.");

    const image = item.image
      ? { path: path.join(IMAGE_DIR, item.image.file), contentType: item.image.contentType, altText: item.image.altText }
      : undefined;
    const { id: postId } = live ? await publishPost(item.text, image) : { id: null };

    const done = await update(item.id, { status: "posted", postedAt: new Date().toISOString(), mode: live ? "live" : "dry-run", postId });
    await logApproval({
      at: new Date().toISOString(),
      approver: item.approver,
      mode: live ? "live" : "dry-run",
      postId,
      score: item.score ?? 0,
      verdict: item.verdict ?? "",
      chars: item.text.length,
      firstLine: item.text.split(/\r?\n/)[0].slice(0, 120),
      textHash: item.textHash ?? hashText(item.text),
      confirmedClaims: item.confirmedClaims ?? [],
    });
    return done!;
  } catch (e) {
    return (await update(item.id, { status: "failed", error: (e as Error).message }))!;
  }
}

/** Post everything that is due, oldest first, unless the queue is paused. Returns what happened. */
export async function postDue(now = new Date()): Promise<string[]> {
  if ((await loadSettings()).queuePaused) return [];
  const due = (await load())
    .filter((x) => x.status === "queued" && x.scheduledAt && new Date(x.scheduledAt) <= now)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const out: string[] = [];
  for (const item of due) {
    const label = `${item.id.slice(0, 8)} "${item.text.split("\n")[0].slice(0, 50)}"`;
    try {
      const r = await postOne(item.id);
      out.push(
        r.status === "posted"
          ? `${r.mode === "live" ? "POSTED" : "DRY-RUN"} ${label}${r.postId ? ` -> ${r.postId}` : ""}`
          : `FAILED ${label}: ${r.error}`,
      );
    } catch (e) {
      out.push(`SKIPPED ${label}: ${(e as Error).message}`);
    }
  }
  return out;
}

/** The worker writes this every tick, so the UI can tell whether it is running. */
export async function heartbeat() {
  await mkdir(DATA, { recursive: true });
  await writeFile(HEARTBEAT, JSON.stringify({ at: new Date().toISOString(), pid: process.pid }), "utf8");
}

export async function lastHeartbeat(): Promise<string | null> {
  const raw = await readFile(HEARTBEAT, "utf8").catch(() => "");
  try {
    return (JSON.parse(raw) as { at: string }).at;
  } catch {
    return null;
  }
}
