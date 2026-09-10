# FlowLens

FlowLens is a lightweight AI workflow analysis tool. Paste a description of your day-to-day work, and it identifies the tasks that are **repetitive, time-consuming, and rule-driven** — the best candidates for automation — then turns that vague feeling into an actionable plan.

For each automatable task, FlowLens outputs:

- **Priority score** (0–100) weighted across three dimensions (repetition / time cost / rule clarity)
- **Judgement rationale** — why this task was flagged as automatable
- **Automation suggestions**
- **SOP** (trigger / inputs / steps / output)
- **Reusable prompt** you can copy into an AI assistant

## How it works

1. Enter a short description of your daily work (or click **填入示例** / "Load example").
2. Click **开始分析** / "Analyze".
3. The text is sent to a server-side function, which asks an LLM on the deployment platform's edge to segment the description, score each task, and write up the suggestions, SOP and prompt under a strict JSON schema.
4. **If the model path is unavailable for any reason** — network error, timeout, malformed output, or exhausted free quota — FlowLens automatically falls back to a **local rule-based engine** bundled into the page itself, and labels the result as such. Analysis never fails outright.
5. Every completed analysis is saved to your browser's local storage so you can revisit it later.

The two paths are labelled in the UI: **AI 分析** (model) vs **本地规则分析** (fallback).

## Tech stack

- **Next.js 16** (App Router, static export)
- **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **Cloudflare Pages Functions** + **Workers AI**

There are **no API keys** in this repository. The model is reached through a runtime binding (`env.AI`) that Cloudflare injects server-side; nothing secret is stored, embedded, or shipped to the browser.

## Running locally

```bash
npm install

# Frontend only. The serverless function is absent, so analysis
# automatically falls back to the local rules engine.
npm run dev
# open http://localhost:3000
```

To exercise the **real model path** locally you need a Cloudflare account with Workers AI access:

```bash
# Builds, then serves static assets + the Pages Function with a live AI binding
npm run dev:full
```

Other scripts:

```bash
npm run smoke       # smoke tests: engine, output validation, fallback, history
npm run snapshot    # render every component to static HTML (for diffing)
npm run typecheck   # type-checks both the app and the serverless function
npm run build       # production build → out/
```

## Deploying

Deployed as a **Cloudflare Pages** project:

- Build command: `npm run build`
- Output directory: `out`
- **Required**: add a **Workers AI binding** named `AI` under *Settings → Functions → Workers AI binding*. Without it the deployed site still works, but every analysis will take the fallback path.

## Known limitations

- **Depends on a free tier.** The model path runs on Workers AI's free allocation (10,000 neurons/day, shared account-wide, resets daily at 00:00 UTC). When it runs out, requests fail and FlowLens falls back to the rule engine. There is no paid fallback configured, and the free quota is not guaranteed by the provider.
- **Non-deterministic.** On the model path, the same input can produce different output across runs. (The rule-based fallback *is* deterministic — the same input always yields the same result.)
- **Structured output is enforced defensively, not guaranteed.** The model is asked to follow a JSON schema, but the provider does not guarantee compliance. Every response is validated and repaired server-side; anything unusable triggers the fallback rather than reaching the page.
- **The fallback engine is still keyword-based.** When degraded, the original limitations apply: it matches keywords by substring, so it can miss tasks that are paraphrased and can flag a segment purely because it happens to contain a trigger word.
- **Heuristic scoring.** Priority scores and the "hours saved per week" estimate are rough estimates — from the model or from the rule engine — not measurements.
- **History is local only.** Analysis history lives in your browser's `localStorage`. It does not sync across devices or browsers, clearing site data erases it, and it is unavailable in private/incognito windows. Only the most recent **50** entries are kept.
- **No persistence beyond that.** No backend database, no accounts, no authentication.
- **Single page, Chinese-only UI.** No routing, no internationalisation, no dark mode, no file upload.

## License

MIT — see [LICENSE](./LICENSE).
