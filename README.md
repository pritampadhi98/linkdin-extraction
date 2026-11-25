# linkdin-extraction · Post Studio

AI-drafted LinkedIn posts with a human approval gate.

**Idea → Claude draft → Humanizer → Score + compliance gate → Human approval → Queue → LinkedIn → Performance tracking**

## What's in this repository

| Folder | What it is |
|---|---|
| [`post-studio/`](post-studio/) | **The main app** (Next.js 15, React 19, TypeScript). UI, API routes, core library and the queue worker. Full guide: [post-studio/README.md](post-studio/README.md) |
| [`bin/li-publish`](bin/li-publish) | The first prototype: a terminal script that humanizes a draft, scores it, asks y/N and posts through LinkedIn's Posts API |
| [`docs/submission-upload/`](docs/submission-upload/) | The hackathon materials: demo video, presentation and one-pager |
| [`drafts/`](drafts/) | Early drafts and their humanized `.clean.txt` versions |

Post Studio uses the open-source [LinkedIn agent skill pack](https://github.com/Jakeschincariol/linkedin-agent-skill) by Jake Schincariol (MIT). The 11 skills are **bundled in [`post-studio/skills/`](post-studio/skills/)**, so there is nothing extra to install. If you have them in `~/.claude/skills`, your copy is used instead.

## How it connects

- **Claude:** every AI step (draft, improve, punch lines, image layout, profile score and plan) goes through `post-studio/lib/llm.ts`. It uses the Anthropic API when `ANTHROPIC_API_KEY` is set, and otherwise the local Claude Code CLI.
- **Claude skills:** li-post gives drafting rules and hook formulas. li-human runs the Python humanizer and detector.
- **LinkedIn:** OAuth 2.0 / OpenID Connect sign-in (`openid profile w_member_social`), then the Posts API and Images API to publish.
- **Local storage:** posts, readings, screenshots, settings and the LinkedIn token live in `post-studio/data/`. Keys live in `post-studio/.env.local`. Both are gitignored and never committed.
- **Worker:** `npm run worker` publishes scheduled posts and re-checks the off-limits list right before posting.

## Setup, step by step

### 1. Prerequisites

- Node.js 20+ and Python 3
- Nothing to install for the skills: they are bundled in `post-studio/skills/`
- `rsvg-convert` for image generation: `brew install librsvg`
- Claude: an Anthropic API key, **or** the Claude Code CLI installed and signed in

### 2. Install

```bash
git clone https://github.com/pritampadhi98/linkdin-extraction.git
cd linkdin-extraction/post-studio
npm install
```

### 3. Create `post-studio/.env.local`

```ini
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
ANTHROPIC_API_KEY=        # optional; leave empty to use the claude CLI
LI_VERSION=202611         # LinkedIn API version, YYYYMM
POST_STUDIO_LIVE=0        # 0 = dry run, 1 = really post
```

This file is gitignored. Never commit it.

### 4. Create the LinkedIn app

1. Go to **developer.linkedin.com → My apps → Create app**. The app must be linked to a Company Page.
2. **Products** tab: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. **Auth** tab → **Authorized redirect URLs**: add `http://localhost:3009/api/linkedin/callback`
4. **Auth** tab: copy the **Client ID** and **Client Secret** into `.env.local`.

### 5. Run

```bash
npm run dev        # app at http://localhost:3009
```

In a second terminal, for scheduled posts:

```bash
npm run worker
```

### 6. Connect and configure

1. Open **Onboarding → Connect LinkedIn**, sign in, and click **Allow**. Check that `w_member_social` is granted.
2. Set your **approver name**, **posting slots**, **hashtag count** and **link placement**.
3. Fill the **off-limits list** with client names, internal metrics and NDA terms.

### 7. Go live

Set `POST_STUDIO_LIVE=1` in `.env.local`, then restart both `npm run dev` and `npm run worker`.

## Using it

1. **Publish:** write a post, or use **Write with Claude** from an idea.
2. **Check:** the humanizer, human score (PASS at 70+) and off-limits check run automatically.
3. **Optional:** Improve, Punch line, Create image, reference links.
4. **Approve:** Publish now, Schedule, Add to queue, or Save draft.
5. **Track:** go to Posts → Performance → **Add reading** with a screenshot at 1h, 3h, 6h, 12h, 24h, 48h, 72h and 7 days.

## Safety by design

- Nothing is posted without a named approver. Live posting is off unless `POST_STUDIO_LIVE=1`.
- The off-limits list blocks confidential terms, both at approval and right before posting.
- Claude may only use facts you supply. Gaps become `{{placeholders}}` that block approval.
- It never comments, messages, follows or scrapes. Analytics are real numbers you enter.
