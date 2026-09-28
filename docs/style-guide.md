# PromptFix style guide

Blog: PromptFix. Quick fixes and how-tos for the AI tools people use every
day (ChatGPT, Claude, Gemini, Microsoft Copilot, Perplexity, Midjourney and
similar). Readers: US, English, non-experts who hit a problem and searched
Google for the fix. Written in English.

## Voice
- Plain American English. Short paragraphs (1-3 sentences). Concrete verbs:
  click, open, type, turn on, sign out. Not "leverage", "utilize", "navigate".
- Second person ("Open Settings"). No filler intro, no "In this post we'll".
- Never repeat a point to hit a word count. 700-1200 words is normal; a
  short fix can be shorter.
- Never use: em dash, "moreover", "furthermore", "in essence", "it's worth
  noting", "dive into", "navigate", "landscape", "realm", "unlock",
  "elevate", "seamless", "delve", "game-changer", "supercharge", "Ultimate
  Guide", "Everything You Need to Know".

## Honesty rules (non-negotiable)
- Never write "I tested", "I tried", "in my experience". Nobody on the team
  tested the steps by hand unless a person says so and adds it.
- AI products change their menus often. Give an exact menu path only when
  it matches the official help page you link; otherwise describe what to
  look for. Say "at the time of writing" for plans, limits, and prices.
- Never invent error message text, limits, prices, or release dates.
- Link 1-3 official help or status pages (help.openai.com,
  support.anthropic.com, support.google.com, support.microsoft.com,
  status pages). A help-center root beats a guessed deep link.
- Images are AI-generated diagrams, captioned as such, never passed off as
  real screenshots.

## Post structure (in this order)
1. **Answer first.** The first paragraph gives the fix in 1-2 sentences.
   Example: "ChatGPT's 'network error' on long answers usually means the
   response timed out. Ask for the answer in shorter parts, or click
   Regenerate after a refresh."
2. `> Works in:` callout: which apps, platforms (web, iOS, Android, desktop),
   and plans the steps cover, "at the time of writing".
3. `## Why this happens` — 2-4 sentences on the cause, in plain words.
4. `## How to fix it` (or `## Steps` for a how-to) — numbered list, one
   action per step, menu names in **bold**. Split platforms with
   `### On the web` / `### On iPhone and Android` when they differ.
5. `## Troubleshooting` — 3-5 `### Symptom` headings, each with cause + fix
   in 1-3 sentences.
6. `## FAQ` — 2-4 short questions people also search (`### Question?`).
   No summary or "Conclusion" section after it.

## Titles
- Close to what people type: "How to Fix ChatGPT 'Network Error' on Long
  Answers", "How to Delete Your Gemini Activity". Tool name + task/error.
- Under 70 characters. No colon subtitles, emoji, clickbait, year stuffing.

## Markdown the site understands
`## H2`, `### H3`, `- bullets`, `1. numbered`, `> callout`, `| pipe | tables |`,
```` ``` ```` fenced code blocks (for prompts to copy), inline `` `code` ``,
`**bold**`, `*italic*`, `[link](url)`.

## Images (designer)
Two GPT images per post, both flat vector explainer illustrations that
explain the post's content in detail:
1. **Top (og:image):** the fix as a visual step-by-step, 3-5 numbered panels
   with icons and short labels from the post.
2. **Before Troubleshooting:** a diagram of why the problem happens or how
   the feature works (cause -> effect, before/after, what goes where).
Rules: at most 6 labels, 4 words each; generic UI, no real logos or copied
product screens, no faces. Alt text is unique, 10-18 words, describes what is
shown, main keyword at most once. Caption: "AI-generated illustration".
