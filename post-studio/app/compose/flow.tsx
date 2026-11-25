"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { GateResult } from "@/lib/gate";
import type { MarketState } from "@/lib/market";
import { api } from "../components/providers";
import { Callout, Icon, Spinner, fmtWhen } from "../components/ui";
import { ScoreRing } from "./ScoreViz";

// ---------- Counting ----------

export const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function Counts({ text, max }: { text: string; max?: number }) {
  const over = max !== undefined && text.length > max;
  return (
    <span className={`meta ${over ? "problem" : ""}`}>
      {words(text).toLocaleString()} words · {text.length.toLocaleString()}
      {max ? ` / ${max.toLocaleString()}` : ""} characters
    </span>
  );
}

// ---------- Step bar ----------

export type Step = { label: string; done: boolean };

export function StepBar({ steps, current, onSelect, canGo }: { steps: Step[]; current: number; onSelect?: (i: number) => void; canGo?: (i: number) => boolean }) {
  return (
    <ol className="steps" aria-label="Progress">
      {steps.map((s, i) => {
        const inner = (
          <>
            <span className="n">{s.done ? <Icon name="check" size={12} /> : i + 1}</span>
            <span>{s.label}</span>
          </>
        );
        return (
          <li key={s.label} className={`${s.done ? "done" : ""} ${i === current ? "current" : ""}`} aria-current={i === current ? "step" : undefined}>
            {onSelect && canGo?.(i) ? (
              <button type="button" className="step-btn" onClick={() => onSelect(i)} title={i === current ? "You are here" : `Go to: ${s.label}`}>{inner}</button>
            ) : inner}
          </li>
        );
      })}
    </ol>
  );
}

/** Back / Continue under each step, so the page opens one step at a time. */
export function StepNav({ onBack, onNext, nextLabel = "Continue", nextDisabled, hint }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; hint?: ReactNode }) {
  return (
    <div className="step-nav">
      {onBack && <button type="button" className="secondary" onClick={onBack}>← Back</button>}
      <span className="spacer" />
      {hint && <span className="meta">{hint}</span>}
      {onNext && <button type="button" onClick={onNext} disabled={nextDisabled}>{nextLabel} →</button>}
    </div>
  );
}

// ---------- Section card with a numbered title ----------

export function Section({ n, title, hint, children, id, accent }: { n: number; title: string; hint?: ReactNode; children: ReactNode; id?: string; accent?: boolean }) {
  return (
    <section className="card" id={id} style={accent ? { borderColor: "var(--accent)" } : undefined}>
      <div className="card-head">
        <h2><span className="step-n">{n}</span>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// ---------- Fill in the blanks ----------

const BLANK = /\{\{\s*([^{}]+?)\s*\}\}/g;
export const blanksIn = (text: string) => [...new Set([...text.matchAll(BLANK)].map((m) => m[1]))];

type Suggestion = { text: string; source: "profile" | "post" | "example" | "hint" };

/** Examples already written into the blank's own label: "…: a, b, c" or "…, e.g. a or b". */
function hintExamples(label: string): string[] {
  const m = label.match(/(?:\be\.g\.|\beg\b\.?|\bfor example\b|:)\s*(.+)$/i); // whole words only: "regressing" must not match "eg"
  if (!m) return [];
  return m[1]
    .split(/,\s*|\s+or\s+/)
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter((x) => x.length > 1 && x.length < 80)
    .slice(0, 4);
}

const SOURCE_LABEL: Record<Suggestion["source"], string> = {
  profile: "from your profile",
  post: "from this post",
  example: "example: only if true",
  hint: "example: only if true",
};

/** Every {{blank}} becomes a labelled input with clickable suggestions; "Put … in the text" inserts them. */
export function BlanksCard({ text, onApply, disabled }: { text: string; onApply: (t: string) => void; disabled?: boolean }) {
  const blanks = blanksIn(text);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<Record<string, Suggestion[]>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!blanks.length) return null;
  const filled = blanks.filter((b) => vals[b]?.trim());

  async function suggest() {
    setLoading(true);
    setErr(null);
    try {
      const d = await api<{ answers: { blank: string; suggestions: Suggestion[] }[] }>("/api/blanks", { method: "POST", json: { text, blanks } });
      const map: Record<string, Suggestion[]> = {};
      for (const a of d.answers) map[a.blank.replace(/^\{\{\s*|\s*\}\}$/g, "")] = a.suggestions;
      setAi(map);
      // Pre-fill only with facts you've stated yourself (profile or post); examples wait for your click.
      setVals((v) => {
        const next = { ...v };
        for (const b of blanks) {
          const fact = map[b]?.find((s) => s.source === "profile" || s.source === "post");
          if (!next[b]?.trim() && fact) next[b] = fact.text;
        }
        return next;
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="callout warn" style={{ display: "block", marginTop: 12 }}>
      <div className="row tight" style={{ justifyContent: "space-between", gap: 8 }}>
        <span>
          <b>Your text has {blanks.length} blank{blanks.length === 1 ? "" : "s"} to fill.</b>{" "}
          <span className="meta">Click a suggestion or type your own. It can&apos;t be published until they&apos;re filled.</span>
        </span>
        <button className="secondary small" onClick={suggest} disabled={disabled || loading}>
          {loading ? <><Spinner /> Finding answers…</> : <><Icon name="sparkle" size={14} /> Suggest answers</>}
        </button>
      </div>
      <p className="blanks-why">
        <b>Why blanks?</b> Claude only writes facts you&apos;ve given it. Where your post needs a real number, name or detail it doesn&apos;t know, it leaves a blank instead of guessing,
        because a made-up figure would cost you trust. Fill each one with the true answer and your post stays honest.
      </p>
      {err && <p className="problem" style={{ margin: "8px 0 0" }}>{err}</p>}
      <div className="stack" style={{ marginTop: 12 }}>
        {blanks.map((b) => {
          const suggestions: Suggestion[] = [
            ...(ai[b] ?? []),
            ...hintExamples(b).filter((h) => !(ai[b] ?? []).some((s) => s.text.toLowerCase() === h.toLowerCase())).map((t) => ({ text: t, source: "hint" as const })),
          ];
          return (
            <div key={b} className="field">
              <label htmlFor={`blank-${b}`}>{b.charAt(0).toUpperCase() + b.slice(1)}</label>
              <input id={`blank-${b}`} type="text" value={vals[b] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [b]: e.target.value }))} placeholder="Type the real fact" disabled={disabled} />
              {suggestions.length > 0 && (
                <div className="chips">
                  {suggestions.map((sg) => (
                    <button
                      key={sg.source + sg.text}
                      type="button"
                      className={`chip ${vals[b] === sg.text ? "on" : ""}`}
                      onClick={() => setVals((v) => ({ ...v, [b]: sg.text }))}
                      disabled={disabled}
                      title={SOURCE_LABEL[sg.source]}
                    >
                      {sg.text}
                      <span className={`src src-${sg.source === "hint" ? "example" : sg.source}`}>{SOURCE_LABEL[sg.source]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="row">
        <button
          className="small"
          disabled={disabled || filled.length === 0}
          onClick={() => {
            onApply(text.replace(BLANK, (whole, name: string) => vals[name.trim()]?.trim() || whole));
            setVals({});
            setAi({});
          }}
        >
          <Icon name="check" size={14} /> Put {filled.length === blanks.length ? `all ${blanks.length}` : `${filled.length} of ${blanks.length}`} in the text
        </button>
        <span className="meta">Green = a fact you&apos;ve already stated. Grey = an example: use it only if it&apos;s true.</span>
      </div>
    </div>
  );
}

// ---------- Settings ----------

export type Mode = "clean" | "rewrite";
export type Settings = { mode: Mode; audience: string; keywords: string[] };

export function SettingsCard({ value, onChange, onDefaultAudience, disabled }: { value: Settings; onChange: (s: Settings) => void; onDefaultAudience: (a: string) => void; disabled?: boolean }) {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    api<{ market: MarketState | null; defaultAudience: string }>("/api/keywords/market")
      .then((d) => {
        setMarket(d.market);
        onDefaultAudience(d.defaultAudience);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (k: string) =>
    onChange({ ...value, keywords: value.keywords.includes(k) ? value.keywords.filter((x) => x !== k) : value.keywords.length >= 8 ? value.keywords : [...value.keywords, k] });

  const options: [Mode, string, string, string][] = [
    ["clean", "Quick clean", "Fixes punctuation and swaps typical AI words. Your sentences stay exactly as you wrote them.", "Instant · free"],
    ["rewrite", "Rewrite in my voice", "Claude also reworks the opening and flat sentences for your audience, using only your facts.", "Claude · about a minute"],
  ];

  return (
    <div className="stack">
      <div className="options" role="radiogroup" aria-label="How much to change">
        {options.map(([m, title, sub, pill]) => (
          <label key={m} className={`option ${value.mode === m ? "on" : ""}`}>
            <input type="radio" name="mode" checked={value.mode === m} onChange={() => onChange({ ...value, mode: m })} disabled={disabled} />
            <div style={{ flex: 1 }}><b>{title}{m === "clean" && <span className="tag" style={{ marginLeft: 6 }}>default</span>}</b><span>{sub}</span></div>
            <span className={`opt-pill ${m}`}>{pill}</span>
          </label>
        ))}
      </div>

      {value.mode === "rewrite" && (
        <div className="stack">
          <label className="field">
            Who is it for?
            <input type="text" value={value.audience} onChange={(e) => onChange({ ...value, audience: e.target.value })} disabled={disabled} placeholder="e.g. frontend engineers and engineering managers" />
          </label>
          <div>
            <div className="row tight" style={{ justifyContent: "space-between" }}>
              <b style={{ fontSize: 13 }}>Keywords to include <span className="meta" style={{ fontWeight: 400 }}>(optional)</span></b>
              <Link href="/plan#trending" className="meta">{market ? `Trending, ${fmtWhen(market.at)}` : "Find trending →"}</Link>
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              {(market?.keywords ?? []).slice(0, 10).map((k) => {
                const label = k.hashtag ?? k.keyword;
                return (
                  <button key={k.keyword} className={`chip ${value.keywords.includes(label) ? "on" : ""}`} onClick={() => toggle(label)} title={k.why} disabled={disabled} aria-pressed={value.keywords.includes(label)}>
                    {label}
                  </button>
                );
              })}
              {value.keywords.filter((p) => !market?.keywords.some((k) => (k.hashtag ?? k.keyword) === p)).map((p) => (
                <button key={p} className="chip on" onClick={() => toggle(p)} aria-label={`Remove ${p}`}>{p} ×</button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Add your own and press Enter"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) {
                  e.preventDefault();
                  toggle(custom.trim());
                  setCustom("");
                }
              }}
              disabled={disabled}
              style={{ marginTop: 8 }}
            />
            <p className="meta" style={{ margin: "6px 0 0" }}>Claude only adds a keyword where it&apos;s true for your post, and tells you which it skipped.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Plain-language score ----------

const TIPS: Record<string, string> = {
  BURSTINESS: "Every sentence is about the same length. Make some very short and some longer.",
  SPECIFICITY: "It's too general. Add real numbers or names: what, how many, which tool.",
  "SLOP DENSITY": "It still has typical AI words. Swap them for plain ones.",
  FINGERPRINT: "It has long dashes or curly quotes. Use - and plain quotes.",
  VOICE: "It doesn't sound like you talking. Use I/we and contractions like didn't or it's.",
};

export function ScoreSummary({ gate, action }: { gate: GateResult; action?: ReactNode }) {
  const s = gate.after.human_score;
  const weakest = Object.entries(gate.after.checks).sort((a, b) => a[1].score - b[1].score)[0];
  const blocked = gate.problems.length > 0 || gate.compliance.length > 0; // sounds fine, but something else still stops publishing
  const kind = gate.after.verdict === "PASS" ? (blocked ? "warn" : "good") : gate.after.verdict === "REVIEW" ? "warn" : "error";
  const title =
    gate.after.verdict === "PASS" ? (blocked ? "Sounds human, but fix the items below first" : "Sounds human. Ready to publish.") : gate.after.verdict === "REVIEW" ? "Almost there" : "Still sounds AI-written";
  const tip =
    gate.after.verdict !== "PASS" && weakest ? TIPS[weakest[0]] ?? weakest[1].detail : blocked ? "Everything reads well. Clear the items below and it's ready." : "Every check passed. Nothing more to do here.";
  return (
    <div className="stack">
      <div className={`score-card ${kind}`}>
        <ScoreRing score={s} verdict={gate.after.verdict} size={76} />
        <div className="sc-body">
          <b>{title}</b>
          <p>{tip}</p>
          {action && <div className="row" style={{ marginTop: 8 }}>{action}</div>}
        </div>
      </div>
      {gate.problems.map((p) => <Callout key={p} kind="error">{p}</Callout>)}
      {gate.compliance.length > 0 && (
        <Callout kind="error">Remove these off-limits words before publishing: {gate.compliance.map((h) => h.match).join(", ")}</Callout>
      )}
      {gate.report.structures.length > 0 && (
        <Callout kind="warn">
          <b>Rewrite by hand:</b> {gate.report.structures.map((x) => `${x.name} (${x.fix})`).join(" ")}
        </Callout>
      )}
    </div>
  );
}

// ---------- Punch line: an ending that gets comments ----------

type Punch = { line: string; style: "question" | "pick-one" | "your-story" | "challenge"; why: string };
const STYLE_LABEL: Record<Punch["style"], string> = {
  question: "Specific question",
  "pick-one": "Pick one",
  "your-story": "Your story",
  challenge: "Try this",
};

/** Swap the post's closing paragraph (if it's a question) for `line`, keeping a trailing hashtag line. */
export function setClosing(text: string, line: string): string {
  const tags = text.match(/\n+((?:#[\w-]+[ \t]*)+)\s*$/);
  let body = tags && tags.index !== undefined ? text.slice(0, tags.index) : text;
  const tail = tags ? `\n\n${tags[1].trim()}` : "";
  // Keep a "Sources:" block where it is, below the closing line.
  const src = body.match(/\n+Sources:\n(?:- \S+\n?)+\s*$/);
  const sources = src && src.index !== undefined ? `\n\n${src[0].trim()}` : "";
  if (src && src.index !== undefined) body = body.slice(0, src.index);
  const paras = body.trimEnd().split(/\n{2,}/);
  if (paras.length > 1 && /\?\s*$/.test(paras[paras.length - 1])) paras.pop();
  return `${paras.join("\n\n").trimEnd()}\n\n${line.trim()}${sources}${tail}`;
}

export function PunchlineCard({ text, audience, onUse, disabled }: { text: string; audience: string; onUse: (t: string) => void; disabled?: boolean }) {
  const [options, setOptions] = useState<Punch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [used, setUsed] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setErr(null);
    try {
      const d = await api<{ options: Punch[] }>("/api/punchline", { method: "POST", json: { text, audience } });
      setOptions(d.options);
      setUsed(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 14, background: "var(--panel-2)", boxShadow: "none" }}>
      <div className="card-head" style={{ marginBottom: options ? 12 : 0 }}>
        <h2><Icon name="send" /> Ending that gets comments</h2>
        <button className={options ? "secondary small" : "small"} onClick={suggest} disabled={disabled || busy || !text.trim()}>
          {busy ? <><Spinner /> Writing endings…</> : <><Icon name="sparkle" size={14} /> {options ? "More options" : "Suggest punch lines"}</>}
        </button>
      </div>
      {!options && !err && <p className="meta" style={{ margin: "6px 0 0" }}>A closing line only this post could ask, so people want to reply. No &quot;Thoughts?&quot; or &quot;Agree?&quot;: the humanizer marks those as bait.</p>}
      {err && <p className="problem" style={{ margin: "6px 0 0" }}>{err}</p>}
      {options && (
        <div className="items">
          {options.map((o) => (
            <div key={o.line} className="item" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div>
                <div className="title" style={{ whiteSpace: "normal" }}>{o.line}</div>
                <div className="sub"><span className="tag">{STYLE_LABEL[o.style]}</span><span>{o.why}</span></div>
              </div>
              <button className={used === o.line ? "small" : "secondary small"} disabled={disabled} onClick={() => { onUse(setClosing(text, o.line)); setUsed(o.line); }}>
                {used === o.line ? <><Icon name="check" size={13} /> Used</> : "Use this"}
              </button>
            </div>
          ))}
          <p className="meta" style={{ margin: 0 }}>&quot;Use this&quot; replaces your closing question (or adds the line above your hashtags). Reply to every comment in the first hour.</p>
        </div>
      )}
    </div>
  );
}
