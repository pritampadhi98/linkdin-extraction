"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { wordDiff } from "@/lib/diff";
import type { Draft } from "@/lib/draft";
import type { GateResult } from "@/lib/gate";
import type { MarketState } from "@/lib/market";
import type { QueueItem } from "@/lib/queue";
import GateReport from "../components/GateReport";
import { api, useConfirm, useStudio, useToast } from "../components/providers";
import { Callout, Icon, PageHead, Spinner, StatusBadge, fmtWhen, localInput } from "../components/ui";
import HumanizerProcess from "./HumanizerProcess";
import ImageMaker from "./ImageMaker";
import { BlanksCard, Counts, PunchlineCard, ScoreSummary, Section, SettingsCard, StepBar, StepNav, blanksIn, words, type Settings } from "./flow";

const MAX_CHARS = 3000;
/** Show {{blanks}} as orange chips so they stand out in the text. */
const withBlanks = (text: string) => text.split(/(\{\{[^{}]+\}\})/g).map((part, i) => (i % 2 ? <span key={i} className="blank-mark">{part}</span> : part));
const PREVIEW_CHARS = 210;
type When = "now" | "queue" | "schedule";
type Stage = "rewriting" | "cleaning" | "fixing";
type Rewrite = { changes: string[]; keywords_used: string[]; skipped: string[] };

export default function Composer() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const trendKey = params.getAll("trend").join("|"); // ?trend=a&trend=b: topics picked in Plan
  const { data, refresh } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const reviewRef = useRef<HTMLDivElement>(null);

  // ---- content ----
  const [post, setPost] = useState<QueueItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<string | null>(null); // the original the result was made from
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [view, setView] = useState<"changes" | "edit">("changes");
  const [paneLayout, setPaneLayout] = useState<"both" | "result">("both");
  const [savedText, setSavedText] = useState(""); // what is saved on the server, for "unsaved changes"

  // ---- humanize ----
  const [settings, setSettings] = useState<Settings>({ mode: "clean", audience: "", keywords: [] });
  const [stage, setStage] = useState<Stage | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fixRound, setFixRound] = useState(0);

  // ---- check of the (editable) result ----
  const [gate, setGate] = useState<GateResult | null>(null);
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkSeq = useRef(0);
  const autoRef = useRef<string | null>(null); // the text the humanizer last produced; if the result still equals it, you haven't edited it by hand
  const autoFailed = useRef<string | null>(null); // content a quick clean already failed on, so it isn't retried in a loop
  const processRef = useRef<HTMLDivElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1); // 1 content, 2 settings, 3 humanize, 4 review, 5 publish: one is open at a time
  const go = (n: number) => {
    setStep(n);
    setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const [autoClean, setAutoClean] = useState(false); // opt-in: run quick clean by itself after paste or typing
  const scrollNext = useRef(false); // after Paste or a Claude draft, scroll to the result once it's ready

  // ---- publish ----
  const [approver, setApprover] = useState("");
  const [acceptReview, setAcceptReview] = useState(false);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [when, setWhen] = useState<When>("queue");
  const [at, setAt] = useState(() => localInput(new Date(Date.now() + 2 * 3600_000)));
  // From the Schedule calendar: "+ 08:30" on an open slot opens a new post set to that time.
  const atParam = params.get("at");
  useEffect(() => {
    if (editId || !atParam) return;
    const d = new Date(atParam);
    if (!Number.isNaN(d.getTime()) && d > new Date()) {
      setAt(localInput(d));
      setWhen("schedule");
    }
  }, [editId, atParam]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [keptImage, setKeptImage] = useState(false);
  const [altText, setAltText] = useState("");
  const [makingImage, setMakingImage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // ---- write with Claude ----
  const [aiOpen, setAiOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [facts, setFacts] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<(Draft & { model: string }) | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [profileTopics, setProfileTopics] = useState<MarketState["keywords"]>([]); // ideas drawn from your profile
  // Profile topics first, then trending ones, without duplicates.
  const allTopics = [...profileTopics, ...(market?.keywords ?? [])].filter((k, i, a) => a.findIndex((x) => x.keyword === k.keyword) === i);
  const [links, setLinks] = useState("");
  const [placement, setPlacement] = useState<"comment" | "post">("comment");
  const placementSet = useRef(false);
  useEffect(() => {
    if (data && !placementSet.current) {
      placementSet.current = true;
      setPlacement(data.settings.linkPlacement);
    }
  }, [data]);
  type TrendItem = MarketState["keywords"][number];
  const MAX_TRENDS = 4;
  const [trends, setTrends] = useState<TrendItem[]>([]);

  const pickTrends = (list: TrendItem[]) => {
    setTrends(list);
    if (list.length === 1) setIdea(`${list[0].keyword}: ${list[0].angle || list[0].why}`);
    else if (list.length > 1) setIdea(`${list.map((k) => k.keyword).join(" + ")}: ${list[0].angle || list[0].why}`);
  };
  const toggleTrend = (k: TrendItem) =>
    pickTrends(trends.some((t) => t.keyword === k.keyword) ? trends.filter((t) => t.keyword !== k.keyword) : [...trends, k].slice(0, MAX_TRENDS));

  // Trending topics picked in Plan; ?trend=<keyword> (repeatable) opens "Write with Claude" on those topics.
  useEffect(() => {
    Promise.all([
      api<{ market: MarketState | null }>("/api/keywords/market"),
      api<{ topics: MarketState | null }>("/api/profile/topics").catch(() => ({ topics: null })),
    ])
      .then(([{ market: m }, { topics: pt }]) => {
        setMarket(m);
        setProfileTopics(pt?.keywords ?? []);
        const wanted = trendKey ? trendKey.split("|") : [];
        const picked = [...(pt?.keywords ?? []), ...(m?.keywords ?? [])]
          .filter((x, i, a) => wanted.includes(x.keyword) && a.findIndex((y) => y.keyword === x.keyword) === i)
          .slice(0, MAX_TRENDS);
        if (picked.length) {
          setAiOpen(true);
          pickTrends(picked);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendKey]);

  const finalText = result ?? original;
  const urls = links.split(/\s+/).map((l) => l.trim()).filter((l) => /^https?:\/\/\S+$/.test(l)).slice(0, 10);
  // What actually posts: with "in the post", reference links go above the closing hashtag line.
  const postText = placement === "post" && urls.length ? withLinks(finalText, urls) : finalText;
  const firstComment = urls.length ? `Sources:\n${urls.map((u) => `- ${u}`).join("\n")}` : "";
  const dirty = postText !== savedText || (imageFile !== null) || (!!post?.image && !keptImage);
  const editable = !post || ["draft", "queued", "failed", "cancelled"].includes(post.status);
  const working = stage !== null;

  // Remember the chosen mode for next time (write only after the saved value has been read).
  const modeLoaded = useRef(false);
  useEffect(() => {
    try {
      const m = localStorage.getItem("ps-humanize-mode");
      if (m === "clean" || m === "rewrite") setSettings((s) => ({ ...s, mode: m }));
      setAutoClean(localStorage.getItem("ps-auto-clean") === "1");
    } catch {}
    modeLoaded.current = true;
  }, []);
  const chooseSettings = (next: Settings) => {
    setSettings(next);
    if (modeLoaded.current && next.mode !== settings.mode) {
      try {
        localStorage.setItem("ps-humanize-mode", next.mode);
      } catch {}
    }
  };

  useEffect(() => {
    if (data && !approver) setApprover(data.settings.approverName);
  }, [data, approver]);

  useEffect(() => {
    if (!imageFile) return setImagePreview(null);
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!working) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [working]);

  // Load the post being edited, and run a quick clean so the review and publish steps are ready.
  useEffect(() => {
    setPost(null);
    setLoadError(null);
    setStep(1);
    if (!editId) return;
    api<{ item: QueueItem }>(`/api/posts/${encodeURIComponent(editId)}`)
      .then(async ({ item }) => {
        setPost(item);
        // A saved post may already carry its "Sources:" block; take it out so it isn't added twice.
        const stripped = stripLinks(item.text);
        if (stripped.found) setPlacement("post");
        placementSet.current = true;
        setOriginal(stripped.text);
        setSavedText(item.text);
        setKeptImage(!!item.image);
        setAltText(item.image?.altText ?? "");
        setLinks((item.links ?? []).join("\n"));
        setImageFile(null);
        if (item.scheduledAt && new Date(item.scheduledAt) > new Date()) {
          setAt(localInput(new Date(item.scheduledAt)));
          setWhen(item.timing === "slot" ? "queue" : "schedule");
        }
        if (stripped.text.trim()) await humanize(stripped.text, "clean", true);
      })
      .catch((e) => setLoadError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Re-check the result whenever it is edited, so the score always matches what will post.
  useEffect(() => {
    if (result === null || !result.trim() || result === checkedText) return;
    const seq = ++checkSeq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const g = await api<GateResult>("/api/check", { method: "POST", json: { text: result } });
        if (seq === checkSeq.current) {
          setGate(g);
          setCheckedText(result);
        }
      } catch {
        // keep the last score; publishing re-checks on the server anyway
      } finally {
        if (seq === checkSeq.current) setChecking(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [result, checkedText]);

  useEffect(() => setAcceptReview(false), [gate?.after.verdict]);
  // A changed draft means a changed set of numbers: confirmations only carry over for numbers still in it.
  useEffect(() => {
    const keep = new Set((gate?.claims ?? []).map((c) => c.id));
    setConfirmed((c) => (c.every((x) => keep.has(x)) ? c : c.filter((x) => keep.has(x))));
  }, [gate?.claims]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || !finalText.trim()) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, finalText]);

  async function humanize(input = original, mode = settings.mode, silent = false) {
    if (working || !input.trim()) return;
    setError(null);
    let base = input;
    try {
      if (mode === "rewrite") {
        setStage("rewriting");
        const r = await api<Rewrite & { revised: string }>("/api/improve", {
          method: "POST",
          json: { text: input, audience: settings.audience, keywords: settings.keywords },
        });
        base = r.revised;
        setRewrite({ changes: r.changes, keywords_used: r.keywords_used, skipped: r.skipped });
      } else {
        setRewrite(null);
      }
      setStage("cleaning");
      const g = await api<GateResult>("/api/check", { method: "POST", json: { text: base } });
      if (!g.cleaned.trim()) throw new Error("The humanizer returned empty text. Check your content and try again.");
      checkSeq.current++; // cancel any pending re-check
      autoRef.current = g.cleaned;
      autoFailed.current = null;
      setResult(g.cleaned);
      setGate(g);
      setCheckedText(g.cleaned);
      setChecking(false);
      setLastInput(input);
      setView("changes");
      if (!silent) {
        toast("success", g.cleaned === input ? "Done. Nothing needed changing." : "Done. Review the changes below.");
        setTimeout(() => (processRef.current ?? reviewRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      } else if (scrollNext.current) {
        setTimeout(() => (processRef.current ?? reviewRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
      scrollNext.current = false;
    } catch (e) {
      autoFailed.current = input;
      scrollNext.current = false;
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setStage(null);
    }
  }

  // Optional (the "Run automatically" switch): quick clean is instant and local, so it can start by itself a moment after you paste or stop typing.
  // It never overwrites text you edited by hand, and Claude's rewrite still waits for your click.
  useEffect(() => {
    if (!autoClean || settings.mode !== "clean" || !editable || working) return;
    if (!original.trim() || original.length > MAX_CHARS * 2) return;
    if (result !== null && lastInput === original) return; // already up to date
    if (result !== null && result !== autoRef.current) return; // you edited the result: don't replace it
    if (autoFailed.current === original) return;
    const t = setTimeout(() => { humanize(original, "clean", true); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClean, original, settings.mode, editable, working, result, lastInput]);

  /** Raise the score automatically: Claude rewrites the weak spots, the humanizer re-scores, up to 2 rounds. */
  async function autoFix() {
    if (working || result === null || !result.trim()) return;
    setError(null);
    const start = result;
    let text = result;
    let g: GateResult | null = null;
    const notes: string[] = [];
    try {
      setStage("fixing");
      for (let round = 1; round <= 2; round++) {
        setFixRound(round);
        const r = await api<Rewrite & { revised: string }>("/api/improve", {
          method: "POST",
          json: { text, audience: settings.audience, keywords: settings.keywords },
        });
        notes.push(...r.changes);
        g = await api<GateResult>("/api/check", { method: "POST", json: { text: r.revised } });
        if (!g.cleaned.trim()) throw new Error("The rewrite came back empty. Try again.");
        text = g.cleaned;
        if (g.after.verdict === "PASS") break;
      }
      checkSeq.current++;
      setRewrite({ changes: notes, keywords_used: [], skipped: [] });
      setLastInput(start); // the review now compares your previous result with the fixed one
      setResult(text);
      setGate(g);
      setCheckedText(text);
      setChecking(false);
      setView("changes");
      toast(g!.after.verdict === "PASS" ? "success" : "info",
        g!.after.verdict === "PASS"
          ? `Fixed: score ${g!.after.human_score.toFixed(0)}/100, ready to publish. Check the changes.`
          : `Score is now ${g!.after.human_score.toFixed(0)}/100. Claude can only use facts you've given, so add a real number or name to go further.`);
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setStage(null);
      setFixRound(0);
    }
  }

  async function clearAll() {
    if (finalText.trim() && !(await confirm({ title: "Clear everything?", body: "Your text and the humanized result will be removed from the editor. Saved posts aren't affected.", confirm: "Clear", danger: true }))) return;
    setOriginal("");
    setResult(null);
    setGate(null);
    setCheckedText(null);
    setLastInput(null);
    setRewrite(null);
    setError(null);
    setAiDraft(null);
    setStep(1);
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(finalText);
      toast("success", "Copied to clipboard.");
    } catch {
      toast("error", "Couldn't copy. Select the text and press Cmd+C.");
    }
  }

  async function pasteIn() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast("info", "Your clipboard is empty.");
      scrollNext.current = true;
      setOriginal(t);
    } catch {
      toast("info", "Your browser blocked clipboard access. Click in the box and press Cmd+V.");
    }
  }

  // ---------- publish ----------

  const fresh = gate !== null && result !== null && checkedText === result && !checking;
  const blockers: string[] = [];
  if (result === null) blockers.push("Humanize your content first (step 3).");
  else if (!result.trim()) blockers.push("The result is empty.");
  else if (!fresh) blockers.push("Checking your latest edits…");
  else {
    blockers.push(...gate!.problems);
    if (gate!.compliance.length) blockers.push("Remove the off-limits words.");
    const open = gate!.claims.filter((c) => !c.supported && !confirmed.includes(c.id)).length;
    if (open) blockers.push(`Confirm ${open} number${open === 1 ? "" : "s"} below are true, or remove them.`);
    if (gate!.after.verdict !== "PASS" && !acceptReview) blockers.push(`Human score is ${gate!.after.human_score.toFixed(0)}: improve it, or tick "publish anyway".`);
  }
  if (!approver.trim()) blockers.push("Add your name under Approved by.");
  if ((imageFile || keptImage) && !altText.trim()) blockers.push("Describe the image (alt text).");
  if (when === "schedule" && new Date(at).getTime() < Date.now()) blockers.push("Pick a time in the future.");
  if (when === "queue" && !data?.nextSlot) blockers.push("No posting slots set. Add some in Settings, or pick a time.");
  const uniqueBlockers = [...new Set(blockers)];

  function form(action: string) {
    const f = new FormData();
    f.set("action", action);
    if (post) f.set("id", post.id);
    f.set("text", postText);
    f.set("links", urls.join("\n"));
    f.set("approver", approver.trim());
    f.set("acceptReview", String(acceptReview));
    f.set("confirmedClaims", confirmed.join("\n"));
    if (when === "schedule") f.set("scheduledAt", new Date(at).toISOString());
    if (imageFile) f.set("image", imageFile);
    if (imageFile || keptImage) f.set("altText", altText.trim());
    if (!imageFile && !keptImage && post?.image) f.set("removeImage", "true");
    return f;
  }

  async function submit(action: "draft" | When) {
    if (action === "now") {
      const ok = await confirm({
        title: data?.live ? "Publish to LinkedIn now?" : "Publish now (dry run)?",
        body: data?.live
          ? "This posts to your LinkedIn profile straight away. You can delete it on LinkedIn later, but people may already have seen it."
          : "Live posting is off, so nothing goes to LinkedIn. It will be recorded as a dry-run publish.",
        confirm: data?.live ? "Publish now" : "Publish (dry run)",
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const { item } = await api<{ item: QueueItem }>("/api/posts", { method: "POST", body: form(action === "now" ? "publish" : action) });
      setSavedText(item.text);
      setOriginal((o) => (result === null ? item.text : o));
      setImageFile(null);
      setKeptImage(!!item.image);
      if (approver.trim() && !data?.settings.approverName)
        api("/api/settings", { method: "PATCH", json: { approverName: approver.trim() } }).catch(() => {});
      await refresh();
      if (action === "draft") {
        toast("success", "Saved as a draft.");
        setPost(item);
        if (!editId) router.replace(`/compose?id=${item.id}`);
        return;
      }
      if (action === "now") {
        toast("success", item.mode === "live" ? "Published to LinkedIn." : "Published (dry run). Nothing went to LinkedIn.");
        router.push("/posts?status=posted");
      } else {
        toast("success", `${action === "queue" ? "Added to the queue" : "Scheduled"} for ${fmtWhen(item.scheduledAt)}.`);
        router.push("/queue");
      }
    } catch (e) {
      toast("error", (e as Error).message);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function draftWithClaude() {
    if (original.trim() && !(await confirm({ title: "Replace your text?", body: "Claude's draft will replace what's in the box.", confirm: "Replace" }))) return;
    setDrafting(true);
    setAiDraft(null);
    try {
      const d = await api<Draft & { model: string }>("/api/draft", {
        method: "POST",
        json: { idea, facts, trends: trends.map((t) => ({ keyword: t.keyword, hashtag: t.hashtag, why: t.why, angle: t.angle })) },
      });
      setAiDraft(d);
      if (d.draft && trends.length) setLinks((l) => l.trim() || [...new Set(trends.flatMap((t) => t.sources.map((s) => s.url)))].slice(0, 10).join("\n"));
      if (d.draft) {
        scrollNext.current = true;
        setOriginal(d.draft);
        setAiOpen(false);
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  const diff = useMemo(() => (result !== null && lastInput !== null ? wordDiff(lastInput, result) : []), [result, lastInput]);
  const changed = diff.some((p) => p.type !== "same");
  const addedWords = diff.filter((p) => p.type === "add").reduce((n, p) => n + words(p.text), 0);
  const removedWords = diff.filter((p) => p.type === "del").reduce((n, p) => n + words(p.text), 0);
  const originalChanged = result !== null && lastInput !== null && original !== lastInput;

  if (loadError)
    return (
      <div className="page">
        <PageHead title="Review" />
        <Callout kind="error">{loadError} <Link href="/posts">Back to posts</Link></Callout>
      </div>
    );

  // What to do next, in plain words, from where things stand right now.
  const blankCount = blanksIn(result ?? original).length;
  const staleMsg = originalChanged
    ? settings.mode === "rewrite"
      ? "You changed your content. Click “Rewrite again with Claude” to update the result."
      : !autoClean
        ? "You changed your content. Click “Run quick clean again” to update the result."
        : result !== autoRef.current
          ? "You edited the result by hand, so it wasn't replaced. Click “Run quick clean again” to redo it from your new content."
          : null
    : null;
  type Next = { tone: "info" | "warn" | "good"; head: string; text: string; goStep?: number };
  const next: Next | null = (() => {
    if (post && !editable) return null;
    if (!original.trim()) return { tone: "info", head: "Start here.", text: "Paste your post, or click “Write one with Claude” if you don't have a draft yet." };
    if (working) return { tone: "info", head: "Working…", text: "The humanizer is running. This page updates by itself when it's done." };
    if (result === null)
      return settings.mode === "rewrite"
        ? { tone: "info", head: "Next:", text: "click “Rewrite in my voice with Claude” below. It takes about a minute." }
        : autoClean
          ? { tone: "info", head: "Next:", text: "nothing to click. Quick clean is about to run by itself." }
          : { tone: "info", head: "Next:", text: "click “Quick clean now” below. You'll see what the humanizer did, then your result." };
    if (staleMsg) return { tone: "warn", head: "Heads up:", text: staleMsg };
    if (!fresh) return { tone: "info", head: "Checking…", text: "Re-scoring your latest edits." };
    if (blankCount > 0) return { tone: "warn", head: `Fill ${blankCount} blank${blankCount === 1 ? "" : "s"}.`, text: "Type the real facts in the orange box. You can't publish until they're filled.", goStep: 1 };
    if (gate!.compliance.length) return { tone: "warn", head: "Remove off-limits words.", text: `${gate!.compliance.map((h) => h.match).join(", ")} can't appear in a published post.`, goStep: 4 };
    if (gate!.after.verdict !== "PASS" && !acceptReview)
      return { tone: "warn", head: `Score is ${gate!.after.human_score.toFixed(0)} out of 100.`, text: "Click “Fix it for me”, edit the text yourself, or tick “publish anyway” on the publish step.", goStep: 4 };
    if (uniqueBlockers.length) return { tone: "info", head: "Almost there:", text: uniqueBlockers[0], goStep: 5 };
    return { tone: "good", head: "All set.", text: "Open the publish step, choose when to post, then approve.", goStep: 5 };
  })();

  const steps = [
    { label: "Enter content", done: !!original.trim() },
    { label: "Choose settings", done: !!original.trim() },
    { label: "Humanize", done: result !== null },
    { label: "Review", done: fresh && gate!.problems.length === 0 && (gate!.after.verdict === "PASS" || acceptReview) },
    { label: "Copy, save or publish", done: post?.status === "posted" },
  ];
  const current = step - 1;
  // A step can be opened once what it needs exists: text for step 3, a result for steps 4 and 5.
  const canGo = (i: number) => i <= 1 || (i === 2 ? !!original.trim() : result !== null);
  const primaryLabel = when === "now" ? (data?.live ? "Publish now" : "Publish now (dry run)") : when === "queue" ? "Add to queue" : "Schedule";
  const preview = expanded || postText.length <= PREVIEW_CHARS ? postText : postText.slice(0, PREVIEW_CHARS).trimEnd();

  return (
    <div className="page">
      <PageHead
        title={post ? "Review post" : "Review"}
        sub={
          <span className="row tight" style={{ display: "inline-flex", gap: 10 }}>
            {post ? <><StatusBadge post={post} />{post.scheduledAt && <span>{fmtWhen(post.scheduledAt)}</span>}</> : <span>Write or paste a post, make it sound like you, check it, then approve.</span>}
            {dirty && finalText.trim() && <span className="dirty-dot">Unsaved changes</span>}
          </span>
        }
      >
        {(post || finalText.trim()) && (
          <button className="secondary" onClick={() => (post ? router.push("/compose") : clearAll())}>
            <Icon name="plus" /> New
          </button>
        )}
      </PageHead>

      {post && !editable && (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="info">
            This post is {post.status === "posted" ? "already published" : "being published"}, so it can&apos;t be changed.{" "}
            <button className="small" style={{ marginLeft: 6 }} onClick={async () => {
              const { item } = await api<{ item: QueueItem }>(`/api/posts/${post.id}`, { method: "POST", json: { action: "duplicate" } });
              await refresh();
              router.push(`/compose?id=${item.id}`);
            }}>
              <Icon name="copy" size={13} /> Duplicate as a new draft
            </button>
          </Callout>
        </div>
      )}
      {post?.status === "failed" && post.error && <div style={{ marginBottom: 16 }}><Callout kind="error"><b>Last attempt failed:</b> {post.error}</Callout></div>}

      <div ref={wizardRef} style={{ scrollMarginTop: 12 }}>
        <StepBar steps={steps} current={current} onSelect={(i) => go(i + 1)} canGo={canGo} />
        {next && (
          <div className={`next-step ${next.tone}`} role="status">
            <Icon name={next.tone === "good" ? "check" : next.tone === "warn" ? "alert" : "info"} size={16} />
            <span><b>{next.head}</b> {next.text}</span>
            {next.goStep && next.goStep !== step && <button type="button" className="next-link" onClick={() => go(next.goStep!)}>Go there →</button>}
          </div>
        )}
      </div>

      <div className="stack">
        {/* ---------- 1 + 2: input and settings ---------- */}
        <div hidden={step !== 1}>
          <Section n={1} title="Your content" hint={<Counts text={original} max={MAX_CHARS} />}>
            <textarea
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              disabled={!editable || working}
              placeholder="Paste your AI-generated content here..."
              aria-label="Your content"
              style={{ minHeight: 260 }}
            />
            <div className="row">
              <button className="secondary small" onClick={pasteIn} disabled={!editable || working}><Icon name="copy" size={14} /> Paste</button>
              <button className="ghost small" onClick={clearAll} disabled={!original.trim() || working}><Icon name="trash" size={14} /> Clear</button>
              <span className="spacer" />
              <button className="ghost small" onClick={() => setAiOpen((v) => !v)} aria-expanded={aiOpen} disabled={!editable}>
                <Icon name="sparkle" size={14} /> No draft? Write one with Claude
              </button>
            </div>
            {aiOpen && (
              <div className="stack" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div>
                  <div className="row tight" style={{ justifyContent: "space-between" }}>
                    <b style={{ fontSize: 13 }}>Start from a topic <span className="meta" style={{ fontWeight: 400 }}>(optional)</span></b>
                    <Link href="/plan#trending" className="meta">{market ? `Researched ${fmtWhen(market.at)} · refresh` : "Find trending topics →"}</Link>
                  </div>
                  {allTopics.length ? (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {allTopics.map((k) => (
                        <button key={k.keyword} type="button" className={`chip ${trends.some((t) => t.keyword === k.keyword) ? "on" : ""}`} onClick={() => toggleTrend(k)} title={k.why} aria-pressed={trends.some((t) => t.keyword === k.keyword)} disabled={trends.length >= MAX_TRENDS && !trends.some((t) => t.keyword === k.keyword)}>
                          {k.keyword}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="meta" style={{ margin: "6px 0 0" }}>No research yet. Keywords → Find trending keywords.</p>
                  )}
                  {trends.length > 0 && (
                    <div className="callout info" style={{ marginTop: 8, display: "block" }}>
                      {trends.map((t) => (
                        <div key={t.keyword} style={{ marginBottom: 6 }}>
                          <b>{t.keyword}</b>{t.hashtag && <span className="meta"> · {t.hashtag}</span>}
                          <div className="meta" style={{ marginTop: 2 }}>{t.why}</div>
                          <div className="meta" style={{ marginTop: 2 }}>
                            {t.sources.length ? "Source: " : "From your profile."}{t.sources.map((s, i) => <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer noopener">{(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })()}</a></span>)}
                          </div>
                        </div>
                      ))}
                      <div className="meta">
                        {trends.length > 1 ? `${trends.length} topics: Claude writes one post around the idea that links them, and leaves out any that don't fit.` : "Claude ties it to your own experience"} It won&apos;t add news details or numbers. {trends.length < MAX_TRENDS && "Pick up to 4."}
                      </div>
                    </div>
                  )}
                </div>
                <label className="field">What do you want to post about?
                  <input type="text" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. how we took Lighthouse from 65 to 90+" />
                </label>
                <label className="field"><span>Facts Claude may use <span className="meta">(it won&apos;t invent any)</span></span>
                  <textarea style={{ minHeight: 70 }} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder={"Lighthouse 65 -> 90+\nPage load down 35-40%"} />
                </label>
                <div className="row tight">
                  <button onClick={draftWithClaude} disabled={drafting || !idea.trim()}>
                    {drafting ? <><Spinner /> Writing (up to a minute)…</> : <><Icon name="sparkle" /> Write the draft</>}
                  </button>
                </div>
                {aiDraft?.questions.length ? (
                  <Callout kind="warn">Claude needs more to write honestly. Add these to Facts and try again:
                    <ul className="list">{aiDraft.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                  </Callout>
                ) : null}
              </div>
            )}
            <BlanksCard text={original} onApply={setOriginal} disabled={!editable || working} />
          </Section>

          <StepNav
            onNext={() => go(2)}
            nextLabel="Continue"
            nextDisabled={!original.trim()}
            hint={!original.trim() ? "Add your text to continue" : blankCount > 0 ? `${blankCount} blank${blankCount === 1 ? "" : "s"} still to fill: you can do it now or after the humanizer` : undefined}
          />
        </div>

        <div hidden={step !== 2}>
          <Section n={2} title="How much to change">
            <SettingsCard value={settings} onChange={chooseSettings} onDefaultAudience={(a) => setSettings((s) => (s.audience ? s : { ...s, audience: a }))} disabled={working || !editable} />
          </Section>
          <StepNav onBack={() => go(1)} onNext={() => go(3)} nextLabel="Continue" />
        </div>

        {/* ---------- 3: humanize ---------- */}
        <div hidden={step !== 3}>
        <Section n={3} title="Humanize" hint={settings.mode === "rewrite" ? "Claude rewrites it · about a minute" : "Instant · free · runs on this computer"}>
          <div className="run-row">
            <button className="run-btn" onClick={() => humanize()} disabled={!original.trim() || working || !editable || original.length > MAX_CHARS * 2} aria-busy={working}>
              {working ? <Spinner /> : <Icon name="sparkle" size={16} />}{" "}
              {working
                ? (stage === "fixing" ? "Fixing the score…" : stage === "rewriting" ? "Rewriting in your voice…" : "Cleaning up…")
                : settings.mode === "rewrite"
                  ? (result !== null ? "Rewrite again with Claude" : "Rewrite in my voice with Claude")
                  : (result !== null ? "Run quick clean again" : "Quick clean now")}
            </button>
            {settings.mode === "clean" && (
              <label className="auto-toggle" title="Quick clean is instant and local, so it can start by itself. It never replaces text you edited by hand.">
                <input type="checkbox" checked={autoClean} disabled={working} onChange={(e) => { setAutoClean(e.target.checked); try { localStorage.setItem("ps-auto-clean", e.target.checked ? "1" : "0"); } catch {} }} />
                Run automatically after I paste or type
              </label>
            )}
          </div>
          {!working && (
            <p className="run-hint">
              {!original.trim()
                ? "Add your text in step 1, then click the button."
                : staleMsg
                  ? staleMsg
                  : result === null
                    ? settings.mode === "rewrite"
                      ? "Claude rewrites it for your audience using only your facts. It waits for your click and takes about a minute."
                      : autoClean ? "Quick clean starts by itself in a moment." : "Click to clean the text, score how human it sounds and run the safety check. The result appears below."
                    : "Done. Your result is below. Change anything above and click again to redo it."}
            </p>
          )}
          {(working || result !== null) && (
            <div ref={processRef} style={{ scrollMarginTop: 16, marginTop: 12 }}>
              <HumanizerProcess mode={settings.mode} stage={stage} elapsed={elapsed} fixRound={fixRound} gate={gate} hasText={!!original.trim()} hasResult={result !== null} />
            </div>
          )}
          {error && (
            <div style={{ marginTop: 12 }}>
              <Callout kind="error">
                <b>Humanizing failed.</b> {error}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="small" onClick={() => humanize()}><Icon name="refresh" size={14} /> Try again</button>
                  {settings.mode === "rewrite" && <button className="secondary small" onClick={() => humanize(original, "clean")}>Use Quick clean instead</button>}
                </div>
              </Callout>
            </div>
          )}
        </Section>
          <StepNav
            onBack={() => go(2)}
            onNext={result !== null && !working ? () => go(4) : undefined}
            nextLabel="See the result"
            hint={result === null && !working ? "Run the humanizer above to see your result" : undefined}
          />
        </div>

        {/* ---------- 4: review ---------- */}
        {result !== null && (
          <div ref={reviewRef} hidden={step !== 4} style={{ scrollMarginTop: 16 }}>
            <Section n={4} title="Review the result" hint={changed ? "Removed words are red on the left · new words are green on the right" : "Nothing needed changing"} accent>
              {gate && (
                <ScoreSummary
                  gate={gate}
                  action={gate.after.verdict !== "PASS" && editable && gate.problems.length === 0 ? (
                    <>
                      <button className="small" onClick={autoFix} disabled={working || checking} aria-busy={stage === "fixing"}>
                        {stage === "fixing" ? <><Spinner /> Fixing, round {fixRound} of 2…</> : <><Icon name="bolt" size={14} /> Fix it for me</>}
                      </button>
                      <span className="meta">Claude rewrites the weak spots using only your facts and voice.md, then re-scores. About 1-2 minutes.</span>
                    </>
                  ) : undefined}
                />
              )}

              {rewrite && (rewrite.changes.length > 0 || rewrite.skipped.length > 0) && (
                <details className="meta" style={{ marginTop: 10 }}>
                  <summary>What Claude changed</summary>
                  <ul className="list" style={{ marginTop: 6 }}>{rewrite.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                  {rewrite.keywords_used.length > 0 && <p style={{ margin: "6px 0 0" }}>Keywords used: {rewrite.keywords_used.join(", ")}</p>}
                  {rewrite.skipped.length > 0 && <p style={{ margin: "6px 0 0" }}>Skipped: {rewrite.skipped.join(" · ")}</p>}
                </details>
              )}

              <div className="change-bar">
                <div className="cchips">
                  <span className="cchip del">− {removedWords} word{removedWords === 1 ? "" : "s"} removed</span>
                  <span className="cchip add">+ {addedWords} word{addedWords === 1 ? "" : "s"} added</span>
                  <span className="cchip">{(lastInput ?? "").length.toLocaleString()} → {result.length.toLocaleString()} characters</span>
                </div>
                <div className="seg" role="radiogroup" aria-label="Layout">
                  <button className={paneLayout === "both" ? "on" : ""} aria-pressed={paneLayout === "both"} onClick={() => setPaneLayout("both")}>Side by side</button>
                  <button className={paneLayout === "result" ? "on" : ""} aria-pressed={paneLayout === "result"} onClick={() => setPaneLayout("result")}>Humanized only</button>
                </div>
              </div>
              <div className={`compare ${paneLayout === "result" ? "single" : ""}`} style={{ marginTop: 10 }}>
                {paneLayout === "both" && (
                <div>
                  <div className="pane-head"><b>Original</b><Counts text={lastInput ?? ""} /></div>
                  <div className="diff plain" aria-label="Original text, removed words highlighted">
                    {diff.map((p, i) => (p.type === "del" ? <del key={i}>{withBlanks(p.text)}</del> : p.type === "same" ? <span key={i}>{withBlanks(p.text)}</span> : null))}
                  </div>
                </div>
                )}
                <div>
                  <div className="pane-head">
                    <b>Humanized</b>
                    <span className="row tight" style={{ gap: 8 }}>
                      <Counts text={result} max={MAX_CHARS} />
                      <span className="seg" role="tablist" aria-label="Result view">
                        <button role="tab" aria-selected={view === "changes"} className={view === "changes" ? "on" : ""} onClick={() => setView("changes")}>Changes</button>
                        <button role="tab" aria-selected={view === "edit"} className={view === "edit" ? "on" : ""} onClick={() => setView("edit")} disabled={!editable}>Edit</button>
                      </span>
                    </span>
                  </div>
                  {view === "edit" ? (
                    <textarea value={result} onChange={(e) => setResult(e.target.value)} aria-label="Humanized text" autoFocus />
                  ) : (
                    <div className="diff" aria-label="Humanized text with changes highlighted" onDoubleClick={() => editable && setView("edit")} title={editable ? "Double-click to edit" : undefined}>
                      {diff.map((p, i) => (p.type === "add" ? <ins key={i}>{withBlanks(p.text)}</ins> : p.type === "same" ? <span key={i}>{withBlanks(p.text)}</span> : null))}
                    </div>
                  )}
                  {checking && <p className="meta row tight" style={{ marginTop: 6 }}><Spinner /> Re-checking your edits…</p>}
                </div>
              </div>

              {/* The blanks box lives under "Your content". It only shows here if the result has a blank the original didn't (e.g. after a hand edit). */}
              {blanksIn(result).some((b) => !blanksIn(original).includes(b)) && <BlanksCard text={result} onApply={setResult} disabled={!editable} />}

              <PunchlineCard text={result} audience={settings.audience} disabled={!editable || working} onUse={(t) => { setResult(t); setView("changes"); }} />

              {gate && (
                <details style={{ marginTop: 12 }}>
                  <summary className="meta">See the full score</summary>
                  <div style={{ marginTop: 8 }}><GateReport gate={gate} /></div>
                </details>
              )}

              <div className="actions-bar">
                <button onClick={copyResult} disabled={!result.trim()}><Icon name="copy" /> Copy result</button>
                <button className="secondary" onClick={() => humanize()} disabled={working || !original.trim() || !editable}>
                  <Icon name="refresh" /> {settings.mode === "rewrite" ? "Regenerate" : "Humanize again"}
                </button>
                <button className="secondary" onClick={() => submit("draft")} disabled={!editable || !result.trim() || busy !== null}>
                  {busy === "draft" ? <Spinner /> : <Icon name="check" />} Save draft
                </button>
                <span className="spacer" />
                <button className="ghost" onClick={clearAll}><Icon name="trash" /> Clear</button>
              </div>
            </Section>
            <StepNav onBack={() => go(3)} onNext={() => go(5)} nextLabel="Continue to publish" nextDisabled={!result.trim()} />
          </div>
        )}

        {/* ---------- 5: publish ---------- */}
        {result !== null && (
          <div hidden={step !== 5}>
          <section className="grid" id="publish" style={{ alignItems: "start", scrollMarginTop: 16 }}>
            <div className="card">
              <div className="card-head"><h2><span className="step-n">5</span>Preview</h2><span className="hint">How it looks on LinkedIn</span></div>
              <div className="preview">
                <div className="preview-head">
                  {data?.account?.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar" src={data.account.picture} alt="" />
                  ) : <span className="avatar">{(data?.account?.name ?? "You").slice(0, 1)}</span>}
                  <div>
                    <b style={{ fontSize: 14 }}>{data?.account?.name ?? "You"}</b>
                    <div className="meta" style={{ fontSize: 12 }}>{when === "now" ? "Now" : when === "queue" ? fmtWhen(data?.nextSlot) : fmtWhen(new Date(at).toISOString())} · 🌐</div>
                  </div>
                </div>
                <div className="preview-body">
                  {preview}
                  {!expanded && postText.length > PREVIEW_CHARS && <>… <button className="more" onClick={() => setExpanded(true)}>see more</button></>}
                </div>
                {(imagePreview || keptImage) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview ?? `/api/posts/${post?.id}/image`} alt={altText} />
                )}
                <div className="preview-foot"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
              </div>
              <p className="meta" style={{ marginBottom: 0 }}>Only the first two or three lines show before &quot;see more&quot;.</p>
            </div>

            <div className="card">
              <div className="card-head"><h2>Publish</h2><span className={`mode ${data?.live ? "live" : ""}`}>{data?.live ? "Live" : "Dry run"}</span></div>

              <div className="options" role="radiogroup" aria-label="When to publish">
                {([
                  ["queue", "Add to queue", data?.nextSlot ? `Next free slot: ${fmtWhen(data.nextSlot)}` : "No slots set. Add them in Settings."],
                  ["schedule", "Schedule", "Pick a date and time"],
                  ["now", "Publish now", data?.live ? "Posts to LinkedIn immediately" : "Dry run: recorded, not posted"],
                ] as const).map(([v, title, sub]) => (
                  <label key={v} className={`option ${when === v ? "on" : ""}`}>
                    <input type="radio" name="when" checked={when === v} onChange={() => setWhen(v)} />
                    <div><b>{title}</b><span>{sub}</span></div>
                  </label>
                ))}
              </div>
              {when === "schedule" && <input type="datetime-local" value={at} min={localInput(new Date())} onChange={(e) => setAt(e.target.value)} style={{ marginTop: 10 }} aria-label="Publish at" />}

              <div style={{ marginTop: 12 }}>
                {imageFile || keptImage ? (
                  <div className="row tight" style={{ alignItems: "flex-start" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb" src={imagePreview ?? `/api/posts/${post?.id}/image`} alt={altText || "Attached image"} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input type="text" placeholder="Describe the image (required)" value={altText} onChange={(e) => setAltText(e.target.value)} disabled={!editable} />
                      <button className="ghost small" style={{ marginTop: 4 }} onClick={() => { setImageFile(null); setKeptImage(false); setAltText(""); }} disabled={!editable}><Icon name="trash" size={13} /> Remove image</button>
                      <button className="ghost small" style={{ marginTop: 4 }} onClick={() => setMakingImage(true)} disabled={!editable || !postText.trim()}><Icon name="sparkle" size={13} /> Create a new image</button>
                    </div>
                  </div>
                ) : (
                  <div className="row tight" style={{ gap: 8 }}>
                  <button className="small" onClick={() => setMakingImage(true)} disabled={!editable || !postText.trim()} title={!postText.trim() ? "Write the post first" : "Claude turns your post into a diagram image"}>
                    <Icon name="sparkle" size={14} /> Create image
                  </button>
                  <label className="btn secondary small" style={{ cursor: editable ? "pointer" : "not-allowed" }}>
                    <Icon name="image" size={14} /> Upload image <span className="meta" style={{ fontWeight: 400 }}>(optional)</span>
                    <input type="file" accept="image/png,image/jpeg,image/gif" hidden disabled={!editable} onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 8 * 1024 * 1024) return toast("error", "Image must be under 8 MB.");
                      setImageFile(f);
                    }} />
                  </label>
                  </div>
                )}
                {makingImage && (
                  <ImageMaker
                    text={postText}
                    author={data?.account?.name ?? ""}
                    onClose={() => setMakingImage(false)}
                    onAttach={(f, alt) => { setImageFile(f); setKeptImage(false); setAltText(alt); toast("success", "Image attached. Save or publish to keep it."); }}
                  />
                )}
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <span>Reference links <span className="meta" style={{ fontWeight: 400 }}>(optional, one per line)</span></span>
                <textarea style={{ minHeight: 64, fontSize: 13 }} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" disabled={!editable} aria-label="Reference links" />
                {urls.length > 0 && (
                  <>
                    <div className="seg" role="radiogroup" aria-label="Where links go">
                      <button type="button" className={placement === "comment" ? "on" : ""} onClick={() => setPlacement("comment")} aria-pressed={placement === "comment"}>In a first comment</button>
                      <button type="button" className={placement === "post" ? "on" : ""} onClick={() => setPlacement("post")} aria-pressed={placement === "post"}>In the post</button>
                    </div>
                    {placement === "comment" ? (
                      <div className="callout info" style={{ display: "block" }}>
                        <div className="row tight" style={{ justifyContent: "space-between" }}>
                          <b style={{ fontSize: 13 }}>First comment (add it yourself right after posting)</b>
                          <button type="button" className="secondary small" onClick={() => navigator.clipboard.writeText(firstComment).then(() => toast("success", "First comment copied."), () => toast("error", "Couldn't copy."))}>
                            <Icon name="copy" size={13} /> Copy
                          </button>
                        </div>
                        <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "inherit" }}>{firstComment}</pre>
                      </div>
                    ) : (
                      <p className="meta" style={{ margin: 0 }}>Added as &quot;Sources:&quot; above your hashtags. The li-post skill says posts with links get shown to fewer people; I can&apos;t confirm how LinkedIn ranks them today.</p>
                    )}
                  </>
                )}
                {urls.length < links.split(/\s+/).filter(Boolean).length && <span className="warning" style={{ fontSize: 12.5 }}>Only full links starting with https:// are used.</span>}
              </div>

              {fresh && gate!.claims.length > 0 && (
                <div className="callout info" style={{ display: "block", marginTop: 12 }}>
                  <b style={{ fontSize: 13 }}>Fact check: numbers in this post</b>
                  <p className="meta" style={{ margin: "4px 0 8px" }}>
                    Claude and the humanizer can&apos;t tell if a number is true. Numbers that match your own profile are marked. For the rest, you confirm each one is true, or remove it.
                  </p>
                  <ul className="list" style={{ margin: 0 }}>
                    {gate!.claims.map((c) => (
                      <li key={c.id} style={{ listStyle: "none", marginBottom: 6 }}>
                        {c.supported ? (
                          <span className="meta"><Icon name="check" size={13} /> <b>{c.id}</b> matches your profile: “{c.evidence}”</span>
                        ) : (
                          <label className="row meta" style={{ alignItems: "flex-start" }}>
                            <input type="checkbox" checked={confirmed.includes(c.id)} onChange={(e) => setConfirmed((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))} />
                            <span><b>{c.id}</b> is not in your profile. Not sure? Check it. “{c.text}”. I confirm this is true.</span>
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="field" style={{ marginTop: 12 }}>
                Approved by
                <input type="text" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Your name" />
              </label>
              {fresh && gate!.after.verdict !== "PASS" && gate!.problems.length === 0 && (
                <label className="row meta" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={acceptReview} onChange={(e) => setAcceptReview(e.target.checked)} />
                  I read it and want to publish anyway (score {gate!.after.human_score.toFixed(0)})
                </label>
              )}

              <button className="hero" style={{ marginTop: 14 }} onClick={() => submit(when)} disabled={!editable || uniqueBlockers.length > 0 || busy !== null}>
                {busy === when ? <Spinner /> : <Icon name={when === "now" ? "send" : when === "queue" ? "queue" : "calendar"} />} {primaryLabel}
              </button>
              {editable && uniqueBlockers.length > 0 && (
                <ul className="list meta" style={{ marginTop: 10 }}>{uniqueBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
              )}
              {!data?.live && <p className="meta" style={{ marginBottom: 0 }}>Test mode: approved posts are recorded but not sent to LinkedIn.</p>}
            </div>
          </section>
          <StepNav onBack={() => go(4)} hint="Back to change the text or the result" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Put "Sources:" + links above a closing hashtag line, or at the end if there isn't one. */
function withLinks(text: string, urls: string[]): string {
  const block = `Sources:\n${urls.map((u) => `- ${u}`).join("\n")}`;
  const m = text.match(/\n+((?:#[\w-]+[ \t]*)+)\s*$/);
  if (!m || m.index === undefined) return `${text.trimEnd()}\n\n${block}`;
  return `${text.slice(0, m.index).trimEnd()}\n\n${block}\n\n${m[1].trim()}`;
}

/** Remove a "Sources:" block that withLinks added, keeping the hashtag line. */
function stripLinks(text: string): { text: string; found: boolean } {
  const m = text.match(/\n+Sources:\n(?:- \S+\n?)+/);
  if (!m || m.index === undefined) return { text, found: false };
  return { text: (text.slice(0, m.index).trimEnd() + "\n\n" + text.slice(m.index + m[0].length).trim()).trim(), found: true };
}
