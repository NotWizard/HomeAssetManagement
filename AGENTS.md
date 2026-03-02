# Repository Guidelines

## Project Structure & Module Organization
This repository is a local web monorepo with two apps:
- `backend/`: FastAPI service. Key modules are `app/api/v1` (routes), `app/services` (business logic), `app/analytics` (trend/volatility/correlation/rebalance), `app/jobs` (scheduled tasks), and `app/models` + `app/schemas` (data layer/contracts).
- `frontend/`: React + Vite client. Main UI is in `src/pages`, reusable charts in `src/components/charts`, API wrappers in `src/services`, and shared types in `src/types`.
- `backend/tests/`: pytest test suite.
- `docs/plans/`: PRD, technical solution, and implementation planning docs.

## Build, Test, and Development Commands
- Backend setup: `python3 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`
- Run backend: `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend`
- Frontend setup: `npm --prefix frontend install`
- Run frontend: `npm --prefix frontend run dev`
- Backend tests: `source .venv/bin/activate && python -m pytest backend/tests -q`
- Frontend build/typecheck: `npm --prefix frontend run build`

## Coding Style & Naming Conventions
- Python: 4-space indentation, type hints, `snake_case` for functions/variables, `PascalCase` for classes.
- React/TypeScript: `PascalCase` component/page filenames (e.g., `AnalyticsPage.tsx`), `camelCase` for functions/hooks.
- Keep API contracts aligned between `backend/app/schemas` and `frontend/src/types`.
- Prefer small service functions over route-heavy business logic.

## Testing Guidelines
- Use `pytest` for backend behavior and API tests.
- Test files follow `test_*.py` naming under `backend/tests/`.
- Add or update tests for analytics, import upsert logic, and holdings CRUD side effects (snapshots).
- For frontend changes, at minimum ensure `npm --prefix frontend run build` passes.

## Commit & Pull Request Guidelines
- Follow concise conventional prefixes seen in history: `feat:`, `docs:` (and `fix:`, `chore:`, `test:` when appropriate).
- Keep commit messages imperative and scoped to one logical change.
- PRs should include: summary, changed areas (`backend`/`frontend`), verification commands run, and screenshots for UI changes.

## Security & Configuration Tips
- Run services on localhost (`127.0.0.1`) only.
- Configure via `.env` using `HAM_` prefixes (see `backend/app/core/config.py`).
- Do not commit local artifacts (`.venv`, `node_modules`, SQLite DB files, import error CSVs).

## Agent-Specific Instructions
- All conversation, status updates, and final responses for this repository must be in Chinese.
