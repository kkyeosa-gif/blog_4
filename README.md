# PromptFix

Quick fixes and how-tos for the AI tools you use every day. English, US
readers, a static site on GitHub Pages. Five posts a day, written by an
automated content team (Claude) with GPT-generated explainer illustrations.

## How it runs

| When (ET) | Workflow | What happens |
| --- | --- | --- |
| 6:41am daily | Generate posts | Tops `posts/ready/` up to 5 posts: writer -> editor (fact check) -> designer (2 image scenes), then GPT makes the images |
| 8am, 11am, 1pm, 4pm, 8pm | Publish and deploy site | Moves the next ready post to `posts/published/`, rebuilds the site, deploys to Pages |

- `posts/ready/` — queue, published oldest file name first
- `posts/published/` — live posts (the site is built from these)
- `images/<post>/` — GPT illustrations, `<title-slug>-1.jpg` (top) and `-2.jpg`
- `.claude/agents/` — content team: researcher -> hook-writer -> script-writer -> designer -> publisher (+ manager, analyst)
- `docs/style-guide.md` — voice, honesty rules, post structure, image rules
- `tasks/topics-seed.md`, `tasks/briefs.md` — read by every automated post; edit them to steer topics
- Problems (failed run, post held for missing images, empty queue) open a GitHub issue labeled `alert`.

## Setup (once)

1. **Default branch**: make the branch with these files the default (Settings > General), or merge it into `main`. Scheduled workflows only run on the default branch.
2. **Secrets** (Settings > Secrets and variables > Actions > Secrets):
   - `ANTHROPIC_API_KEY` — writes and edits posts
   - `OPENAI_API_KEY` — generates images (gpt-image-1)
3. **Pages**: Settings > Pages > Source: **GitHub Actions**.
4. First run: Actions > **Generate posts** > Run workflow, then Actions > **Publish and deploy site** > Run workflow with "force" checked.
5. Optional variables (Settings > Secrets and variables > Actions > Variables):
   - `SITE_URL` — custom domain, e.g. `https://promptfix.com` (default `https://<owner>.github.io/blog_4`)
   - `ADSENSE_CLIENT` — `ca-pub-...` adds the AdSense script and `ads.txt` (ads.txt only counts at a domain root, so use a custom domain)
   - `GOOGLE_SITE_VERIFICATION` — Search Console HTML-tag token
   - `CLAUDE_MODEL` (default `claude-sonnet-5`), `OPENAI_IMAGE_MODEL` (default `gpt-image-1`), `OPENAI_IMAGE_QUALITY` (default `medium`)

## Cost (rough)
Per day: 15 Claude calls (5 posts x writer/editor/designer) plus 10 images at
medium quality. Check current prices on each provider's pricing page.

## Local
```
node scripts/build-site.mjs   # builds _site/ from posts/published
```
