import "server-only";
import { z } from "zod";
import { readSkill, readVoice } from "./claude";
import { humanize } from "./humanizer";
import { structured } from "./llm";
import { BAIT } from "./punchline";

export const CommentSchema = z.object({
  options: z
    .array(
      z.object({
        type: z.string().describe("Which of the li-comment skill's nine comment types this is, e.g. 'Add a datum'"),
        comment: z.string().describe("The comment itself: 2 to 4 sentences, one idea, no emoji, no hashtags, no links"),
        why: z.string().describe("One short line: why this comment adds something to THIS post"),
      }),
    )
    .describe("Exactly two options of different types"),
  pick: z.number().describe("Index (0 or 1) of the option you would post"),
  missing: z.string().describe("If a real number or story from the user would make it stronger and isn't in their proof list, say what. Otherwise empty"),
});
export type CommentOption = z.infer<typeof CommentSchema>["options"][number];

const SYSTEM_HEAD = `You draft comments for the user to post BY HAND on someone else's LinkedIn post.

Hard rules:
- Use only facts from the user's voice profile (especially "Proof I can use") and the post itself. Never invent numbers, clients, results or experiences.
- Never mention clients or anything on an off-limits list. Never pitch, never ask for a job, never self-promote.
- 2 to 4 sentences, one idea, specific to THIS post. Never open with "Great post", "Love this", "So true", "Couldn't agree more", "This resonates" or the author's name plus "!".
- No em dashes, no curly quotes, no emoji, no hashtags, no links.
- If the post is too thin to add anything real, make one option a short, specific question.`;

export async function suggestComments(post: string, author: string) {
  const [voice, skill] = await Promise.all([readVoice(), readSkill("li-comment", "SKILL.md").catch(() => "")]);
  const { data, via } = await structured({
    schema: CommentSchema,
    system: `${SYSTEM_HEAD}\n\n<li_comment_skill>\n${skill}\n</li_comment_skill>`,
    prompt: `<voice_profile>
${voice.trim() || "(empty)"}
</voice_profile>

<author>${author || "(not given)"}</author>

<post>
${post}
</post>`,
  });
  // Same cleanup as posts: strip AI tells (em dashes, stock phrases), drop reflex bait.
  const options = (
    await Promise.all(
      data.options.map(async (o) => ({ ...o, comment: (await humanize(o.comment).catch(() => ({ text: o.comment }))).text })),
    )
  ).filter((o) => o.comment.trim() && !BAIT.test(o.comment));
  return { options, pick: Math.min(Math.max(0, Math.round(data.pick)), Math.max(0, options.length - 1)), missing: data.missing, via };
}
