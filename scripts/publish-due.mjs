#!/usr/bin/env node
// Moves the next ready post live when a slot is due. Slots: 8am, 11am, 1pm,
// 4pm, 8pm US Eastern (lib.mjs SLOT_HOURS). Runs every 15 minutes from the
// site workflow; a run publishes at most one post, and only while today's
// published count is behind the number of slots already passed, so a missed
// run is simply caught up by the next one.
// "Publishing" = adding a `published:` timestamp and moving the file from
// posts/ready/ to posts/published/ (same file name, so image paths stay).
// A post whose images are missing is held; the next post goes instead.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, parseImagePrompts, aiImagePath, zonedParts, SLOT_HOURS } from "./lib.mjs";

const READY = "posts/ready";
const PUBLISHED = "posts/published";
const CALENDAR = "tasks/calendar.md";
const force = process.env.FORCE_PUBLISH === "true";

const output = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const alert = (msg) => {
  console.warn(msg);
  if (process.env.ALERT_FILE) appendFileSync(process.env.ALERT_FILE, `- ${msg}\n`);
};
const md = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);

const now = new Date();
const { date: today, hour } = zonedParts(now);
const due = SLOT_HOURS.filter((h) => h <= hour).length;
const publishedToday = md(PUBLISHED).filter((f) => {
  const { meta } = parseFrontmatter(readFileSync(join(PUBLISHED, f), "utf8"));
  return meta.published && zonedParts(new Date(meta.published)).date === today;
}).length;

console.log(`ET ${today} ${hour}h: ${due} slot(s) due, ${publishedToday} published today.`);
if (!force && publishedToday >= due) {
  output("published", "false");
  process.exit(0);
}

let chosen = null;
for (const file of md(READY)) {
  const { meta } = parseFrontmatter(readFileSync(join(READY, file), "utf8"));
  const missing = parseImagePrompts(meta).map(({ n }) => aiImagePath(file, meta, n)).filter((p) => !existsSync(p));
  if (!meta.title) alert(`${file} has no title; skipped.`);
  else if (missing.length) alert(`Held ${file}: images not generated yet (${missing.join(", ")}).`);
  else { chosen = { file, meta }; break; }
}
if (!chosen) {
  if (!md(READY).length) alert("posts/ready/ is empty; a publish slot went unused.");
  output("published", "false");
  process.exit(0);
}

const raw = readFileSync(join(READY, chosen.file), "utf8");
const stamped = raw.replace(/^---\n/, `---\npublished: ${now.toISOString()}\n`);
mkdirSync(PUBLISHED, { recursive: true });
writeFileSync(join(READY, chosen.file), stamped);
renameSync(join(READY, chosen.file), join(PUBLISHED, chosen.file));
appendFileSync(CALENDAR, `- ${today} ${String(hour).padStart(2, "0")}h ET: "${chosen.meta.title}" (${chosen.file})\n`);
console.log(`Published ${chosen.file}: ${chosen.meta.title}`);
output("published", "true");
