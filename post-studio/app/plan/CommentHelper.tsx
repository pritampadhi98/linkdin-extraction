"use client";

import { useState } from "react";
import { api, useToast } from "../components/providers";
import { Callout, Icon, Spinner } from "../components/ui";

type Option = { type: string; comment: string; why: string };
type Group = "reach" | "peers" | "buyers";
const GROUP_LABEL: Record<Group, string> = { reach: "Reach", peers: "Peer", buyers: "Hiring / buyer" };

/** Only LinkedIn links: the button opens this in a new tab. */
function linkedInUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./, "");
    return u.protocol === "https:" && (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Paste someone's post, get two comment drafts in your voice. You edit and post by hand. */
export default function CommentHelper() {
  const toast = useToast();
  const [post, setPost] = useState("");
  const [author, setAuthor] = useState("");
  const [link, setLink] = useState("");
  const url = linkedInUrl(link);
  const badLink = link.trim() !== "" && !url;
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ options: Option[]; pick: number; missing: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setOut(null);
    setCopied(null);
    try {
      setOut(await api("/api/comment", { method: "POST", json: { post, author } }));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function count(group: Group) {
    try {
      const s = await api<{ counts: Record<Group, number>; goal: number }>("/api/engage", { method: "POST", json: { group, delta: 1 } });
      const done = s.counts.reach + s.counts.peers + s.counts.buyers;
      toast("success", s.goal ? `Counted. ${done} of ${s.goal} comments today.` : `Counted. ${done} comments today.`);
      setCopied(null);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  return (
    <div className="stack">
      <label className="field">
        Their post
        <textarea style={{ minHeight: 110 }} value={post} onChange={(e) => setPost(e.target.value)} placeholder="Paste the LinkedIn post you want to comment on" disabled={busy} />
      </label>
      <div className="grid">
        <label className="field">
          <span>Post link <span className="meta">(optional, so you can jump back to it)</span></span>
          <span className="row tight" style={{ marginTop: 0, flexWrap: "nowrap" }}>
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.linkedin.com/feed/update/…" disabled={busy} style={{ flex: 1 }} />
            {url && <a className="btn secondary small" href={url} target="_blank" rel="noreferrer noopener" title="Open this post on LinkedIn"><Icon name="link" size={13} /> Open</a>}
          </span>
          <span className={`field-help ${badLink ? "warning" : ""}`}>
            {badLink ? "That isn't a LinkedIn link. On the post, click ··· then Copy link to post." : "On LinkedIn, click ··· on the post, then Copy link to post, and paste it here."}
          </span>
        </label>
        <label className="field">
          <span>Author <span className="meta">(optional, e.g. &quot;Akshay Saini, educator&quot;)</span></span>
          <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} disabled={busy} maxLength={120} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 0 }}>
        <button onClick={run} disabled={busy || post.trim().length < 20}>
          {busy ? <><Spinner /> Drafting…</> : <><Icon name="sparkle" size={14} /> Draft comments</>}
        </button>
      </div>
      <p className="meta" style={{ margin: 0 }}>Claude uses only your proof list and their post. You edit and post it yourself; Post Studio never comments for you.</p>

      {out && (
        <div className="stack">
          {out.options.map((o, i) => (
            <div key={i} className={`comment-opt ${i === out.pick ? "picked" : ""}`}>
              <div className="row tight" style={{ marginTop: 0, justifyContent: "space-between" }}>
                <span className="row tight" style={{ marginTop: 0 }}>
                  <span className="tag">{o.type}</span>
                  {i === out.pick && <span className="badge b-posted plain">Recommended</span>}
                </span>
                <span className="row tight" style={{ marginTop: 0 }}>
                  <button className="secondary small" onClick={() => navigator.clipboard.writeText(o.comment).then(() => { setCopied(i); toast("success", "Copied. Paste it under their post on LinkedIn."); }, () => toast("error", "Couldn't copy."))}>
                    <Icon name="copy" size={13} /> Copy
                  </button>
                  {url && (
                    <button className="small" title="Copies this comment and opens the post on LinkedIn. Then click Comment, paste and Post."
                      onClick={() => {
                        // Open first, inside the click, so the browser doesn't block the new tab.
                        window.open(url, "_blank", "noopener,noreferrer");
                        navigator.clipboard.writeText(o.comment).then(
                          () => { setCopied(i); toast("success", "Copied and opened. On LinkedIn: click Comment, paste (Cmd+V), then Post."); },
                          () => toast("error", "Opened the post, but couldn't copy. Use Copy, then paste on LinkedIn."),
                        );
                      }}>
                      <Icon name="link" size={13} /> Copy &amp; open post
                    </button>
                  )}
                </span>
              </div>
              <textarea className="comment-text" value={o.comment} onChange={(e) => setOut({ ...out, options: out.options.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)) })} aria-label={`Comment option ${i + 1}`} />
              <p className="meta" style={{ margin: 0 }}>{o.why}</p>
              {copied === i && (
                <div className="row tight">
                  <span className="meta">Posted it? Count it for today:</span>
                  {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
                    <button key={g} className="secondary small" onClick={() => count(g)}>{GROUP_LABEL[g]}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {out.missing && <Callout kind="info">Stronger with: {out.missing}</Callout>}
        </div>
      )}
    </div>
  );
}
