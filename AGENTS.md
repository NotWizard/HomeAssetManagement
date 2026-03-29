# Repository Guidelines

## Project Structure & Module Organization
This repository is a local-first monorepo with three app layers:
- `backend/`: FastAPI service. Key modules are `app/api/v1` (routes), `app/services` (business logic), `app/analytics` (trend/volatility/correlation/rebalance), `app/jobs` (scheduled tasks), and `app/models` + `app/schemas` (data layer/contracts).
- `frontend/`: React + Vite client (`Tailwind CSS + shadcn/ui`). Main UI is in `src/pages`, app layout in `src/components/layout`, reusable charts in `src/components/charts`, base UI components in `src/components/ui`, API wrappers in `src/services`, and shared types in `src/types`.
- `desktop/`: Electron desktop shell. Key files are `src/main.ts` (main process), `src/preload.ts` (runtime bridge), `src/startup-page.ts` (desktop startup/error pages), `scripts/` (backend build and staging), and `tests/` (desktop behavior tests).
- `backend/tests/`: pytest test suite.
- `frontend/tests/`: lightweight node-based source verification tests.
- `docs/plans/`: PRD, technical solution, and implementation planning docs.

## Build, Test, and Development Commands
- Backend setup: `python3 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`
- Run backend: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend`
- Frontend setup: `npm --prefix frontend install`
- Run frontend: `npm --prefix frontend run dev`
- Desktop setup: `source .venv/bin/activate && pip install -r backend/requirements-desktop.txt && npm --prefix desktop install`
- Backend tests: `source .venv/bin/activate && python -m pytest backend/tests -q`
- Frontend build/typecheck: `npm --prefix frontend run build`
- Frontend source tests: `cd frontend && node --test tests/*.test.ts`
- Desktop typecheck/tests: `npm --prefix desktop run typecheck` and `node --test desktop/tests/*.test.ts`
- Desktop package: `npm --prefix desktop run make`

## Coding Style & Naming Conventions
- Python: 4-space indentation, type hints, `snake_case` for functions/variables, `PascalCase` for classes.
- React/TypeScript: `PascalCase` component/page filenames (e.g., `AnalyticsPage.tsx`), `camelCase` for functions/hooks.
- Keep API contracts aligned between `backend/app/schemas` and `frontend/src/types`.
- Prefer small service functions over route-heavy business logic.

## Current Product Decisions (Keep Consistent)
- Analytics math stays in handwritten Python logic (do **not** migrate to pandas/numpy unless explicitly requested).
- Settings `fx_provider` is fixed to `frankfurter`, and is read-only in UI and non-updatable in API payload.
- Settings timezone is read-only in UI and defaults to local machine/browser timezone; backend business date/time uses settings timezone for scheduler and daily jobs.
- Base currency field label is `基准币种`, shown as a dropdown with `CODE + 中文名称` options (e.g., `CNY 人民币`, `USD 美元`).
- Correlation matrix `None` values must render as missing (`N/A/样本不足`), not coerced to `0`.
- App error responses are code-based and map HTTP status by code (`4040->404`, `4090->409`, `5000->500`, others `400`).
- Navigation order is fixed as `总览 -> 分析看板 -> 资产负债录入 -> 成员管理 -> CSV导入 -> 设置`.
- Navigation includes an independent `成员管理` page; sidebar and top header should keep sticky behavior while scrolling.
- Sidebar footer should not show `本地模式 / 无登录` style helper copy.
- Analytics date-range filtering should use a full-card, desktop-friendly trigger; users should be able to click the whole time-range area instead of only a small icon.
- Desktop delivery is macOS-first via `Electron + FastAPI sidecar + PyInstaller onedir`; packaged startup should show a friendly loading page while the local backend becomes ready.

## Testing Guidelines
- Use `pytest` for backend behavior and API tests.
- Test files follow `test_*.py` naming under `backend/tests/`.
- Add or update tests for analytics, import upsert logic, and holdings CRUD side effects (snapshots).
- For frontend changes, at minimum ensure `npm --prefix frontend run build` passes.

## Commit & Pull Request Guidelines
- Default branch is `main`; unless explicitly requested otherwise, branch from and merge back to `main`.
- Follow concise conventional prefixes seen in history: `feat:`, `docs:` (and `fix:`, `chore:`, `test:` when appropriate).
- Keep commit messages imperative and scoped to one logical change.
- Git commit messages must be structured and clear, and both the subject line and body should be written bilingually in Chinese and English. The subject line should place Chinese first and English after it; the body should write the full Chinese section first and then the full English section below it, rather than alternating Chinese and English sentence by sentence. The body must use real line breaks, blank lines, and actual spaces for indentation, and must not use literal escape text such as `\n` or `\t` to simulate formatting. When needed, add a body that explains the background, key changes.
- PRs should include: summary, changed areas (`backend`/`frontend`), verification commands run, and screenshots for UI changes.

## Security & Configuration Tips
- Run services on localhost (`127.0.0.1`) only.
- Configure via `.env` using `HBS_` prefixes (see `backend/app/core/config.py`).
- Do not commit local configuration files (`.env`, `.env.*`) or local artifacts (`.venv`, `node_modules`, SQLite DB files, import error CSVs, `frontend/tsconfig.tsbuildinfo`, `desktop/out`, `desktop/.stage`, `backend/dist-desktop`, `backend/build-desktop`, `backend/.pyinstaller`).

## Agent-Specific Instructions
- All conversation, status updates, and final responses for this repository must be in Chinese.
- Any feature change, bug fix, or code modification in this repository must be done in a newly created git worktree first; do not edit directly in the primary workspace.
- Unless the user explicitly requests otherwise, all spawned subagents in this repository must use the `gpt-5.4` model by default.
- When a task can be safely parallelized or delegated, prefer using subagents as much as practical to improve execution efficiency.
