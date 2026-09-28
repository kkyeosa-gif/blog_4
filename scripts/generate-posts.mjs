#!/usr/bin/env node
// The automated content team. Tops posts/ready/ up to a full day (5 posts,
// or COUNT when run by hand). Each post goes through three Claude passes that
// mirror .claude/agents/:
//   1. writer   (researcher + hook-writer + script-writer): picks an unused
//      topic and writes the post in the house style
//   2. editor   (publisher checklist): fact-checks claims, enforces style
//   3. designer: reads the final post and writes the two GPT image scenes
// Images themselves are made by scripts/generate-images.mjs.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, slugify, claude, zonedParts, DAILY } from "./lib.mjs";

const READY_DIR = "posts/ready";
const PUBLISHED_DIR = "posts/published";
const DRAFTS_DIR = "posts/drafts";
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");

const listPosts = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : []);

function usedTitles() {
  const titles = [];
  for (const dir of [DRAFTS_DIR, READY_DIR, PUBLISHED_DIR]) {
    for (const f of listPosts(dir)) {
      try {
        const { meta } = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
        if (meta.title) titles.push(meta.title);
      } catch {
        // an unparseable file shouldn't stop the run
      }
    }
  }
  return titles;
}

const alert = (msg) => {
  console.warn(msg);
  if (process.env.ALERT_FILE) appendFileSync(process.env.ALERT_FILE, `- ${msg}\n`);
};

async function writeDraft(titles, ctx) {
  return claude(`You are the content team of PromptFix, an English-language blog for US readers with quick fixes and how-tos for everyday AI tools (ChatGPT, Claude, Gemini, Microsoft Copilot, Perplexity, Midjourney, and similar).

STEP 1 (researcher): pick ONE topic a real US user would type into Google right now, answerable with concrete steps. Prefer long-tail problem searches ("ChatGPT network error on long responses", "how to delete Gemini activity", "Claude file upload failed") over broad ones. It must NOT repeat any of these existing titles:
${titles.map((t) => `- ${t}`).join("\n") || "(none yet)"}

Topic ideas (use one, or something similarly concrete):
${ctx.topics}

What the team's research notes say:
${ctx.briefs || "(no notes yet)"}

STEP 2 (hook-writer + script-writer): write the post. Follow this style guide exactly:
${ctx.style}

Rules for this automated post:
- You have not hands-on tested anything. Never write "I tested", "I tried", "in my experience", or "we tested".
- AI products change often. Describe menus and buttons only when you are confident they are current; otherwise describe what to look for ("open your profile menu and look for Data controls"). Never invent error messages, prices, plan limits, or release dates. Say "at the time of writing" for anything likely to change.
- Link 1-3 official help pages (help.openai.com, support.anthropic.com, support.google.com, support.microsoft.com, docs.perplexity.ai, docs.midjourney.com, status pages). Only use URLs you are sure exist; link the help center root rather than guessing a deep URL.
- Do not link or reference any image or file; images are added later by the designer.
- labels: 1-3 short lowercase tags, the tool name first (e.g. chatgpt, troubleshooting).
- search_description: under 155 characters, contains the main search phrase.
- Today is ${zonedParts().date}.

Output ONLY the raw file content in exactly this format, nothing else (no code fences, no commentary):

---
title: <title>
labels: <label1>, <label2>
search_description: <description>
---
<body in markdown>`);
}

async function editDraft(file, style) {
  return claude(`You are the editor of PromptFix, a blog of AI-tool fixes and how-tos. This post publishes automatically, so you are the last check.

Check and fix:
1. Every factual claim: menu paths, button names, settings, keyboard shortcuts, plan/feature availability, error message wording, what a tool can or cannot do. If a claim is shaky, make it less specific or remove it. Never add new specifics you are unsure of.
2. Links: keep only official help/status pages you are confident exist; replace a doubtful deep link with the help center root.
3. Remove any claim of hands-on testing ("I tested", "we tried", "in my experience").
4. Style guide below: answer in the first 1-2 sentences, section order, banned words, no em dashes, no filler intro, no summary ending.
5. Frontmatter: keep every field on ONE line; title under 70 characters; search_description under 155 characters.

Style guide:
${style}

Output ONLY the corrected file in the exact same format (frontmatter between --- lines, then the body). No preamble, no notes.

---INPUT---
${file}`);
}

async function designImages(file) {
  const text = await claude(`You are the designer of PromptFix, a blog of AI-tool fixes. Read the post below and write TWO image scenes for an image model (GPT image). Both are flat vector explainer illustrations that explain THIS post's content in detail, so a reader understands the fix from the images alone.

Image 1 (top of post, also the social preview): a visual step-by-step of the fix. Show the 3-5 key steps from the post as numbered panels or a left-to-right flow, each with a simple icon of what the user does (generic chat window, settings gear, toggle, upload arrow, refresh button...) and a short label taken from the post.
Image 2 (before Troubleshooting): a diagram of WHY the problem happens or how the feature works (cause -> effect, before vs after, or what goes where), specific to this post.

Rules for each scene:
- 60-110 words. Describe layout, each element, and the exact label text in double quotes.
- Labels: at most 6 per image, at most 4 words each, plain English, no long sentences.
- Generic UI only: no real logos or brand names drawn in the image, no copy of a real product screen. Tool names may appear only as a plain text label.
- No people's faces. Never use the | character.
Also write alt text for each: 10-18 words, what the image actually shows, main keyword at most once.

Answer with ONLY this JSON, no code fence:
{"image_prompts": ["<scene 1>", "<scene 2>"], "image_alt": ["<alt 1>", "<alt 2>"]}

---POST---
${file}`, 2000);
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const clean = (s) => String(s).replace(/[|\n\r]+/g, " ").trim();
  if (json.image_prompts?.length !== 2 || json.image_alt?.length !== 2) throw new Error("designer returned the wrong number of images");
  return { prompts: json.image_prompts.map(clean).join(" | "), alts: json.image_alt.map(clean).join(" | ") };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    alert("ANTHROPIC_API_KEY is not set; no posts written.");
    return;
  }
  mkdirSync(READY_DIR, { recursive: true });
  const queued = listPosts(READY_DIR).length;
  const count = process.env.COUNT ? Math.max(1, Math.min(10, Number(process.env.COUNT))) : Math.max(0, DAILY - queued);
  if (!count) {
    console.log(`posts/ready/ already holds ${queued} posts. Nothing to write.`);
    return;
  }
  const ctx = { style: read("docs/style-guide.md"), topics: read("tasks/topics-seed.md"), briefs: read("tasks/briefs.md") };
  const today = zonedParts().date;

  for (let i = 0; i < count; i++) {
    try {
      const draft = await writeDraft(usedTitles(), ctx);
      if (!draft.startsWith("---")) throw new Error(`writer returned no frontmatter: ${draft.slice(0, 120)}`);
      // No editor pass, no publish: an unchecked post never reaches the queue.
      const edited = await editDraft(draft, ctx.style);
      if (!edited.startsWith("---")) throw new Error(`editor returned no frontmatter: ${edited.slice(0, 120)}`);
      const { meta, body } = parseFrontmatter(edited);
      if (!meta.title || body.length < 800) throw new Error("post has no title or is too short");
      if (usedTitles().some((t) => t.toLowerCase() === meta.title.toLowerCase())) throw new Error(`duplicate title: ${meta.title}`);
      const img = await designImages(edited);
      const front = [
        `title: ${meta.title}`,
        `labels: ${meta.labels ?? ""}`,
        `search_description: ${meta.search_description ?? ""}`,
        `image_prompts: ${img.prompts}`,
        `image_alt: ${img.alts}`,
      ].join("\n");
      const n = String(queued + i + 1).padStart(2, "0");
      const file = `${today}-${n}-${slugify(meta.title, 50)}.md`;
      writeFileSync(join(READY_DIR, file), `---\n${front}\n---\n${body}\n`);
      console.log(`Queued ${READY_DIR}/${file} (${meta.title})`);
    } catch (err) {
      alert(`Post ${i + 1}/${count} failed: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
