# FlowLens

FlowLens is a lightweight AI workflow analysis tool. Paste a description of your day-to-day work, and it identifies the tasks that are **repetitive, time-consuming, and rule-driven** — the best candidates for automation — then turns that vague feeling into an actionable plan.

For each automatable task, FlowLens outputs:

- **Priority score** (0–100) weighted across three dimensions (repetition / time cost / rule clarity)
- **Automation suggestions**
- **SOP** (trigger / inputs / steps / output)
- **Reusable prompt** you can copy into an AI assistant

Everything runs **entirely in the browser** — no backend, no database, no LLM calls, no API keys. Analysis is instant and deterministic: the same input always produces the same output.

## How it works

1. Enter a short description of your daily work (or click **填入示例** / "Load example").
2. Click **开始分析** / "Analyze".
3. The engine splits the text into task segments, matches each against three keyword dictionaries (frequency, manual-effort, and rule-clarity), scores and ranks them, and renders the results as cards.

## Running locally

```bash
# install dependencies
npm install

# start the dev server
npm run dev
# open http://localhost:3000

# production build
npm run build
npm run start
```

Run the engine smoke test (no UI needed):

```bash
npm run smoke
```

## Tech stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4**

The analysis engine is a set of pure functions under `lib/` (`types.ts`, `rules.ts`, `templates.ts`, `analyzer.ts`) with no side effects, exposed through a single `analyze(text)` entry point and a typed data contract (`AnalysisResult`).

## Known limitations

- **Rule-based, not semantic.** Matching is keyword-driven, so it cannot understand context or paraphrase. It may miss automatable tasks that use different wording, or flag a segment purely because it contains a trigger word.
- **No LLM / no learning.** Suggestions, SOPs, and prompts are generated from templates rather than reasoned from the input. Output quality is bounded by the keyword dictionary's coverage.
- **Heuristic scoring.** Priority scores and "hours saved per week" are rough estimates, not measurements.
- **No persistence.** Results live only in the current session; refreshing the page loses your input and analysis history.
- **Single page, single user.** No routing, accounts, authentication, or multi-user features.
- **Chinese-only UI.** The interface is hardcoded in Chinese (this README and the code comments aside).
- **No dark mode / i18n / file upload.** Intentionally out of scope for the MVP.
