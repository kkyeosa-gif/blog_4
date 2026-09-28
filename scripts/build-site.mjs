#!/usr/bin/env node
// Builds the static site in _site/ from posts/published/ + images/.
// Pages: home, one page per post (/posts/<slug>/), one per label
// (/tags/<label>/), about, 404, plus sitemap.xml, feed.xml, robots.txt.
// Env: SITE_URL (default https://<owner>.github.io/<repo>), ADSENSE_CLIENT
// (ca-pub-..., adds the AdSense script), GOOGLE_SITE_VERIFICATION.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  BLOG, parseFrontmatter, parseImagePrompts, aiImagePath, markdownToBlocks, embedImages,
  deriveDescription, slugify, escapeHtml, escapeAttr, postSlug,
} from "./lib.mjs";

const OUT = "_site";
const [owner, repo] = (process.env.GITHUB_REPOSITORY || "kkyeosa-gif/blog_4").split("/");
const SITE_URL = (process.env.SITE_URL || `https://${owner}.github.io/${repo}`).replace(/\/+$/, "");
const BASE = new URL(SITE_URL + "/").pathname.replace(/\/$/, ""); // "" or "/blog_4"
const ADSENSE = process.env.ADSENSE_CLIENT || "";
const VERIFY = process.env.GOOGLE_SITE_VERIFICATION || "";
const abs = (p) => `${SITE_URL}/${p.replace(/^\/+/, "")}`;
const rel = (p) => `${BASE}/${p.replace(/^\/+/, "")}`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: BLOG.timeZone, month: "long", day: "numeric", year: "numeric" });

function write(path, content) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

// ---- load posts ---------------------------------------------------------
const dir = "posts/published";
const posts = (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [])
  .map((file) => {
    const { meta, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
    const images = parseImagePrompts(meta)
      .map(({ n, alt }) => ({ path: aiImagePath(file, meta, n), alt }))
      .filter((i) => existsSync(i.path))
      .map((i) => ({ ...i, src: rel(i.path) }));
    return {
      file, meta, body, images,
      title: meta.title,
      slug: slugify(meta.title || postSlug(file), 70),
      published: meta.published || new Date().toISOString(),
      labels: (meta.labels || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      description: deriveDescription(meta, body),
    };
  })
  .filter((p) => p.title)
  .sort((a, b) => b.published.localeCompare(a.published));

// Titles that slugify the same get a numeric suffix so no page is overwritten.
const seen = new Map();
for (const p of [...posts].reverse()) {
  const n = seen.get(p.slug) ?? 0;
  seen.set(p.slug, n + 1);
  if (n) p.slug = `${p.slug}-${n + 1}`;
}
const postPath = (p) => `posts/${p.slug}/`;

// ---- layout ------------------------------------------------------------
const CSS = `
:root{--bg:#fff;--fg:#1f2937;--muted:#6b7280;--line:#e5e7eb;--card:#f9fafb;--accent:#0f766e;--accent-bg:#ecfdf5;--code:#f3f4f6}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--fg:#e5e7eb;--muted:#9ca3af;--line:#1f2937;--card:#111827;--accent:#2dd4bf;--accent-bg:#0f2a2a;--code:#1f2937}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}.wrap{max-width:760px;margin:0 auto;padding:0 16px}
header.site{border-bottom:1px solid var(--line)}header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;padding-bottom:14px}
.brand{font-weight:800;font-size:1.25rem;text-decoration:none;color:var(--fg)}.brand span{color:var(--accent)}
nav a{margin-left:14px;text-decoration:none;color:var(--muted);font-size:.95rem}
.hero-intro{padding:28px 0 8px}.hero-intro h1{margin:0 0 4px;font-size:1.8rem;line-height:1.25}.hero-intro p{margin:0;color:var(--muted)}
.card{display:block;padding:18px 0;border-bottom:1px solid var(--line);text-decoration:none;color:inherit}
.card h2{margin:0 0 6px;font-size:1.2rem;line-height:1.35;color:var(--fg)}.card:hover h2{color:var(--accent)}
.card p{margin:0;color:var(--muted);font-size:.95rem}.meta{color:var(--muted);font-size:.85rem;margin:0 0 6px}
.tag{display:inline-block;background:var(--accent-bg);color:var(--accent);border-radius:999px;padding:1px 10px;font-size:.8rem;text-decoration:none;margin-right:6px}
article h1{font-size:2rem;line-height:1.25;margin:28px 0 8px}article h2{margin-top:2em;line-height:1.3}article h3{line-height:1.35}
figure{margin:1.6em 0}figure img{width:100%;height:auto;border-radius:10px;border:1px solid var(--line);display:block}
figcaption{font-size:.8rem;color:var(--muted);margin-top:6px}
blockquote{margin:1.2em 0;padding:.7em 1em;border-left:4px solid var(--accent);background:var(--accent-bg);border-radius:0 8px 8px 0}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.9em}
pre{background:var(--code);padding:14px;border-radius:8px;overflow-x:auto;white-space:pre-wrap}pre code{padding:0;background:none}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.95rem}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left}th{background:var(--card)}
.related{margin:40px 0;padding:16px 20px;background:var(--card);border-radius:10px}.related h2{margin:0 0 8px;font-size:1.05rem}
footer.site{border-top:1px solid var(--line);margin-top:48px;padding:20px 0;color:var(--muted);font-size:.85rem}
.pager{display:flex;justify-content:space-between;margin:24px 0}
`;

function page({ title, description, path, body, image, type = "website", jsonLd, noindex = false }) {
  const url = abs(path);
  const fullTitle = path === "" ? `${BLOG.name}: ${BLOG.tagline}` : `${title} | ${BLOG.name}`;
  return `<!doctype html>
<html lang="${BLOG.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta property="og:site_name" content="${BLOG.name}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${url}">
${image ? `<meta property="og:image" content="${abs(image)}">\n<meta name="twitter:card" content="summary_large_image">\n` : ""}<link rel="alternate" type="application/rss+xml" title="${BLOG.name}" href="${rel("feed.xml")}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f766e'/%3E%3Cpath d='M9 16l5 5 9-10' stroke='white' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
${VERIFY ? `<meta name="google-site-verification" content="${escapeAttr(VERIFY)}">\n` : ""}${ADSENSE ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeAttr(ADSENSE)}" crossorigin="anonymous"></script>\n` : ""}${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` : ""}<style>${CSS}</style>
</head>
<body>
<header class="site"><div class="wrap"><a class="brand" href="${rel("")}">Prompt<span>Fix</span></a><nav><a href="${rel("")}">Latest</a><a href="${rel("about/")}">About</a></nav></div></header>
<main class="wrap">
${body}
</main>
<footer class="site"><div class="wrap">&copy; ${new Date().getFullYear()} ${BLOG.name}. ${escapeHtml(BLOG.tagline)} Independent site, not affiliated with OpenAI, Anthropic, Google, Microsoft, or any other AI company. Illustrations are AI-generated. <a href="${rel("feed.xml")}">RSS</a></div></footer>
</body>
</html>
`;
}

const card = (p) =>
  `<a class="card" href="${rel(postPath(p))}"><p class="meta">${fmtDate(p.published)}${p.labels[0] ? ` · ${escapeHtml(p.labels[0])}` : ""}</p>` +
  `<h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.description)}</p></a>`;

// ---- build -------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (existsSync("images")) cpSync("images", join(OUT, "images"), { recursive: true });

// Home, paginated 20 per page.
const PER = 20;
const pages = Math.max(1, Math.ceil(posts.length / PER));
for (let i = 0; i < pages; i++) {
  const slice = posts.slice(i * PER, (i + 1) * PER);
  const path = i === 0 ? "" : `page/${i + 1}/`;
  const prev = i === 0 ? "" : `<a href="${rel(i === 1 ? "" : `page/${i}/`)}">&larr; Newer</a>`;
  const next = i === pages - 1 ? "" : `<a href="${rel(`page/${i + 2}/`)}">Older &rarr;</a>`;
  write(`${path}index.html`, page({
    title: BLOG.name, description: BLOG.tagline, path, image: posts[0]?.images[0]?.path,
    body: (i === 0 ? `<section class="hero-intro"><h1>${BLOG.name}</h1><p>${escapeHtml(BLOG.tagline)}</p></section>` : "") +
      (slice.map(card).join("\n") || "<p>First posts are on the way.</p>") +
      `<div class="pager"><span>${prev}</span><span>${next}</span></div>`,
    jsonLd: i === 0 ? { "@context": "https://schema.org", "@type": "WebSite", name: BLOG.name, url: SITE_URL + "/", description: BLOG.tagline } : null,
  }));
}

// Posts.
for (const p of posts) {
  const urlFor = (u) => (/^(https?:|mailto:|#)/i.test(u) ? u : rel(u));
  const blocks = embedImages(markdownToBlocks(p.body, urlFor), p.images);
  const related = posts.filter((o) => o !== p && o.labels.some((l) => p.labels.includes(l))).slice(0, 5);
  const tags = p.labels.map((l) => `<a class="tag" href="${rel(`tags/${slugify(l)}/`)}">${escapeHtml(l)}</a>`).join("");
  write(`${postPath(p)}index.html`, page({
    title: p.title, description: p.description, path: postPath(p), image: p.images[0]?.path, type: "article",
    body: `<article><h1>${escapeHtml(p.title)}</h1><p class="meta">Updated <time datetime="${p.published}">${fmtDate(p.published)}</time> ${tags}</p>\n${blocks.join("\n")}</article>` +
      (related.length ? `<aside class="related"><h2>Related fixes</h2><ul>${related.map((o) => `<li><a href="${rel(postPath(o))}">${escapeHtml(o.title)}</a></li>`).join("")}</ul></aside>` : ""),
    jsonLd: {
      "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.description,
      datePublished: p.published, dateModified: p.published, mainEntityOfPage: abs(postPath(p)),
      image: p.images.map((i) => abs(i.path)), author: { "@type": "Organization", name: BLOG.name, url: SITE_URL + "/" },
      publisher: { "@type": "Organization", name: BLOG.name },
    },
  }));
}

// Tags.
const labels = [...new Set(posts.flatMap((p) => p.labels))];
for (const l of labels) {
  const list = posts.filter((p) => p.labels.includes(l));
  write(`tags/${slugify(l)}/index.html`, page({
    title: `${l} fixes and how-tos`, description: `${BLOG.name} posts about ${l}.`, path: `tags/${slugify(l)}/`,
    body: `<section class="hero-intro"><h1>${escapeHtml(l)}</h1><p>${list.length} post${list.length === 1 ? "" : "s"}</p></section>${list.map(card).join("\n")}`,
  }));
}

write("about/index.html", page({
  title: "About", description: `About ${BLOG.name}.`, path: "about/",
  body: `<article><h1>About ${BLOG.name}</h1><p>${BLOG.name} publishes short, answer-first guides for everyday AI tools: how to fix common errors, find settings, and get more out of ChatGPT, Claude, Gemini, Copilot, and similar apps.</p>` +
    `<p>Posts are written and edited with the help of AI and checked against the tools' official help pages, which each post links. AI products change often, so menus and limits can differ from what you see. The official help page is the final word.</p>` +
    `<p>The illustrations are AI-generated diagrams that explain each fix. They are not screenshots of the real apps.</p>` +
    `<p>${BLOG.name} is independent and not affiliated with OpenAI, Anthropic, Google, Microsoft, or any other company whose products it covers.</p></article>`,
}));

write("404.html", page({ title: "Page not found", description: "Page not found.", path: "404.html", noindex: true,
  body: `<section class="hero-intro"><h1>Page not found</h1><p><a href="${rel("")}">Go to the latest fixes</a></p></section>` }));

// sitemap / feed / robots
const xml = (s) => escapeHtml(s).replace(/"/g, "&quot;");
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc>${posts[0] ? `<lastmod>${posts[0].published}</lastmod>` : ""}</url>
${posts.map((p) => `<url><loc>${abs(postPath(p))}</loc><lastmod>${p.published}</lastmod></url>`).join("\n")}
${labels.map((l) => `<url><loc>${abs(`tags/${slugify(l)}/`)}</loc></url>`).join("\n")}
<url><loc>${abs("about/")}</loc></url>
</urlset>
`);
write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${BLOG.name}</title><link>${SITE_URL}/</link><description>${xml(BLOG.tagline)}</description><language>${BLOG.lang}</language>
${posts.slice(0, 30).map((p) => `<item><title>${xml(p.title)}</title><link>${abs(postPath(p))}</link><guid>${abs(postPath(p))}</guid><pubDate>${new Date(p.published).toUTCString()}</pubDate><description>${xml(p.description)}</description></item>`).join("\n")}
</channel></rss>
`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (ADSENSE) write("ads.txt", `google.com, ${ADSENSE.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
write(".nojekyll", "");

console.log(`Built ${posts.length} post(s), ${labels.length} tag page(s) into ${OUT}/ for ${SITE_URL}`);
