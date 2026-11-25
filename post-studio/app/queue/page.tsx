"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { QueueItem } from "@/lib/queue";
import Calendar from "./Calendar";
import PostRow from "../components/PostRow";
import { usePostActions } from "../components/postActions";
import { api, useConfirm, useStudio, useToast, workerRunning } from "../components/providers";
import { Callout, EmptyState, Icon, PageHead, Skeleton, Spinner, firstLine, fmtRelative, fmtWhen } from "../components/ui";

export default function QueuePage() {
  const { data, refresh } = useStudio();
  const actions = usePostActions();
  const toast = useToast();
  const confirm = useConfirm();
  const [order, setOrder] = useState<string[] | null>(null); // optimistic order while saving
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  useEffect(() => {
    try {
      const v = localStorage.getItem("ps.scheduleView");
      if (v === "list" || v === "calendar") setView(v);
    } catch {}
  }, []);
  const pickView = (v: "calendar" | "list") => {
    setView(v);
    try { localStorage.setItem("ps.scheduleView", v); } catch {}
  };

  const queued = useMemo(
    () => (data?.items ?? []).filter((x) => x.status === "queued").sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!)),
    [data],
  );
  useEffect(() => setOrder(null), [data]);

  const ids = order ?? queued.map((q) => q.id);
  const byId = new Map(queued.map((q) => [q.id, q]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean) as QueueItem[];
  const times = queued.map((q) => q.scheduledAt!); // slot times stay put; posts move between them
  const failed = (data?.items ?? []).filter((x) => x.status === "failed");
  const paused = data?.settings.queuePaused ?? false;
  const running = workerRunning(data?.workerAt ?? null);

  async function save(next: string[]) {
    if (next.join() === queued.map((q) => q.id).join()) return;
    setOrder(next);
    setSaving(true);
    try {
      await api("/api/posts/reorder", { method: "POST", json: { ids: next } });
      toast("success", "Queue reordered. Each post took the time slot of its new position.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      await refresh();
      setSaving(false);
    }
  }

  function move(id: string, delta: number) {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = ids.filter((x) => x !== dragId);
    next.splice(next.indexOf(targetId) + (ids.indexOf(dragId) < ids.indexOf(targetId) ? 1 : 0), 0, dragId);
    save(next);
  }

  async function togglePause() {
    if (!paused && !(await confirm({ title: "Pause the queue?", body: "Nothing will publish automatically until you resume. You can still publish a post by hand.", confirm: "Pause" }))) return;
    setPausing(true);
    try {
      await api("/api/settings", { method: "PATCH", json: { queuePaused: !paused } });
      toast("success", paused ? "Queue resumed. Overdue posts will go out on the worker's next check." : "Queue paused.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      await refresh();
      setPausing(false);
    }
  }

  const next = rows[0];

  return (
    <div className="page">
      <PageHead title="Schedule" sub="Your posting calendar: what's planned, what's going out, and what's published.">
        <div className="seg" role="radiogroup" aria-label="View">
          <button className={view === "calendar" ? "on" : ""} aria-pressed={view === "calendar"} onClick={() => pickView("calendar")}><Icon name="calendar" size={14} /> Calendar</button>
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => pickView("list")}><Icon name="list" size={14} /> Queue list</button>
        </div>
        <button className="secondary" onClick={togglePause} disabled={!data || pausing}>
          {pausing ? <Spinner /> : <Icon name={paused ? "play" : "pause"} />} {paused ? "Resume queue" : "Pause queue"}
        </button>
        <Link href="/compose" className="btn"><Icon name="plus" /> Add post</Link>
      </PageHead>

      <div className="stack">
        {paused && <Callout kind="warn"><b>The queue is paused.</b> Nothing publishes automatically until you resume it.</Callout>}
        {data && !running && queued.length > 0 && (
          <Callout kind="warn">
            <b>The scheduler isn&apos;t running</b>, so scheduled posts won&apos;t go out yet.
          </Callout>
        )}

        {view === "calendar" ? (
          data ? <Calendar items={data.items} settings={data.settings} /> : <Skeleton h={420} />
        ) : (
          <>
        {!data ? (
          <Skeleton h={120} />
        ) : next ? (
          <div className="card" style={{ borderColor: "var(--accent)" }}>
            <div className="row tight">
              <span className="badge b-queued plain"><Icon name="clock" size={12} /> Next up</span>
              <b>{fmtWhen(next.scheduledAt)}</b>
              <span className="meta">({fmtRelative(next.scheduledAt!)})</span>
            </div>
            <p style={{ margin: "10px 0 0" }} className="clamp-2">{firstLine(next.text)}</p>
          </div>
        ) : null}

        <div className="card">
          <div className="card-head">
            <h2>Up next {queued.length > 0 && <span className="meta">({queued.length})</span>}</h2>
            <span className="hint">{saving ? <span className="row tight"><Spinner /> Saving order…</span> : queued.length > 1 ? "Drag to reorder. Posts swap time slots." : null}</span>
          </div>
          {!data ? (
            <div className="items"><Skeleton /><Skeleton /></div>
          ) : rows.length === 0 ? (
            <EmptyState icon="queue" title="The queue is empty" action={<Link href="/compose" className="btn"><Icon name="plus" /> Write a post</Link>}>
              Add a post to the queue and it goes out at your next free slot{data.nextSlot ? ` (${fmtWhen(data.nextSlot)})` : ""}.
            </EmptyState>
          ) : (
            <div className="items">
              {rows.map((p, i) => (
                <div
                  key={p.id}
                  draggable={!saving}
                  onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(p.id); }}
                  onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); drop(p.id); setOverId(null); }}
                  className={dragId === p.id ? "dragging" : ""}
                  style={{ borderRadius: 10, outline: overId === p.id && dragId !== p.id ? "2px solid var(--accent)" : "none" }}
                >
                  <PostRow
                    post={{ ...p, scheduledAt: times[i] ?? p.scheduledAt }}
                    actions={actions}
                    lead={
                      <span className="row tight lead" style={{ gap: 2, flexDirection: "column" }}>
                        <span className="handle" title="Drag to reorder" aria-hidden="true"><Icon name="grip" /></span>
                        <span style={{ display: "flex", gap: 0 }}>
                          <button className="ghost icon" aria-label="Move up" title="Move up" disabled={i === 0 || saving} onClick={() => move(p.id, -1)}><Icon name="up" size={13} /></button>
                          <button className="ghost icon" aria-label="Move down" title="Move down" disabled={i === rows.length - 1 || saving} onClick={() => move(p.id, 1)}><Icon name="down" size={13} /></button>
                        </span>
                      </span>
                    }
                    extra={p.image ? <span className="tag">image</span> : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

          </>
        )}

        {failed.length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Failed <span className="meta">({failed.length})</span></h2><span className="hint">Fix and retry, or move back to drafts</span></div>
            <div className="items">{failed.map((p) => <PostRow key={p.id} post={p} actions={actions} />)}</div>
          </div>
        )}

      </div>
    </div>
  );
}
