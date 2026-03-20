# Household Balance Sheet V1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete local-only web app for household asset/liability management with CSV import, FX conversion, snapshots, analytics, ECharts visualizations, and rebalance alerts.

**Architecture:** Use a monorepo with FastAPI backend and React frontend. Backend owns all persistence, calculations, and scheduled jobs; frontend focuses on data entry and visualization. SQLite is used for local storage with deterministic services and testable analytics modules.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Pydantic, APScheduler, pandas/numpy, pytest; React 18, TypeScript, Vite, Ant Design, ECharts, TanStack Query.

---

### Task 1: Repository Scaffolding

**Files:**
- Create: `backend/`, `frontend/` base structure and config files
- Modify: `docs/plans/household-balance-sheet-technical-solution.md`
- Test: `backend/tests/test_smoke.py`

**Step 1: Write the failing test**
- Create `backend/tests/test_smoke.py` expecting app import and `/health` route.

**Step 2: Run test to verify it fails**
- Run: `pytest backend/tests/test_smoke.py -q`
- Expected: FAIL because app modules don't exist.

**Step 3: Write minimal implementation**
- Create FastAPI app skeleton with `/health` endpoint.

**Step 4: Run test to verify it passes**
- Run: `pytest backend/tests/test_smoke.py -q`
- Expected: PASS.

**Step 5: Commit**
- `git add backend frontend docs/plans`
- `git commit -m "chore: scaffold backend and frontend projects"`

### Task 2: Data Layer and Core Domain

**Files:**
- Create: `backend/app/models/*.py`, `backend/app/core/database.py`, `backend/app/services/*`
- Create: `backend/tests/test_rebalance_service.py`
- Create: `backend/tests/test_import_service.py`

**Step 1: Write failing tests**
- Rebalance threshold and net-asset edge cases.
- CSV upsert semantics by composite key.

**Step 2: Verify red**
- Run targeted tests and confirm expected failures.

**Step 3: Minimal implementation**
- Implement models, repositories, and services needed for tests.

**Step 4: Verify green**
- Re-run targeted tests and ensure pass.

**Step 5: Commit**
- Commit backend data/service implementation.

### Task 3: API Layer and Snapshot/FX Flows

**Files:**
- Create: `backend/app/api/v1/*.py`
- Create: `backend/tests/test_holdings_api.py`
- Create: `backend/tests/test_fx_service.py`

**Step 1: Write failing tests**
- Holdings CRUD response semantics and snapshot side effects.
- FX fallback to latest historical cached rate.

**Step 2: Verify red**
- Run specific tests and validate failures are due to missing behavior.

**Step 3: Minimal implementation**
- Add API routers, input validation, transaction-safe write + event snapshot.
- Add FX provider abstraction and fallback behavior.

**Step 4: Verify green**
- Run tests and ensure all added tests pass.

**Step 5: Commit**
- Commit API routes and FX/snapshot integration.

### Task 4: Analytics and Scheduler

**Files:**
- Create: `backend/app/analytics/*.py`, `backend/app/jobs/*.py`
- Create: `backend/tests/test_analytics.py`

**Step 1: Write failing tests**
- Volatility annualization, correlation matrix shape, trend generation.

**Step 2: Verify red**
- Run analytics tests and confirm failure.

**Step 3: Minimal implementation**
- Implement analytics modules from `snapshot_daily`.
- Implement APScheduler jobs for daily FX and daily snapshot.

**Step 4: Verify green**
- Run analytics tests to pass.

**Step 5: Commit**
- Commit analytics and scheduler implementation.

### Task 5: Frontend UI and Visualization

**Files:**
- Create: `frontend/src/pages/*`, `frontend/src/components/charts/*`, `frontend/src/services/*`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`

**Step 1: Write failing checks**
- Typecheck/build command currently fails because UI files absent.

**Step 2: Verify red**
- Run: `npm --prefix frontend run build`
- Expected: FAIL initially.

**Step 3: Minimal implementation**
- Implement all 5 pages and chart components with ECharts.

**Step 4: Verify green**
- Run build/typecheck successfully.

**Step 5: Commit**
- Commit frontend implementation.

### Task 6: Verification and Documentation

**Files:**
- Create: `README.md`, `backend/README.md`, `frontend/README.md`
- Modify: `docs/plans/household-balance-sheet-technical-solution.md`

**Step 1: Run full verification**
- `pytest backend/tests -q`
- `npm --prefix frontend run build`

**Step 2: Address failures**
- Fix defects and rerun until clean.

**Step 3: Finalize docs**
- Document run steps, environment vars, and feature map.

**Step 4: Commit**
- Commit docs and verification fixes.
