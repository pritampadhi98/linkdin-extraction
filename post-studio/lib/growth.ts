import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ClaudeError, readSkill, readVoice } from "./claude";
import { structured } from "./llm";
import { loadMarket, type MarketState } from "./market";
import { loadSettings } from "./settings";

const DATA = path.join(process.cwd(), "data");
const STATE = path.join(DATA, "profile.json"); // last score + plan, gitignored
const PDF = path.join(DATA, "profile.pdf");

// ---------- Schemas ----------

export const ScoreSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().describe("Rubric item id from rubric.json"),
        max: z.number(),
        score: z.number().nullable().describe("null when the PDF cannot show this item"),
        reason: z.string().describe("One short line"),
      }),
    )
    .describe("All twelve rubric items, in rubric order"),
  visible_score: z.number().describe("Sum of scores for items that are visible"),
  visible_max: z.number().describe("Sum of max for items that are visible"),
  summary: z.string().describe("Two sentences: where the profile stands"),
  top_fixes: z.array(z.string()).describe("The three changes that would gain the most points, most points first"),
});
export type Score = z.infer<typeof ScoreSchema>;

export const PlanSchema = z.object({
  profile: z.object({
    headlines: z.array(z.string()).describe("Three headline options, each under 220 characters"),
    about: z.string().describe("Full About section, under 1,400 characters"),
    experience: z.array(
      z.object({
        role: z.string(),
        company: z.string(),
        dates: z.string(),
        summary: z.string().describe("One line of scope"),
        bullets: z.array(z.string()).describe("Two to three outcome bullets using only numbers from the PDF"),
      }),
    ),
    top_skills: z.array(z.string()).describe("Three skills to pin"),
    other_fixes: z.array(z.string()).describe("Banner, featured, URL, recommendations and similar, one line each"),
  }),
  week: z
    .array(
      z.object({
        day_offset: z.number().describe("Days from tomorrow: 0 = tomorrow ... 6"),
        time: z.string().describe("Local time HH:MM, 24h"),
        type: z.string().describe("PROOF, OPINION, TEACH, STORY or OFFER"),
        hook_id: z.number(),
        hook_name: z.string(),
        angle: z.string().describe("The specific angle, one line"),
        draft: z.string().describe("Full copy-ready post"),
        placeholders: z.array(z.string()).describe("Every {{placeholder}} the user must fill"),
      }),
    )
    .describe("Exactly the number of posts the user asked for, never two of the same type back to back"),
  engagement: z.object({
    daily_minutes: z.number(),
    groups: z.array(
      z.object({
        kind: z.string().describe("reach, peers or buyers"),
        count: z.number(),
        who: z.string().describe("Who to look for, specific to this profile"),
        search_terms: z.array(z.string()).describe("LinkedIn search terms to find them"),
        comment_angle: z.string().describe("What this user can genuinely add in their comments"),
      }),
    ),
    named: z
      .array(z.object({ name: z.string(), why: z.string() }))
      .describe("Only people or companies the user listed. Never invent names."),
  }),
  notes: z.string().describe("One or two lines: what to fill in, what was assumed"),
});
export type Plan = z.infer<typeof PlanSchema>;

/** What a plan was built from, so the UI can tell when it's out of date. */
export type PlanBasis = { count: number; topics: string[] };
export const MAX_POSTS = 7;
export const DEFAULT_POSTS = 4;

export type GrowthState = {
  score?: Score & { at: string; via: string };
  plan?: Plan & { at: string; via: string; basis?: PlanBasis };
  /** Topic and keyword ideas drawn from the profile itself (same shape as trending research, with no web sources). */
  topics?: MarketState;
};

// ---------- Storage ----------

export async function loadState(): Promise<GrowthState> {
  return readFile(STATE, "utf8").then((s) => JSON.parse(s) as GrowthState, () => ({}));
}

async function saveState(s: GrowthState) {
  await mkdir(DATA, { recursive: true });
  await writeFile(STATE, JSON.stringify(s, null, 2), "utf8");
}

export async function saveProfilePdf(bytes: Buffer) {
  await mkdir(DATA, { recursive: true });
  await writeFile(PDF, bytes);
}

async function profilePdf(): Promise<string> {
  try {
    await readFile(PDF);
    return PDF;
  } catch {
    throw new ClaudeError("Upload your profile PDF first (step 2).", 400);
  }
}

// ---------- Claude calls ----------

const ProfileTopicsSchema = z.object({
  topics: z
    .array(
      z.object({
        keyword: z.string().describe("The topic or keyword, 1-4 words, as people search and write it"),
        hashtag: z.string().nullable().describe("A real, commonly used LinkedIn hashtag for it, with #, or null"),
        why: z.string().describe("One sentence: why this topic fits THIS person's profile and audience"),
        angle: z.string().describe("One sentence: a post angle built only from their OWN proof (profile PDF, voice profile). Empty if none fits"),
      }),
    )
    .describe("Exactly 8 topics, strongest fit first"),
  notes: z.string().describe("One or two sentences: what you based this on and anything the user should confirm"),
});

/** Topic and keyword ideas drawn from the profile PDF, the voice profile and who the user writes for. No web search. */
export async function suggestProfileTopics(): Promise<MarketState> {
  const [voice, pdfPath, settings, state] = await Promise.all([readVoice(), profilePdf(), loadSettings(), loadState()]);
  const { data, via } = await structured({
    schema: ProfileTopicsSchema,
    pdfPath,
    system: `You suggest LinkedIn topics and keywords for one person, from THEIR profile and the audience they write for. These come from the profile, not from the news: you cannot search the web.

Hard rules:
- Only suggest topics where this person has real proof in the profile PDF or the voice profile ("Proof I can use"). Never invent experience, numbers, clients or results.
- keyword: 1-4 words as people actually search it. hashtag: a real, commonly used one, or null.
- why: one sentence on the fit with this person's profile and audience.
- angle: one sentence, built only from their own proof. If no honest angle exists, leave it empty.
- Mix: some topics straight from their strongest proof, a few from adjacent areas their audience cares about, and keep the focus areas first if given.
- No em dashes, no curly quotes.`,
    prompt: `<voice_profile>\n${voice.trim() || "(empty)"}\n</voice_profile>

<audience>${settings.audience || "(not given: infer from the profile)"}</audience>
<focus>${settings.focus || "(none)"}</focus>
<current_score>\n${state.score ? JSON.stringify(state.score) : "(not scored yet)"}\n</current_score>

Suggest 8 topics and keywords I could post about, grounded in my profile.`,
  });
  const topics: MarketState = {
    keywords: data.topics.slice(0, 8).map((t) => ({ ...t, sources: [] })),
    notes: data.notes,
    at: new Date().toISOString(),
    audience: settings.audience,
    focus: settings.focus,
    via,
  };
  await saveState({ ...(await loadState()), topics });
  return topics;
}

/** Score the uploaded profile PDF against li-profile's 12-part rubric. */
export async function scoreProfile(): Promise<Score & { at: string; via: string }> {
  const [skill, rubric, pdfPath] = await Promise.all([
    readSkill("li-profile", "SKILL.md"),
    readSkill("li-profile", "rubric.json"),
    profilePdf(),
  ]);
  const { data, via } = await structured({
    schema: ScoreSchema,
    pdfPath,
    system: `Score a LinkedIn profile, following the li-profile skill and its rubric exactly. Be honest; a generous score helps nobody.
The input is LinkedIn's "Save to PDF" export. It does NOT show the photo, banner, featured section, recommendations received, or recent activity: score those null with reason "not in the PDF", and leave them out of visible_score and visible_max.
Score only this step. Do not rewrite anything yet.

<li_profile_skill>
${skill}
</li_profile_skill>

<rubric_json>
${rubric}
</rubric_json>`,
    prompt: "Score this profile.",
  });
  const score = { ...data, at: new Date().toISOString(), via };
  await saveState({ ...(await loadState()), score });
  return score;
}

/** "Increase": profile rewrites + a week of posts + an engagement list. */
export async function buildPlan(people: string, opts: { count?: number; topics?: string[] } = {}): Promise<Plan & { at: string; via: string; basis: PlanBasis }> {
  const state = await loadState();
  const count = Math.min(MAX_POSTS, Math.max(1, Math.round(Number(opts.count) || DEFAULT_POSTS)));
  // Selected trending topics: matched against the saved research so only real topics (with their sources' summary) are used.
  const [market, saved] = await Promise.all([loadMarket(), loadState()]);
  const wanted = new Set((opts.topics ?? []).map(String));
  const seen = new Set<string>();
  const topics = [...(market?.keywords ?? []), ...(saved.topics?.keywords ?? [])]
    .filter((k) => wanted.has(k.keyword) && !seen.has(k.keyword) && !!seen.add(k.keyword))
    .slice(0, 6);
  const topicBlock = topics.length
    ? `\n\n<selected_trending_topics>\n${topics
        .map((t, i) => `<topic n="${i + 1}">\nTopic: ${t.keyword}${t.hashtag ? ` (${t.hashtag})` : ""}\nContext (from web research or the user's own profile; not the user's facts): ${t.why}\nSuggested angle: ${t.angle || "(none)"}\n</topic>`)
        .join("\n")}\n</selected_trending_topics>

The user chose these topics for the week. Build the posts around them where they genuinely connect to the user's OWN proof (profile PDF, voice profile). With ${count} posts, give each topic its own post if there's room, otherwise combine topics that fit together. Never force a link: if a topic has no honest connection to the user's experience, skip it and say so in notes. Don't add version numbers, dates or statistics about a topic beyond "What's happening". Use each topic's hashtag where it fits.`
    : "";
  const [profileSkill, planSkill, postSkill, hooks, voice, pdfPath] = await Promise.all([
    readSkill("li-profile", "SKILL.md"),
    readSkill("li-plan", "SKILL.md"),
    readSkill("li-post", "SKILL.md"),
    readSkill("li-post", "hooks.json"),
    readVoice(),
    profilePdf(),
  ]);
  const { data, via } = await structured({
    schema: PlanSchema,
    pdfPath,
    system: `You help one person grow on LinkedIn. Produce three things, following the three skills below:
1. Profile rewrites (li-profile), fix-first order.
2. The number of posts the user asks for, for the coming week (li-plan for the mix and timing, li-post for each post).
3. An engagement list (li-plan's "Who to engage with").

Hard rules:
- Use only facts from the profile PDF and what the user wrote. Never invent numbers, clients, outcomes, people or companies. Where a post needs a fact you don't have, leave a {{placeholder}} and list it.
- If numbers in the PDF contradict each other, use the conservative one and say so in notes.
- Engagement "named" lists only people or companies the user gave. Otherwise describe who to look for and how to find them.
- No em dashes, no curly quotes, no stock AI phrasing. No links in post bodies. At most three hashtags.
- If the voice profile is empty, write in a plain, direct first-person voice and say so in notes.
- You cannot run other skills or tools besides reading the PDF; just return the result.

<li_profile_skill>
${profileSkill}
</li_profile_skill>

<li_plan_skill>
${planSkill}
</li_plan_skill>

<li_post_skill>
${postSkill}
</li_post_skill>

<hooks_json>
${hooks}
</hooks_json>`,
    prompt: `<voice_profile>\n${voice.trim() || "(empty)"}\n</voice_profile>

<current_score>\n${state.score ? JSON.stringify(state.score) : "(not scored yet)"}\n</current_score>

<people_and_companies_to_engage_with>\n${people.trim() || "(none given)"}\n</people_and_companies_to_engage_with>

Build my profile rewrites, my ${count} post${count === 1 ? "" : "s"} for the week, and my engagement list.${topicBlock}`,
  });
  // Trust the number asked for, not whatever came back.
  const plan = { ...data, week: data.week.slice(0, count), at: new Date().toISOString(), via, basis: { count, topics: topics.map((t) => t.keyword) } };
  await saveState({ ...(await loadState()), plan });
  return plan;
}
