import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "approvals.jsonl");

export type Approval = {
  at: string;
  approver: string;
  mode: "live" | "dry-run";
  postId: string | null;
  score: number;
  verdict: string;
  chars: number;
  firstLine: string;
  textHash?: string; // fingerprint of the exact approved text
  confirmedClaims?: string[]; // numbers the approver confirmed as true
};

export async function logApproval(a: Approval) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await appendFile(FILE, JSON.stringify(a) + "\n", "utf8");
}

export async function readApprovals(): Promise<Approval[]> {
  const raw = await readFile(FILE, "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Approval)
    .reverse();
}
