# AGENTS.md — 出願神器 (Shutsugan Shinki)

> 给 AI 编码 agent 的项目说明。动手前请先读完本文件。
> Read this fully before editing. Keep changes minimal and scoped to what was asked.

## What this is
AI generator for Japanese university application documents — 志望理由書 and 研究計画書 — for Nissin Art Academy (日新美術学院). Users are Chinese students applying to Japanese (mostly art) universities. One wizard engine drives two modules; questions surface dynamically by 区分 (学部 / 大学院 / 研究生) × 系 (美术系 / 一般).

## Stack — do not change without being asked
- Frontend: plain HTML/CSS/JS. **No framework, no bundler, no build step.** Scripts load via `<script>` tags in `index.html`.
- Backend: a single Vercel serverless function `api/generate.js` (Node 18+, ESM, native `fetch`). Proxies to Google Gemini (primary) and Anthropic (fallback).
- Deploy: Vercel, zero-config. A git push to the connected branch auto-deploys.
- **Zero npm dependencies.** Do NOT add React / Next / Vite / Tailwind / any package unless explicitly told to.

## File map
- `index.html` — shell. Loads fonts, then `templates.js`, then `app.js` (order matters).
- `styles.css` — all styling. **Colors live as CSS variables in `:root` at the top.** Theme: gold `#e6c068` on deep indigo `#080b1e`.
- `templates.js` — **the DATA layer; edit here to change questions.**
  - `Q` — 志望理由書 intake question bank
  - `KENKYU_Q` — 研究計画書 intake question bank
  - `SHIBO_PROMPTS` — recommended 設問 (output structure) per category
  - `shiboQuestions(level, art)` / `kenkyuQuestions()` — which question ids appear
  - `MODULES` — module registry (name, defaultLimit, steps)
- `app.js` — the wizard engine.
  - state machine: `setup → intake → followup → result`
  - `el()` — DOM helper; `render()` — the ONLY entry point that clears and redraws `#app`
  - `buildContext()` — assembles student material into the prompt
  - `doFollowup()` / `doGenerate()` — the two AI calls; **system prompts are inline here**
  - `parseJSON()` — tolerant parser for the model's JSON output
- `api/generate.js` — serverless proxy. Reads keys from env. Keys appear nowhere else.

## Hard rules (do not break)
1. **Never hardcode API keys or expose them to the frontend.** Keys live only in Vercel env vars (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) and are read only inside `api/generate.js`.
2. Keep it a no-build static site + one serverless function.
3. **The product must not fabricate.** System prompts forbid inventing facts the student didn't provide and forbid clichés (e.g. 「私は幼い頃から」). Preserve these constraints when editing any prompt.
4. UI copy is Chinese-primary with Japanese terms in small text; output documents are Japanese (+ optional Chinese translation). Keep this split.
5. **All re-renders must go through `render()`** (it clears `#app` first). Never call `renderSetup` / `renderIntake` / `renderFollowup` / `renderResult` directly — that stacks duplicate panels. This was a real past bug.

## Common edits — how to do them
- **Add an intake question:** add one entry to `Q` (or `KENKYU_Q`) in `templates.js`, then add its `id` to the right list in `shiboQuestions()` / `kenkyuQuestions()`. Nothing else to wire.
- **Add a 設問 option:** push to the relevant array in `SHIBO_PROMPTS`.
- **Change colors / spacing:** edit the `:root` variables in `styles.css`. Don't scatter hardcoded colors.
- **Change the AI model:** do NOT edit code — set `GEMINI_MODEL` / `ANTHROPIC_MODEL` env vars in Vercel.
- **Tweak tone / structure of the generated essay:** edit the `system` string and prompt builder inside `doGenerate()` in `app.js`. Keep rule #3.

## Verify before you finish
1. `node --check api/generate.js templates.js app.js` — must pass with no errors.
2. `vercel dev` with a `.env.local` (copy `.env.example`), then click through the full flow: home → pick module → setup → intake → AI 追问 → 成稿. Confirm: no duplicate panels, the 字数 counter updates, switching 区分 refreshes the question set, copy/download work.
3. State what you changed and why. Don't refactor unrelated code.

## Deploy
Push to the connected branch; Vercel rebuilds automatically. After changing env vars, trigger a manual redeploy so they take effect.
