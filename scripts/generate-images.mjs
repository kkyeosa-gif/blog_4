#!/usr/bin/env node
// Makes the GPT images for every queued or published post that lacks them:
// images/<post-file>/<title-slug>-<n>.jpg, one per image_prompts scene.
// Existing files are never regenerated (each image is paid for once); delete
// a file to re-roll it. A post whose images are missing is held by publish.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseFrontmatter, parseImagePrompts, aiImagePath, generateAiImage } from "./lib.mjs";

const DIRS = ["posts/ready", "posts/published", "posts/drafts"];

async function main() {
  const todo = [];
  for (const dir of DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
      const { meta } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
      for (const { n, prompt } of parseImagePrompts(meta)) {
        const out = aiImagePath(file, meta, n);
        if (!existsSync(out)) todo.push({ file, out, prompt });
      }
    }
  }
  if (!todo.length) return console.log("Every post already has its images.");
  if (!process.env.OPENAI_API_KEY) throw new Error(`OPENAI_API_KEY is not set (${todo.length} image(s) missing)`);

  let failed = 0;
  for (const { file, out, prompt } of todo) {
    try {
      const jpg = await generateAiImage(prompt);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, jpg);
      console.log(`Generated ${out} (${Math.round(jpg.length / 1024)} KB) for ${file}`);
    } catch (err) {
      failed += 1;
      console.warn(`${file}: ${err.message}`);
      if (process.env.ALERT_FILE) appendFileSync(process.env.ALERT_FILE, `- Image failed for ${out}: ${err.message}\n`);
    }
  }
  if (failed) console.warn(`${failed} image(s) failed; the next run retries them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
