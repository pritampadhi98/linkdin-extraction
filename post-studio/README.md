# Post Studio

AI-drafted LinkedIn posts with a governance gate.
Claude drafts → humanizer cleans → score + compliance check → a person approves → (optionally) publish via LinkedIn's official API.

Built on the open-source [LinkedIn agent skill pack](https://github.com/Jakeschincariol/linkedin-agent-skill) by Jake Schincariol (MIT).
Post Studio adds the compliance check, the approval flow and log, and the UI.

---

## Quick start (5 steps)

### 1. Check the prerequisites

| Need | Check with | Install |
|---|---|---|
| Node.js 20+ | `node -v` | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| Python 3 (for the humanizer) | `python3 --version` | `brew install python` |
| LinkedIn skills | `ls skills` | already bundled in `post-studio/skills/` (your `~/.claude/skills` copy wins if present) |
| `rsvg-convert` (for Create image) | `which rsvg-convert` | `brew install librsvg` |
| Claude: an API key **or** the Claude Code CLI | `which claude` | see step 3 |

### 2. Install

```bash
cd ~/Desktop/linkdinScrapper/post-studio
```

```bash
npm install
```

### 3. Create `.env.local`

Create a file called `.env.local` in the project folder. It is gitignored; never commit or share it.

```bash
touch .env.local && chmod 600 .env.local
```

Open it in an editor and fill in what you need:

```ini
# LinkedIn app credentials (see "Connect LinkedIn" below)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Claude: set a key to use the Anthropic API.
# Leave it empty to use your local `claude` CLI (signed in with your Claude account) instead.
ANTHROPIC_API_KEY=

# LinkedIn API version, YYYYMM. Use a version LinkedIn's docs list as supported.
LI_VERSION=

# 0 = dry run (nothing is posted). 1 = really post to LinkedIn.
POST_STUDIO_LIVE=0
```

Start with `POST_STUDIO_LIVE=0` until you've tested a post end to end.

### 4. Run the app

```bash
npm run dev
```

Open **http://localhost:3009**. The Overview page shows a setup checklist of what's still missing.

> **Port 3009 already in use (`EADDRINUSE`)?** Another copy is running. Find it and stop it:
>
> ```bash
> lsof -nP -iTCP:3009 -sTCP:LISTEN
> ```
>
> ```bash
> kill <PID>
> ```

### 5. Run the queue worker (only for scheduled posts)

In a **second terminal**, in the same folder:

```bash
npm run worker
```

Leave it running. It checks every 60 seconds and publishes posts that are due. It reads `.env.local` itself.
Use `npm run worker -- --once` to check once and exit.

---

## Connect LinkedIn (step by step)

You need this to publish. Drafting, checking and analytics work without it.

### A. Create the LinkedIn app (one time, free)

1. Go to **[developer.linkedin.com](https://developer.linkedin.com) → My apps → Create app**.
   The app must be linked to a LinkedIn Company Page. Ask before using your company's page; a test page works.
2. **Products** tab: request
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**
3. **Auth** tab → **Authorized redirect URLs for your app** → add exactly:

   ```text
   http://localhost:3009/api/linkedin/callback
   ```

4. **Auth** tab → **Application credentials**: copy the **Client ID** and **Client Secret** into
   `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in `.env.local`.

   Prefer the macOS Keychain? Post Studio also reads these (each command prompts for the value):

   ```bash
   security add-generic-password -a "$USER" -s linkedin-client-id -w
   ```

   ```bash
   security add-generic-password -a "$USER" -s linkedin-client-secret -w
   ```

### B. Connect

1. Restart the app (`Ctrl+C`, then `npm run dev`) so it picks up the new values.
2. Open **Settings** (or the Overview checklist) and click **Connect LinkedIn**.
3. Sign in on LinkedIn's own page and click **Allow**. You're sent back to Post Studio.
4. Settings now shows your name and the permissions LinkedIn granted. You need
   **`w_member_social`** to post. If it's missing, check that **Share on LinkedIn** is approved on your app.

The token is saved in `data/linkedin.json` (permissions 600, gitignored). It stays on the server and is
never sent to the browser.

### C. Turn on live posting

1. In `.env.local` set `POST_STUDIO_LIVE=1` and a supported `LI_VERSION`.
2. Restart `npm run dev` **and** `npm run worker`.
3. Settings shows **Live**. Until then every publish is a dry run, logged but not posted.

### Things to know

- Tokens last about 60 days. When one expires, click **Connect LinkedIn** again.
- Requested permissions are `openid profile w_member_social`. Override with `LINKEDIN_SCOPES`
  (e.g. `openid profile` to test sign-in alone).
- A different port or host? Set `LINKEDIN_REDIRECT_URI` and add the same URL in the app's Auth tab.
- `w_member_social` lets Post Studio **post**, not **read analytics**. Impressions and reactions are added by hand
  (see Analytics below). Reading them through the API needs `r_member_postAnalytics`, which LinkedIn only grants
  to approved Community Management API apps.
- LinkedIn's product names, scopes and versions can change. If a step doesn't match, check the developer portal.

---

## Everyday use

1. **Publish → write** your post, or **Write with Claude** from an idea and the facts it may use.
2. The **check** runs automatically: humanizer, human score, off-limits terms, placeholders, length.
3. Optional: **Improve**, pick a **punch line**, **✨ Create image**, add reference links.
4. Enter your approver name, then **Add to queue**, **Schedule**, **Publish now** or **Save draft**.
5. After it's live, open **Posts → Published → Performance** and click **+ Add reading** with a screenshot of
   the post's numbers. Do this at about 1h, 3h, 6h, 12h, 24h, 48h, 72h and 7 days; the app reminds you.

---

## Claude

Every Claude call goes through one of two backends:

| Backend | When it's used | Needs |
|---|---|---|
| `api` | `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) is set | a key from console.anthropic.com |
| `claude-code` | no key is set | the `claude` CLI installed and signed in |

Force one with `POST_STUDIO_LLM=api` or `POST_STUDIO_LLM=claude-code`.
The default model is `claude-opus-5-5`; override with `DRAFT_MODEL`.

Drafting uses the li-post skill (from `~/.claude/skills/li-post`, or the bundled `post-studio/skills/li-post`) and your voice profile (`~/.claude/linkedin/voice.md`).
It never invents facts: anything it can't fill becomes a `{{placeholder}}`, and a thin idea gets questions back
instead of a draft.

---

## The gate (runs server-side on every check and again before publishing)

| Step | Blocks Approve? |
|---|---|
| Humanizer (`humanize.py`) strips em dashes, curly quotes, invisible chars, stock phrases | no, shows a diff |
| Score (`detect.py`), five checks | REVIEW/FLAGGED needs an explicit "approve anyway" |
| Compliance: any term in `off-limits.txt` | **yes** |
| Unfilled `{{placeholders}}` | **yes** |
| Over 3,000 characters | **yes** |
| Approver name missing | **yes** |

Edit `off-limits.txt` with real client names, internal metrics and NDA terms. One per line; `/regex/` supported.
The worker re-checks this list right before posting, so a term added after approval still blocks the post.

---

## App sections

| Page | What it's for |
|---|---|
| **Overview** | Setup checklist, next scheduled post, key numbers, readings due |
| **Publish** | Write or draft with Claude, quality check, image maker, LinkedIn-style preview, approve |
| **Posts** | Every post by status. Search, edit, duplicate, delete, open Performance |
| **Performance** (per post) | Readings timeline with screenshots, impressions and engagement charts, hour by hour / day by day |
| **Queue** | Upcoming posts in order. Drag (or ↑/↓) to reorder. Pause/resume |
| **Analytics** | Publishing activity, engagement trend, top posts, **Compare posts** |
| **Keywords** | Words and hashtags from your posts with frequency, trend and engagement |
| **Profile growth** | Score your profile PDF, get rewrites and a week of posts |
| **Settings** | LinkedIn connection, approver, posting slots, hashtag count, link placement, off-limits list, approval log |

**Analytics data is real, never estimated.** Numbers come only from readings you enter.

---

## Data files (all gitignored, under `data/`)

| File | Holds |
|---|---|
| `linkedin.json` | LinkedIn token and granted scopes (600) |
| `queue.json` | All posts, their readings and metrics |
| `images/`, `shots/` | Post images and reading screenshots |
| `settings.json` | Slots, pause, approver, hashtag count, link placement |
| `approvals.jsonl` | Approval log |
| `worker.json` | Worker heartbeat, so the UI knows whether `npm run worker` is running |

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | Keychain fallback | LinkedIn app credentials |
| `LINKEDIN_REDIRECT_URI` | `http://localhost:3009/api/linkedin/callback` | OAuth callback |
| `LINKEDIN_SCOPES` | `openid profile w_member_social` | Permissions requested |
| `LI_VERSION` | none | `LinkedIn-Version` header (YYYYMM), required for live posting |
| `POST_STUDIO_LIVE` | off | `1` = really post |
| `ANTHROPIC_API_KEY` | none | Use the Anthropic API |
| `POST_STUDIO_LLM` | auto | `api` or `claude-code` |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code CLI |
| `DRAFT_MODEL` | `claude-opus-5-5` | Model for all Claude calls |
| `SKILLS_DIR` | `~/.claude/skills`, else bundled `post-studio/skills` | Where the skills live (checked per skill) |
| `LI_HUMAN_DIR` / `LI_POST_DIR` | inside `SKILLS_DIR` | Override one skill's folder |
| `VOICE_FILE` | `~/.claude/linkedin/voice.md` | Your voice profile |
| `OFF_LIMITS_FILE` | `off-limits.txt` | Compliance term list |
| `RSVG_CONVERT` | Homebrew paths | Path to `rsvg-convert` |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE :3009` | Another copy is running. See step 4. |
| Connect sends you back with "missing app" | Client ID/Secret not found. Check `.env.local` and restart. |
| LinkedIn says the redirect URI doesn't match | The URL in the app's Auth tab must be exactly `http://localhost:3009/api/linkedin/callback`. |
| `unauthorized_scope_error` | The **Share on LinkedIn** product isn't approved on your app yet. |
| Posts say "dry run" | Set `POST_STUDIO_LIVE=1` and `LI_VERSION`, then restart both dev and worker. |
| Scheduled post didn't go out | The worker wasn't running, or the Mac was asleep at posting time. |
| Create image fails | `brew install librsvg` |
| Claude calls fail | Set `ANTHROPIC_API_KEY`, or install and sign in to the `claude` CLI. |
| Token expired | Click **Connect LinkedIn** again (about every 60 days). |

---

## Known gaps

- Single approver. Next: drafter + reviewer roles.
- No auth. Run locally only.
- No automatic analytics: readings are entered by hand.
- Don't run `npm run build` while `npm run dev` is running; they share `.next/`.
