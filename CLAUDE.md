# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository-specific working rules

- 所有沟通、状态更新和最终回复使用中文。
- 凡涉及新增功能、功能变更或代码修改的任务，必须先询问用户是否使用 Git Worktree；如果当前已经在某个 Git Worktree 中，则无需再次询问。
- 默认以 `main` 为主分支。
- 提交信息必须简洁、规范，并使用中英双语。
- Git commit message 必须包含：本次修改的总结性概述，以及结构化、有序的正文说明。
- Git commit message 正文必须使用真实换行、空行和空格排版，严禁使用 `\n`、`\t` 等转义字符模拟格式。

## Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.
Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.
1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.
Before implementing:
* State your assumptions explicitly. If uncertain, ask.
* If multiple interpretations exist, present them - don't pick silently.
* If a simpler approach exists, say so. Push back when warranted.
* If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First

Minimum code that solves the problem. Nothing speculative.
* No features beyond what was asked.
* No abstractions for single-use code.
* No "flexibility" or "configurability" that wasn't requested.
* No error handling for impossible scenarios.
* If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
3. Surgical Changes

Touch only what you must. Clean up only your own mess.
When editing existing code:
* Don't "improve" adjacent code, comments, or formatting.
* Don't refactor things that aren't broken.
* Match existing style, even if you'd do it differently.
* If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:
* Remove imports/variables/functions that YOUR changes made unused.
* Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.
4. Goal-Driven Execution

Define success criteria. Loop until verified.
Transform tasks into verifiable goals:
* "Add validation" → "Write tests for invalid inputs, then make them pass"
* "Fix the bug" → "Write a test that reproduces it, then make it pass"
* "Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Changelog 规范

- 仓库根目录维护一份 `CHANGELOG.md`，作为全部代码变更的唯一记录入口。
- 采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格：按版本/日期分组，使用 `Added`、`Changed`、`Fixed`、`Removed`、`Deprecated`、`Security` 等分类条目。
- 所有代码变更（含功能新增、功能调整、Bug 修复、重构、依赖或配置变化）都必须同步更新 `CHANGELOG.md`，与本次代码改动一并提交，不允许后补或漏写。
- 未发布的变更先记录在 `## [Unreleased]` 段落下；正式发版时再迁移到对应版本号与日期的小节。
- 条目描述需简洁、面向读者，必要时附加相关 Issue / PR 链接，避免出现 `\n`、`\t` 等转义字符。

## Release notes guidelines

These rules govern user-facing release notes (e.g. GitHub Release body), not the internal `CHANGELOG.md`. The changelog tracks what changed in the repo; release notes tell users what they get.

**Core principle**: write for the people USING this release, not for the people who BUILT it. Every entry should let a user answer "what do I get out of this?"

### Structure

```
# vX.Y.Z: three keywords that point at this release's focus
(optional) one-line opener

## 🎉 New features      — what you can now do
## ✨ Improvements       — same task, now smoother / faster / better-looking
## 🐛 Bug fixes          — what was broken, now fixed
## ⚠️ Heads-up           — behavior changed, or you need to do something (only when present, pinned to the top)
```

### Writing rules

1. **Write from the user's perspective, not the developer's.** Neutral phrasing ("Adds XX", "Now supports XX") or second-person ("You can now XX") are both fine — pick per product tone. AVOID "We + verb": it shifts the focus from what the user perceives to what the team did.
   - ❌ "We rewrote search"
   - ✅ "Search now matches Chinese synonyms"
2. **Describe the OUTCOME, not the work.**
   - ✅ "100k-row reports open in under 1 second"
   - ❌ "Optimized rendering performance"
3. **Bug fixes must name the scenario.**
   - ✅ "Fixed occasional failure when exporting Excel files over 1000 rows"
   - ❌ "Fixed export bug"
4. **The title states this release's focus**, not "vX.Y.Z released".
5. **Zero code, zero jargon.** Component names / tech stack / PR numbers belong in the PR description, not in user-facing notes.
6. **New features include a screenshot/GIF placeholder**: `[📷 Screenshot: description]` / `[🎬 GIF: description]`.

### Breaking-change three-layer rule

Any change that will annoy users or require them to take action MUST include all three layers:

- **Why it changed** — a reason a user can understand, not a technical one.
- **What the new rule is** — specific: where to click, what to see.
- **What you should do** — the clear next step.

For things users hand-write (config keys, URLs, command flags), provide a `before → after` comparison. This is the ONLY place "code snippets" are allowed in user-facing notes.

### Forbidden

- ❌ Empty marketing words: "revolutionary", "all-new", "ultimate".
- ❌ Listing every commit. When there are more than 10 fixes, group them: "This release fixes N reported issues, [view full list]".
- ❌ Passive voice that dodges responsibility: "Some issues occurred and have been resolved".

### Length reference

- Patch: 50–150 words, 0–1 screenshots.
- Minor: 200–400 words, 1–3 screenshots.
- Major: 400–800 words plus a highlights section, 3–5 screenshots.

### Pre-publish checklist

- [ ] Written from the user's perspective (no "We + verb")?
- [ ] Every fix names a scenario?
- [ ] No jargon, no marketing fluff, no PR numbers?
- [ ] If there are breaking changes, all three layers present and pinned to the top?
- [ ] Version bump matches the content (a release with breaking changes is not a minor)?

## Common commands

### Backend

- Create venv and install backend deps:
  - `python3 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`
- Run API locally:
  - `source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend`
- Run all backend tests:
  - `source .venv/bin/activate && python -m pytest backend/tests -q`
- Run a single backend test file:
  - `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py -q`
- Run one backend test case:
  - `source .venv/bin/activate && python -m pytest backend/tests/test_settings_api.py::test_get_settings -q`

### Frontend

- Install deps:
  - `npm --prefix frontend install`
- Start Vite dev server:
  - `npm --prefix frontend run dev`
- Typecheck/build:
  - `npm --prefix frontend run build`
- Typecheck only:
  - `npm --prefix frontend run typecheck`
- Run all frontend source tests:
  - `cd frontend && node --test tests/*.test.ts`
- Run a single frontend test:
  - `cd frontend && node --test tests/entryPage.test.ts`

### Desktop

- Install desktop deps:
  - `source .venv/bin/activate && pip install -r backend/requirements-desktop.txt && npm --prefix desktop install`
- Run desktop dev mode:
  - `npm --prefix desktop run dev`
- Typecheck desktop shell:
  - `npm --prefix desktop run typecheck`
- Run all desktop tests:
  - `node --test desktop/tests/*.test.ts`
- Run a single desktop test:
  - `node --test desktop/tests/update-controller.test.ts`
- Package Electron app:
  - `npm --prefix desktop run make`
- Build macOS DMGs:
  - `npm --prefix desktop run make:dmg:arm64`
  - `npm --prefix desktop run make:dmg:x64`
  - `npm --prefix desktop run make:dmg`

### Health check

- Backend health endpoint:
  - `curl http://127.0.0.1:8000/health`

## High-level architecture

This is a local-first monorepo with three runtime layers:

1. `backend/`: FastAPI + SQLAlchemy + SQLite service
2. `frontend/`: React 18 + Vite + TypeScript SPA
3. `desktop/`: Electron shell that packages the frontend and launches the backend as a local sidecar

The product is desktop-first for end users, but the same backend/frontend also run in local web development mode.

## Backend architecture

- FastAPI entrypoint is `backend/app/main.py`.
- App startup does three important things in the lifespan hook:
  - initializes the SQLite schema and default seed data
  - creates a daily snapshot immediately on boot
  - starts APScheduler jobs
- API routes are mounted under `/api/v1` in `backend/app/api/v1/__init__.py`.
- The backend also serves the built frontend when `HBS_FRONTEND_DIST_DIR` is set, so packaged desktop mode and same-origin hosting both use the FastAPI process as the app server.
- Error handling is centralized: custom `AppError` codes map to HTTP status in `backend/app/main.py`.

### Backend data flow

- Bootstrap logic in `backend/app/services/bootstrap.py` creates:
  - default family
  - default settings
  - curated asset/liability category trees
- Holdings are the core source of truth.
- Snapshot generation in `backend/app/services/snapshot_service.py` converts current holdings into stored daily/event snapshots.
- Analytics endpoints read snapshot payloads instead of recomputing everything directly from raw UI state.
- Scheduler jobs in `backend/app/jobs/scheduler.py` run daily FX refresh and daily snapshot creation using the business timezone from settings.

### Backend domain areas

- `app/api/v1`: thin HTTP layer
- `app/services`: CRUD, import, snapshot, settings, FX and business workflows
- `app/analytics`: trend, volatility, correlation, rebalance, sankey, currency overview calculations
- `app/models` + `app/schemas`: persistence models and API contracts
- `app/jobs`: scheduled background jobs

## Frontend architecture

- Frontend entry is `frontend/src/main.tsx`.
- Router switches by runtime:
  - desktop uses `HashRouter`
  - web dev/browser mode uses `BrowserRouter`
- `frontend/src/App.tsx` lazy-loads page-level routes inside a shared `AppShell`.
- Main top-level pages are overview, analytics, entry, members, import, and settings.
- Data fetching is standardized through React Query.
- API access is centralized in `frontend/src/services/apiClient.ts`.

### Frontend runtime model

- In browser/web mode, services call `fetch(${apiBaseUrl}/...)`.
- In desktop mode, the same service layer goes through the preload bridge (`__HBS_DESKTOP__`) instead of direct browser fetch.
- `frontend/src/config/runtime.ts` resolves the API base URL in this priority order:
  1. injected runtime config
  2. `VITE_API_BASE_URL`
  3. current window origin `/api/v1` fallback in production-like browser mode
  4. default `http://127.0.0.1:8000/api/v1`

### Frontend structure

- `src/pages`: page containers and route-level UI
- `src/components/layout`: shell, sidebar, desktop update notice
- `src/components/charts`: ECharts wrappers and analytics visualizations
- `src/components/ui`: base reusable UI components
- `src/services`: API wrappers and query invalidation helpers
- `src/types`: shared frontend contracts mirroring backend responses

## Desktop architecture

- Electron main process entry is `desktop/src/main.ts`.
- Desktop startup flow is:
  1. allocate a free localhost port
  2. build desktop-specific backend environment variables
  3. launch the FastAPI backend sidecar
  4. poll `/health` until ready
  5. create the BrowserWindow and load the app
- Packaged mode runs the PyInstaller-built backend binary.
- Dev mode runs `backend/desktop_server.py` through the local Python interpreter.
- The desktop shell passes the resolved API base URL into the renderer via `additionalArguments` and the preload bridge.
- Desktop also owns app update flow, startup loading/error pages, and packaging scripts.

### Desktop packaging model

- Frontend is built to `frontend/dist`.
- Desktop packaging stages frontend assets and a PyInstaller onedir backend into Electron resources.
- Final distributable output goes to `desktop/out/release/`; raw Forge output goes to `desktop/out/make/`.
- On Apple Silicon, multi-arch release builds may require a second x64 Python environment in `.venv-x64` or `HBS_DESKTOP_PYTHON_X64`.

## Important product constraints

- Analytics logic stays in handwritten Python modules; do not introduce pandas/numpy unless explicitly requested.
- `fx_provider` is fixed to `frankfurter`.
- Settings timezone is effectively read-only in UI and drives scheduler/business-date behavior.
- Navigation order is fixed: `总览 -> 分析看板 -> 资产负债录入 -> 成员管理 -> CSV导入 -> 设置`.
- Correlation matrix missing values must remain missing (`N/A` / 样本不足), not coerced to `0`.
- Desktop delivery is macOS-first and must keep the friendly startup/loading experience while the local backend becomes ready.

## Testing notes

- Backend tests live in `backend/tests/test_*.py` and use `pytest`.
- Frontend tests are lightweight `node --test` source-level checks under `frontend/tests`.
- Desktop tests are also `node --test` checks under `desktop/tests`.
- For frontend changes, at minimum run `npm --prefix frontend run build`.
- For desktop/runtime-path changes, verify both desktop tests and backend tests that cover desktop hosting/startup paths.
