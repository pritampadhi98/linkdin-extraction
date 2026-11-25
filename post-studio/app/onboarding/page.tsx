"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileScore } from "../Growth";
import type { Approval } from "@/lib/log";
import type { Settings, Slot } from "@/lib/settings";
import { api, useConfirm, useStudio, useToast } from "../components/providers";
import { Callout, DAYS, Icon, PageHead, Skeleton, Spinner, fmtWhen } from "../components/ui";

type LinkedInStatus = {
  appConfigured: boolean;
  redirectUri: string;
  connected: boolean;
  expired: boolean;
  name: string | null;
  picture: string | null;
  expiresAt: string | null;
};

const CONNECT_MESSAGES: Record<string, [kind: "good" | "error" | "warn", text: string]> = {
  connected: ["good", "LinkedIn connected."],
  denied: ["warn", "You cancelled the LinkedIn sign-in."],
  "bad-state": ["error", "Sign-in check failed (state mismatch). Try Connect again."],
  "missing-app": ["error", "The LinkedIn app isn't set up yet. See the steps below."],
  "token-failed": ["error", "LinkedIn didn't issue a token. Check the app's Client Secret and redirect URL."],
  "userinfo-failed": ["error", "Connected, but couldn't read your name. Check the app has 'Sign In with LinkedIn using OpenID Connect'."],
  network: ["error", "Couldn't reach LinkedIn. Check your connection and retry."],
  "linkedin-error": ["error", "LinkedIn refused the sign-in."],
};

export default function SettingsPage() {
  const { refresh } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const [li, setLi] = useState<LinkedInStatus | null>(null);
  const [notice, setNotice] = useState<[string, string] | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [offLimits, setOffLimits] = useState("");
  const [savedOff, setSavedOff] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [live, setLive] = useState(false);
  const [liVersion, setLiVersion] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<Slot>({ day: 1, time: "08:30" });
  const [busy, setBusy] = useState<string | null>(null);
  const [scored, setScored] = useState(false);

  const loadLi = () => api<LinkedInStatus>("/api/linkedin/status").then(setLi).catch(() => {});
  const load = () =>
    api<{ settings: Settings; offLimits: string; approvals: Approval[]; live: boolean; liVersion: string | null }>("/api/settings")
      .then((d) => {
        setS(d.settings);
        setSaved(d.settings);
        setOffLimits(d.offLimits);
        setSavedOff(d.offLimits);
        setApprovals(d.approvals);
        setLive(d.live);
        setLiVersion(d.liVersion);
      })
      .catch((e) => toast("error", (e as Error).message));

  useEffect(() => {
    loadLi();
    load();
    const p = new URLSearchParams(window.location.search);
    const q = p.get("linkedin");
    if (q) {
      const [kind, text] = CONNECT_MESSAGES[q] ?? ["error", q];
      const detail = p.get("detail");
      setNotice([kind, `${text}${detail ? ` LinkedIn says: ${detail}` : ""}`]);
      window.history.replaceState(null, "", "/onboarding");
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(label: string, patch: Partial<Settings> & { offLimits?: string }, msg: string) {
    setBusy(label);
    try {
      const d = await api<{ settings: Settings }>("/api/settings", { method: "PATCH", json: patch });
      setS(d.settings);
      setSaved(d.settings);
      if (patch.offLimits !== undefined) setSavedOff(patch.offLimits);
      toast("success", msg);
      await refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!(await confirm({ title: "Disconnect LinkedIn?", body: "Scheduled posts won't publish until you connect again.", confirm: "Disconnect", danger: true }))) return;
    await api("/api/linkedin/status", { method: "DELETE" });
    toast("success", "LinkedIn disconnected.");
    loadLi();
    refresh();
  }

  const slotsDirty = s && saved && JSON.stringify(s.slots) !== JSON.stringify(saved.slots);
  const aboutDirty = !!s && !!saved && (["approverName", "audience", "focus", "people"] as const).some((k) => s[k].trim() !== saved[k]);
  const progress = [
    { id: "connect", label: "Connect LinkedIn", done: !!li?.connected },
    { id: "about", label: "About you", done: !!saved?.approverName && !!saved?.audience },
    { id: "profile", label: "Your profile", done: scored },
    { id: "rules", label: "Posting rules", done: !!saved && saved.slots.length > 0 },
  ];
  const doneCount = progress.filter((x) => x.done).length;

  return (
    <div className="page">
      <PageHead title="Onboarding" sub="Four quick steps. Everything you enter here is reused when you plan, write and publish." />

      <nav className="onb-progress" aria-label="Onboarding progress">
        <span className="onb-count">{doneCount} of {progress.length} done</span>
        {progress.map((x, i) => (
          <a key={x.id} href={`#${x.id}`} className={x.done ? "done" : ""}>
            <span className="num">{x.done ? <Icon name="check" size={12} /> : i + 1}</span>{x.label}
          </a>
        ))}
        {doneCount === progress.length && <Link href="/plan" className="btn small" style={{ marginLeft: "auto" }}>Next: Plan <Icon name="send" size={13} /></Link>}
      </nav>

      <div className="stack">
        {/* ---------- LinkedIn ---------- */}
        <div className="card" id="connect">
          <div className="card-head"><h2><span className="step-n">1</span>Connect LinkedIn</h2><span className="hint">So approved posts can be published</span></div>
          {notice && <div style={{ marginBottom: 12 }}><Callout kind={notice[0] as "good"}>{notice[1]}</Callout></div>}
          {!li ? (
            <Skeleton h={48} />
          ) : li.connected ? (
            <div className="row tight" style={{ gap: 12 }}>
              {li.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={li.picture} alt="" />
              ) : <span className="avatar">{li.name?.slice(0, 1)}</span>}
              <div>
                <b>{li.name}</b>
                <div className="meta">Connected · access expires {fmtWhen(li.expiresAt)}. Reconnect before then.</div>
              </div>
              <span className="spacer" />
              <a href="/api/linkedin/connect" className="btn secondary small">Reconnect</a>
              <button className="secondary small" onClick={disconnect}>Disconnect</button>
            </div>
          ) : (
            <>
              {li.expired && <div style={{ marginBottom: 12 }}><Callout kind="warn">Your LinkedIn connection expired. Connect again.</Callout></div>}
              <div className="row tight">
                <a href={li.appConfigured ? "/api/linkedin/connect" : undefined} aria-disabled={!li.appConfigured} className="btn" style={li.appConfigured ? undefined : { opacity: 0.45, pointerEvents: "none" }}>
                  <Icon name="link" /> Connect LinkedIn
                </a>
                <span className="meta">Uses LinkedIn&apos;s official sign-in. Post Studio never sees your password.</span>
              </div>
              {!li.appConfigured && (
                <p className="meta">
                  LinkedIn sign-in isn&apos;t set up on this server yet. Ask your admin to add the LinkedIn app details.
                </p>
              )}
            </>
          )}
        </div>

        {/* ---------- About you ---------- */}
        <div className="card" id="about">
          <div className="card-head"><h2><span className="step-n">2</span>About you</h2><span className="hint">Used for trending research, planning and approvals</span></div>
          {!s ? <Skeleton h={160} /> : (
            <div className="stack">
              <p className="meta" style={{ margin: 0 }}>Fill this in once. Post Studio reuses it in every later step, so you never retype it.</p>
              <div className="grid">
                <label className="field">
                  <span className="field-label">Your name <span className="req">Required</span></span>
                  <input type="text" value={s.approverName} onChange={(e) => setS({ ...s, approverName: e.target.value })} placeholder="e.g. Priya Sharma" maxLength={80} />
                  <span className="field-help"><b>Used for:</b> approving posts. It&apos;s filled in for you in Review and saved in the approval log next to every post.<br /><b>Why:</b> nothing is published without a named person saying yes.</span>
                </label>
                <label className="field">
                  <span className="field-label">Focus <span className="opt">Optional</span></span>
                  <input type="text" value={s.focus} onChange={(e) => setS({ ...s, focus: e.target.value })} placeholder="e.g. web performance, multi-tenant SaaS" maxLength={400} />
                  <span className="field-help"><b>Used for:</b> narrowing trending research in Plan to the topics you know best.<br /><b>Why:</b> without it, you get broader topics for your whole audience.</span>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Who you write for <span className="req">Required</span></span>
                <input type="text" value={s.audience} onChange={(e) => setS({ ...s, audience: e.target.value })} placeholder="e.g. Frontend engineers and engineering managers in India" maxLength={400} />
                <span className="field-help"><b>Used for:</b> finding what this audience is talking about (Plan → Trending topics), and tuning &quot;Rewrite in my voice&quot; and punch lines in Review.<br /><b>Why:</b> a post written for a specific reader gets more replies than one written for everyone. Be specific: role, seniority, region.</span>
              </label>
              <label className="field">
                <span className="field-label">People or companies you want to be visible to <span className="opt">Optional · one per line</span></span>
                <textarea style={{ minHeight: 70 }} value={s.people} onChange={(e) => setS({ ...s, people: e.target.value })} placeholder={"e.g. Vercel\nFrontend leads in Bangalore"} />
                <span className="field-help"><b>Used for:</b> the engagement list (Advanced tools → Engage): whose posts to comment on, and what to add.<br /><b>Why:</b> commenting where these people already are puts your name in front of them. Only names you list are used; leave it empty and Plan suggests the kinds of people to look for. Post Studio never comments for you.</span>
              </label>
              <div className="row">
                <button onClick={() => save("about", { approverName: s.approverName, audience: s.audience, focus: s.focus, people: s.people }, "Saved. Plan will use these.")} disabled={!aboutDirty || busy === "about"}>
                  {busy === "about" ? <Spinner /> : null} Save
                </button>
                {aboutDirty && saved && <button className="ghost" onClick={() => setS({ ...s, approverName: saved.approverName, audience: saved.audience, focus: saved.focus, people: saved.people })}>Undo</button>}
              </div>
            </div>
          )}
        </div>

        {/* ---------- Your profile ---------- */}
        <div className="card" id="profile">
          <div className="card-head"><h2><span className="step-n">3</span>Your profile</h2><span className="hint">Upload once; Plan builds your week from it</span></div>
          <ProfileScore onScored={setScored} />
        </div>

        {/* ---------- Posting rules ---------- */}
        <div className="onb-step-head" id="rules"><span className="step-n">4</span>Posting rules</div>
        <div className="card">
          <div className="card-head"><h2>Schedule &amp; publishing</h2></div>
          {!s ? <Skeleton h={160} /> : (
            <div className="stack">
              <div>
                <b style={{ fontSize: 14 }}>Posting slots</b>
                <p className="meta" style={{ margin: "2px 0 10px" }}>&quot;Add to queue&quot; puts a post in the next free slot. Times use this computer&apos;s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
                {s.slots.length === 0 ? <p className="warning">No slots. Add at least one to use the queue.</p> : (
                  <div className="chips">
                    {s.slots.map((sl) => (
                      <span key={`${sl.day}-${sl.time}`} className="chip" style={{ cursor: "default", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {DAYS[sl.day].slice(0, 3)} {sl.time}
                        <button className="ghost icon" style={{ padding: 2 }} aria-label={`Remove ${DAYS[sl.day]} ${sl.time}`} onClick={() => setS({ ...s, slots: s.slots.filter((x) => x !== sl) })}><Icon name="x" size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="row">
                  <select value={newSlot.day} onChange={(e) => setNewSlot({ ...newSlot, day: Number(e.target.value) })} style={{ width: 150 }} aria-label="Day">
                    {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                  <input type="time" value={newSlot.time} onChange={(e) => setNewSlot({ ...newSlot, time: e.target.value })} style={{ width: 130 }} aria-label="Time" />
                  <button
                    className="secondary"
                    disabled={!/^\d\d:\d\d$/.test(newSlot.time) || s.slots.some((x) => x.day === newSlot.day && x.time === newSlot.time)}
                    onClick={() => setS({ ...s, slots: [...s.slots, newSlot].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)) })}
                  >
                    <Icon name="plus" /> Add slot
                  </button>
                  <span className="spacer" />
                  {slotsDirty && <button className="ghost" onClick={() => setS({ ...s, slots: saved!.slots })}>Undo</button>}
                  <button onClick={() => save("slots", { slots: s.slots }, "Posting slots saved.")} disabled={!slotsDirty || busy === "slots"}>{busy === "slots" ? <Spinner /> : null} Save slots</button>
                </div>
              </div>

              <div className="row tight" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div>
                  <b style={{ fontSize: 14 }}>Automatic publishing</b>
                  <div className="meta">{s.queuePaused ? "Paused: queued posts wait until you resume." : "On: the worker publishes queued posts when they're due."}</div>
                </div>
                <button className="secondary" onClick={() => save("pause", { queuePaused: !s.queuePaused }, s.queuePaused ? "Queue resumed." : "Queue paused.")} disabled={busy === "pause"}>
                  <Icon name={s.queuePaused ? "play" : "pause"} /> {s.queuePaused ? "Resume" : "Pause"}
                </button>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <b style={{ fontSize: 14 }}>Live posting: {live ? <span className="problem">ON</span> : <span>off (test mode)</span>}</b>
                <p className="meta" style={{ margin: "4px 0 0" }}>
                  {live
                    ? "Approved posts go to LinkedIn for real."
                    : "Approved posts are recorded but never sent to LinkedIn."}
                  {live && !liVersion && <> <span className="warning">LinkedIn publishing isn&apos;t fully configured yet. Ask your admin.</span></>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ---------- Hashtags & links ---------- */}
        <div className="card">
          <div className="card-head"><h2>Hashtags &amp; links</h2><span className="hint">Used by Write with Claude, Rewrite in my voice and Fix it for me</span></div>
          {!s ? <Skeleton h={100} /> : (
            <div className="stack">
              <div>
                <b style={{ fontSize: 14 }}>Hashtags per post</b>
                <div className="row">
                  <div className="seg" role="radiogroup" aria-label="Hashtags per post">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <button key={n} className={s.hashtagCount === n ? "on" : ""} aria-pressed={s.hashtagCount === n} disabled={busy === "tags"}
                        onClick={() => save("tags", { hashtagCount: n }, `Posts will end with ${n} hashtag${n === 1 ? "" : "s"}.`)}>{n}</button>
                    ))}
                  </div>
                </div>
                <p className={`meta ${s.hashtagCount >= 5 ? "warning" : ""}`} style={{ margin: "6px 0 0" }}>
                  {s.hashtagCount >= 5
                    ? "5 or more in a row counts as a \"hashtag wall\": the humanizer takes about 7 points off \"Sounds like a person\". Usually fine, but it can tip a borderline post below Ready to publish."
                    : "Up to 4 has no effect on the human score. The li-post skill recommends 3."}
                </p>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <b style={{ fontSize: 14 }}>Where reference links go (default)</b>
                <div className="options" style={{ marginTop: 8 }} role="radiogroup" aria-label="Where reference links go">
                  {([
                    ["comment", "In a first comment", "The post stays link-free; Post Studio gives you the comment to copy and add right after posting."],
                    ["post", "In the post", "Added as \"Sources:\" above your hashtags. The li-post skill says LinkedIn shows posts with links to fewer people (not confirmed)."],
                  ] as const).map(([v, title, sub]) => (
                    <label key={v} className={`option ${s.linkPlacement === v ? "on" : ""}`}>
                      <input type="radio" name="placement" checked={s.linkPlacement === v} onChange={() => save("links", { linkPlacement: v }, "Link setting saved.")} />
                      <div><b>{title}</b><span>{sub}</span></div>
                    </label>
                  ))}
                </div>
                <p className="meta" style={{ margin: "6px 0 0" }}>You can still switch for a single post when you review it.</p>
              </div>
            </div>
          )}
        </div>

        {/* ---------- Off-limits ---------- */}
        <div className="card">
          <div className="card-head">
            <h2>Off-limits terms</h2>
            <span className="hint">Any match blocks publishing. Checked at approval and again right before posting.</span>
          </div>
          <textarea style={{ minHeight: 180, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} value={offLimits} onChange={(e) => setOffLimits(e.target.value)} aria-label="Off-limits terms" />
          <div className="row">
            <span className="meta">One term per line, whole words, any case. <code>/regex/</code> for patterns. Lines starting with # are notes.</span>
            <span className="spacer" />
            {offLimits !== savedOff && <button className="ghost" onClick={() => setOffLimits(savedOff)}>Undo</button>}
            <button onClick={() => save("off", { offLimits }, "Off-limits list saved.")} disabled={offLimits === savedOff || busy === "off"}>{busy === "off" ? <Spinner /> : null} Save list</button>
          </div>
        </div>

        {/* ---------- Audit ---------- */}
        <div className="card">
          <div className="card-head"><h2>Approval log</h2><span className="hint">Every publish, live or dry run, with who approved it</span></div>
          {approvals.length === 0 ? <p className="meta" style={{ margin: 0 }}>No approvals yet.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Approver</th><th>Mode</th><th className="num">Score</th><th>First line</th></tr></thead>
                <tbody>
                  {approvals.slice(0, 50).map((a, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(a.at)}</td>
                      <td>{a.approver}</td>
                      <td>{a.mode === "live" ? <span className="badge b-posted">live</span> : <span className="tag">dry run</span>}</td>
                      <td className="num">{a.score.toFixed(0)} {a.verdict}</td>
                      <td style={{ maxWidth: 360 }}><div className="truncate">{a.firstLine}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
