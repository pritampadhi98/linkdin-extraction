// Daily engagement checklist: how many comments you've made per group, per day. Local only.
import "server-only";
import { loadState } from "./growth";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "engage.json");

export type EngageGroup = "reach" | "peers" | "buyers";
export const GROUPS: EngageGroup[] = ["reach", "peers", "buyers"];
type Day = { counts: Record<EngageGroup, number>; goal: number };
type Store = { days: Record<string, Day> };

/** Local calendar date, YYYY-MM-DD. */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function load(): Promise<Store> {
  const raw = await readFile(FILE, "utf8").catch(() => "");
  try {
    const s = raw ? (JSON.parse(raw) as Store) : { days: {} };
    return s.days ? s : { days: {} };
  } catch {
    return { days: {} };
  }
}

async function save(s: Store) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2), "utf8");
  await rename(tmp, FILE);
}

const empty = (): Day => ({ counts: { reach: 0, peers: 0, buyers: 0 }, goal: 0 });
const total = (d: Day) => d.counts.reach + d.counts.peers + d.counts.buyers;
const met = (d: Day | undefined) => !!d && d.goal > 0 && total(d) >= d.goal;

/** Days in a row with the goal met, ending today (or yesterday, if today isn't done yet). */
function streak(s: Store): number {
  const d = new Date();
  if (!met(s.days[dayKey(d)])) d.setDate(d.getDate() - 1);
  let n = 0;
  while (met(s.days[dayKey(d)])) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Today's targets per group, from the saved weekly plan's engagement section. */
export async function targets(): Promise<Record<EngageGroup, number> & { minutes: number; terms: Record<EngageGroup, string[]> } | null> {
  const plan = (await loadState()).plan;
  if (!plan) return null;
  const t = { reach: 0, peers: 0, buyers: 0, minutes: plan.engagement.daily_minutes, terms: { reach: [], peers: [], buyers: [] } as Record<EngageGroup, string[]> };
  for (const g of plan.engagement.groups) {
    const k = g.kind.toLowerCase().trim() as EngageGroup;
    if (!GROUPS.includes(k)) continue;
    // Claude can return the same kind in several groups (e.g. three "reach" groups): add them up, don't overwrite.
    t[k] += Math.max(0, Math.round(g.count));
    t.terms[k] = [...new Set([...t.terms[k], ...g.search_terms])].slice(0, 3);
  }
  return t;
}

export async function engageState() {
  const [s, t] = await Promise.all([load(), targets()]);
  const today = s.days[dayKey()] ?? empty();
  const goal = t ? t.reach + t.peers + t.buyers : 0;
  return { date: dayKey(), counts: today.counts, goal, targets: t, streak: streak(s) };
}

/** Add (or undo) one comment for a group today. Records today's goal from the plan, for the streak. */
export async function bump(group: EngageGroup, delta: 1 | -1) {
  const [s, t] = await Promise.all([load(), targets()]);
  const k = dayKey();
  const d = s.days[k] ?? empty();
  d.counts[group] = Math.max(0, d.counts[group] + delta);
  if (t) d.goal = t.reach + t.peers + t.buyers;
  s.days[k] = d;
  // Keep about three months.
  for (const key of Object.keys(s.days).sort().slice(0, -90)) delete s.days[key];
  await save(s);
  return engageState();
}
