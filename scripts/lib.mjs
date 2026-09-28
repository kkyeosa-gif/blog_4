// Shared helpers for the PromptFix content pipeline (generate, publish, build).
// Ported from the Tidy Tabs pipeline; Blogger/Threads/Notion parts dropped
// because this blog is a static site on GitHub Pages.

export const BLOG = {
  name: "PromptFix",
  tagline: "Quick fixes and how-tos for the AI tools you use every day.",
  lang: "en-US",
  timeZone: "America/New_York",
};

// Publish slots, US Eastern (8am, 11am, 1pm, 4pm, 8pm ET = 5am, 8am, 10am,
// 1pm, 5pm PT). Five posts a day.
export const SLOT_HOURS = [8, 11, 13, 16, 20];
export const DAILY = SLOT_HOURS.length;

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("post file is missing --- frontmatter ---");
  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

export function slugify(text, max = 60) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

export const postSlug = (file) => file.replace(/\.md$/, "");

// Date/time parts in the blog's time zone.
export function zonedParts(d = new Date(), timeZone = BLOG.timeZone) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24, minute: Number(g("minute")) };
}

// ---- Claude ------------------------------------------------------------
export async function claude(prompt, maxTokens = 8000) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (res.ok || (res.status < 500 && res.status !== 429)) break;
    await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
  }
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // content[0] isn't always the text block, so find it.
  let text = (data.content?.find((b) => b.type === "text")?.text ?? "").trim();
  if (text.startsWith("```")) text = text.replace(/^```[a-z]*\n/, "").replace(/```\s*$/, "").trim();
  return text;
}

// ---- AI images (OpenAI image API) --------------------------------------
// frontmatter (one line each, scenes separated by " | "):
//   image_prompts: <explainer of the fix> | <diagram of why it happens>
//   image_alt: <alt 1> | <alt 2>
// Image 1 sits under the first paragraph (it's the og:image), image 2 right
// before "## Troubleshooting". Generated once and committed as
// images/<post-file>/<title-slug>-<n>.jpg; delete a file to re-roll it.
export const IMAGE_STYLE =
  "Clean, modern flat vector explainer illustration, like a high-quality tech blog infographic. White or very light " +
  "background, one teal accent color (#0f766e) plus soft grays, generous spacing, rounded shapes, simple line icons. " +
  "Use short English labels only where the scene asks for them (at most 4 words each, at most 6 labels), spelled " +
  "exactly as given, large and legible. Draw generic chat windows, buttons, and app panels, never a copy of a real " +
  "product's interface. No real logos, brand marks, mascots, or watermarks. No people's faces. No photorealism.";

export function parseImagePrompts(meta) {
  const split = (v) => (v ? v.split("|").map((s) => s.trim()).filter(Boolean) : []);
  const prompts = split(meta.image_prompts).slice(0, 2);
  const alts = split(meta.image_alt);
  return prompts.map((prompt, i) => ({ n: i + 1, prompt, alt: alts[i] || meta.title || prompt }));
}

export function aiImagePath(file, meta, n) {
  return `images/${postSlug(file)}/${slugify(meta.title || postSlug(file), 50)}-${n}.jpg`;
}

export async function generateAiImage(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: `${prompt}\n\nStyle: ${IMAGE_STYLE}`,
      size: "1536x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      output_format: "jpeg",
      output_compression: 85,
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`image generation failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`image generation returned no image: ${JSON.stringify(data).slice(0, 200)}`);
  return Buffer.from(b64, "base64");
}

// ---- Markdown -> HTML --------------------------------------------------
// Supports: ## / ### headings, paragraphs, "- " and "1. " lists, "> "
// callouts, | pipe | tables, ``` fenced code ```, standalone ![alt](src)
// images, inline **bold**, *italic*, `code`, [text](url). Returns one HTML
// string per block so AI images can be slotted between blocks.
export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

function inlineHtml(text, urlFor) {
  const codes = [];
  return escapeHtml(text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>")
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, t, url) => {
      const ext = /^https?:/i.test(url);
      return `<a href="${escapeAttr(urlFor(url))}"${ext ? ' rel="noopener" target="_blank"' : ""}>${t}</a>`;
    })
    .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[i])}</code>`);
}

export const figureHtml = (src, alt, caption, eager = false) =>
  `<figure><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" width="1536" height="1024"` +
  `${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>` +
  (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "") +
  `</figure>`;

function tableHtml(rows, urlFor) {
  const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const isRule = (row) => /^\|?[\s:|-]+\|?$/.test(row);
  const header = cells(rows[0]);
  const bodyRows = rows.slice(1).filter((r) => !isRule(r)).map(cells);
  return (
    `<div class="table-wrap"><table><thead><tr>${header.map((h) => `<th>${inlineHtml(h, urlFor)}</th>`).join("")}</tr></thead>` +
    `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c, urlFor)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
  );
}

export function markdownToBlocks(md, urlFor = (u) => u) {
  const out = [];
  let para = [], list = null, table = null, quote = null, code = null;
  const flushPara = () => { if (para.length) out.push(`<p>${para.map((l) => inlineHtml(l, urlFor)).join("<br>")}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineHtml(i, urlFor)}</li>`).join("")}</${list.tag}>`); list = null; };
  const flushTable = () => { if (table) out.push(tableHtml(table, urlFor)); table = null; };
  const flushQuote = () => { if (quote) out.push(`<blockquote>${quote.map((l) => inlineHtml(l, urlFor)).join("<br>")}</blockquote>`); quote = null; };
  const flushAll = () => { flushPara(); flushList(); flushTable(); flushQuote(); };

  for (const rawLine of md.split("\n")) {
    if (code) {
      if (/^\s*```/.test(rawLine)) { out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); code = null; }
      else code.push(rawLine);
      continue;
    }
    const line = rawLine.trim();
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)(?:\s*\*(.+)\*)?$/);
    if (line.startsWith("```")) { flushAll(); code = []; }
    else if (!line) flushAll();
    else if (heading) {
      flushAll();
      const tag = heading[1].length === 2 ? "h2" : "h3";
      out.push(`<${tag} id="${slugify(heading[2], 50)}">${inlineHtml(heading[2], urlFor)}</${tag}>`);
    } else if (image) { flushAll(); out.push(figureHtml(urlFor(image[2]), image[1], image[3])); }
    else if (line.startsWith("|")) { if (!table) flushAll(); (table ??= []).push(line); }
    else if (line.startsWith(">")) { if (!quote) flushAll(); (quote ??= []).push(line.replace(/^>\s?/, "")); }
    else if (bullet || numbered) {
      flushPara(); flushTable(); flushQuote();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet ?? numbered)[1]);
    } else { flushList(); flushTable(); flushQuote(); para.push(line); }
  }
  if (code) out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushAll();
  return out;
}

// Image 1 under the answer paragraph, image 2 before Troubleshooting (or
// about two thirds down if the post has no such section).
export function embedImages(blocks, images) {
  const out = [...blocks];
  const [first, second] = images;
  if (second) {
    const t = out.findIndex((b) => /^<h2[^>]*>Troubleshooting/i.test(b));
    const idx = t > 1 ? t : Math.min(out.length, Math.max(3, Math.round(out.length * 0.66)));
    out.splice(idx, 0, figureHtml(second.src, second.alt, "AI-generated illustration"));
  }
  if (first) out.splice(Math.min(1, out.length), 0, figureHtml(first.src, first.alt, "AI-generated illustration", true));
  return out;
}

export function deriveDescription(meta, body) {
  if (meta.search_description) return meta.search_description.trim();
  const p = body.split(/\n\s*\n/)[0].replace(/[*`#>]/g, "").replace(/\s+/g, " ").trim();
  return p.length <= 155 ? p : p.slice(0, 155).replace(/\s+\S*$/, "") + "...";
}
