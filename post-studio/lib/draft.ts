import "server-only";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { structured } from "./llm";
import { loadSettings } from "./settings";
import { skillDir } from "./skills";
import { z } from "zod";

const HOME = os.homedir();
const LI_POST_DIR = process.env.LI_POST_DIR ?? skillDir("li-post");
const VOICE_FILE = process.env.VOICE_FILE ?? path.join(HOME, ".claude/linkedin/voice.md");

export const DraftSchema = z.object({
  questions: z
    .array(z.string())
    .describe("If the idea is too thin to write one specific true post, the questions to ask. Otherwise empty."),
  hooks: z
    .array(
      z.object({
        formula_id: z.number().describe("Hook formula id from hooks.json"),
        formula_name: z.string(),
        line: z.string().describe("The hook line itself, under 140 characters"),
      }),
    )
    .describe("Exactly three hooks from three different formulas. Empty if questions is non-empty."),
  recommended: z.number().describe("Index (0-2) of the hook the draft uses"),
  reason: z.string().describe("One sentence: why that hook"),
  draft: z.string().describe("The full post, copy-ready. Empty if questions is non-empty."),
  placeholders: z
    .array(z.string())
    .describe("Every {{placeholder}} left in the draft, with what the user must fill in"),
  voice_note: z.string().describe("One line on which voice was used, or that the voice profile is empty"),
});

export type Draft = z.infer<typeof DraftSchema>;

let cachedSystem: string | null = null;

/** The li-post skill + its 21 hook formulas, as a stable (cacheable) system prompt. */
async function systemPrompt(): Promise<string> {
  if (cachedSystem) return cachedSystem;
  const [skill, hooks] = await Promise.all([
    readFile(path.join(LI_POST_DIR, "SKILL.md"), "utf8"),
    readFile(path.join(LI_POST_DIR, "hooks.json"), "utf8"),
  ]);
  cachedSystem = `You write LinkedIn posts for one person, following the li-post skill below exactly.

You are running inside Post Studio, not Claude Code: you cannot read files or run /li-human. Instead:
- The voice profile is given in the user turn. If it is empty or still the unfilled template, write in a plain, direct first-person voice and say so in voice_note. Do not invent a persona.
- A humanizer and a scorer run on your draft after you. Still write cleanly: no em dashes, no curly quotes, no stock AI phrasing.
- Never fabricate numbers, clients, outcomes or quotes. Use only facts the user gave. Where a needed fact is missing, leave a {{placeholder}} and list it.
- If the idea is too thin for a specific true post, return 1-3 questions and leave hooks and draft empty.
- No links in the post body (Post Studio adds reference links separately).
- Hashtags: follow the HASHTAG RULE in the user turn. It overrides the skill's "three maximum".

<li_post_skill>
${skill}
</li_post_skill>

<hooks_json>
${hooks}
</hooks_json>`;
  return cachedSystem;
}

async function voiceProfile(): Promise<string> {
  return readFile(VOICE_FILE, "utf8").catch(() => "");
}

export { ClaudeError as DraftError } from "./claude";

export type Trend = { keyword: string; hashtag: string | null; why: string; angle: string };

export async function draftPost(idea: string, facts: string, trends: Trend[] = []): Promise<Draft & { model: string }> {
  const [system, voice, settings] = await Promise.all([systemPrompt(), voiceProfile(), loadSettings()]);
  const hashtagRule = `\n\nHASHTAG RULE: end the post with exactly ${settings.hashtagCount} relevant, commonly used hashtags on one line (fewer only if that many real ones don't fit).`;
  const topics = trends
    .map((t, i) => `<trending_topic n="${i + 1}">
Topic: ${t.keyword}${t.hashtag ? ` (${t.hashtag})` : ""}
What's happening (from a web search; treat as context, not as your facts): ${t.why}
Suggested angle: ${t.angle || "(none)"}
</trending_topic>`)
    .join("\n");
  const trendBlock = !trends.length
    ? ""
    : trends.length === 1
      ? `\n\n${topics}

Write a timely post that connects this topic to the user's OWN experience from the voice profile's proof list and the facts below.
- Mention the topic by name in the first two lines so it's timely.
- Don't restate news details beyond "What's happening", and don't add version numbers, dates or statistics about the topic.
- If the user has no real experience that connects to the topic, don't fake one: ask 1-3 questions instead.
- Use the hashtag above as one of the hashtags if it fits.`
      : `\n\n${topics}

The user picked these ${trends.length} topics. Write ONE timely post around a single idea that links them, grounded in the user's OWN experience from the voice profile's proof list and the facts below.
- Name the main topic in the first two lines so it's timely; work the others in where they genuinely connect.
- If they don't all connect naturally, build the post around the strongest one and leave the rest out. Never force a link; say which ones you left out in your notes.
- Don't restate news details beyond each "What's happening", and don't add version numbers, dates or statistics about the topics.
- If the user has no real experience that connects, don't fake one: ask 1-3 questions instead.
- Prefer the topics' hashtags (where they fit) for the hashtag line.`;
  const { data, via } = await structured({
    schema: DraftSchema,
    system,
    prompt: `<voice_profile>\n${voice.trim() || "(empty)"}\n</voice_profile>\n\n<idea>\n${idea.trim()}\n</idea>\n\n<facts_i_can_use>\n${facts.trim() || "(none given)"}\n</facts_i_can_use>${trendBlock}${hashtagRule}`,
  });
  return { ...data, model: via };
}
