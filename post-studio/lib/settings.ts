// Shared by the Next.js server and the queue worker (plain Node), so no "server-only" import.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "settings.json");

/** A weekly posting slot: day 0 = Sunday … 6 = Saturday, time "HH:MM" in the machine's local time. */
export type Slot = { day: number; time: string };

export type LinkPlacement = "comment" | "post";

export type Settings = {
  approverName: string;
  slots: Slot[];
  queuePaused: boolean;
  hashtagCount: number; // how many hashtags drafts and rewrites end with (1-8)
  linkPlacement: LinkPlacement; // reference links: in a first comment (copied by you) or at the end of the post
  audience: string; // who you write for (Onboarding → About you); used by trending research and planning
  focus: string; // optional topic focus, e.g. "web performance"
  people: string; // optional people or companies to be visible to, one per line; used by the profile plan
};

export const DEFAULT_SETTINGS: Settings = {
  approverName: "",
  // Tue / Wed / Thu mornings: a common starting point. Change it in Settings.
  slots: [
    { day: 2, time: "08:30" },
    { day: 3, time: "08:30" },
    { day: 4, time: "08:30" },
  ],
  queuePaused: false,
  hashtagCount: 3,
  linkPlacement: "comment",
  audience: "",
  focus: "",
  people: "",
};

export const clampHashtags = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(8, Math.max(1, v)) : DEFAULT_SETTINGS.hashtagCount;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validSlots(slots: unknown): Slot[] | null {
  if (!Array.isArray(slots) || slots.length > 28) return null;
  const out: Slot[] = [];
  for (const s of slots) {
    const day = Number((s as Slot)?.day);
    const time = String((s as Slot)?.time ?? "");
    if (!Number.isInteger(day) || day < 0 || day > 6 || !TIME.test(time)) return null;
    if (!out.some((o) => o.day === day && o.time === time)) out.push({ day, time });
  }
  return out.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

export async function loadSettings(): Promise<Settings> {
  const raw = await readFile(FILE, "utf8").catch(() => "");
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      approverName: typeof s.approverName === "string" ? s.approverName : "",
      slots: validSlots(s.slots) ?? DEFAULT_SETTINGS.slots,
      queuePaused: s.queuePaused === true,
      hashtagCount: s.hashtagCount === undefined ? DEFAULT_SETTINGS.hashtagCount : clampHashtags(s.hashtagCount),
      linkPlacement: s.linkPlacement === "post" ? "post" : "comment",
      audience: typeof s.audience === "string" ? s.audience : "",
      focus: typeof s.focus === "string" ? s.focus : "",
      people: typeof s.people === "string" ? s.people : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(tmp, FILE);
  return next;
}

/** The first slot time after `after` that isn't in `taken` (ISO strings, minute precision). */
export function nextFreeSlot(slots: Slot[], taken: string[], after = new Date()): Date | null {
  if (!slots.length) return null;
  const used = new Set(taken.map((t) => new Date(t).toISOString().slice(0, 16)));
  const start = new Date(after);
  for (let d = 0; d < 7 * 26; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    for (const s of slots.filter((x) => x.day === day.getDay())) {
      const [h, m] = s.time.split(":").map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at > after && !used.has(at.toISOString().slice(0, 16))) return at;
    }
  }
  return null;
}
