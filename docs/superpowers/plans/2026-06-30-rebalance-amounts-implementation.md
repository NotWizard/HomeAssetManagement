# Rebalance Amount Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add actionable current, target, and adjustment amounts to rebalance warnings while excluding zero-target assets and blocking suggestions for invalid target totals.

**Architecture:** Keep the calculation in `backend/app/analytics/rebalance.py` as one pure function. It groups participating assets by member, validates each member's positive targets, and returns one structured result consumed unchanged by Overview and Analytics. Existing explicit normalization remains user-triggered and is narrowed to positive-target assets.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy snapshots, React 19, TypeScript, TanStack Query, Node test runner.

---

### Task 1: Backend rebalance calculation contract

**Files:**
- Modify: `backend/tests/test_rebalance_service.py`
- Modify: `backend/app/analytics/rebalance.py`

- [ ] **Step 1: Replace the old tests with failing structured-result tests**

Cover:

```python
result = compute_rebalance_items(
    [
        {"id": 1, "member_id": 10, "name": "A", "type": "asset", "amount_base": 80, "target_ratio": 50},
        {"id": 2, "member_id": 10, "name": "B", "type": "asset", "amount_base": 20, "target_ratio": 50},
        {"id": 3, "member_id": 10, "name": "Car", "type": "asset", "amount_base": 100, "target_ratio": 0},
    ],
    threshold_pct=5,
)
assert result["participating_amount"] == 100.0
assert result["excluded_amount"] == 100.0
assert result["items"][0]["current_amount"] == 80.0
assert result["items"][0]["target_amount"] == 50.0
assert result["items"][0]["adjustment_amount"] == -30.0
```

Add separate cases for invalid member target totals, no participating assets, zero participating amount, liabilities, threshold boundary, sorting, and two members with independent denominators.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/pytest backend/tests/test_rebalance_service.py -q`

Expected: failures because the function still accepts `net_asset` and returns an array without amount fields.

- [ ] **Step 3: Implement the minimal structured calculation**

Implement:

```python
def compute_rebalance_items(holdings: list[dict], threshold_pct: float) -> dict:
    # assets with target_ratio > 0 participate; zero/None assets are excluded
    # group participating assets by member_id
    # validate each member's Decimal target sum equals Decimal("100")
    # if invalid, return valid=False and items=[]
    # otherwise compute current/target/adjustment amounts per member pool
```

Return `valid`, `reason`, household participating/excluded summaries, per-member `allocations`, and threshold-filtered `items`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all rebalance service tests pass.

### Task 2: Analytics API integration

**Files:**
- Modify: `backend/tests/test_analytics.py`
- Modify: `backend/app/api/v1/analytics.py`

- [ ] **Step 1: Update the date-range API test and add invalid-config coverage**

The selected-range fixture must contain two assets with targets `50/50` and amounts `80/20`. Assert the response is a structured object, uses the selected snapshot, and includes amount fields. Add a target-total `90%` case asserting `valid=False`, `reason="invalid_target_total"`, and `items=[]`.

- [ ] **Step 2: Run the focused API tests and verify RED**

Run: `/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/pytest backend/tests/test_analytics.py -q`

Expected: rebalance assertions fail against the old array response.

- [ ] **Step 3: Update `get_rebalance`**

Remove the net-asset argument, call the structured calculator with snapshot holdings and the configured threshold, batch-load member names for IDs present in `allocations`/`items`, and attach `member_name`. For no snapshot, return a structured `no_participating_assets` result instead of `[]`.

- [ ] **Step 4: Run analytics and backend suites**

Run:

```text
/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/pytest backend/tests/test_analytics.py -q
/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/pytest backend/tests -q
```

Expected: all backend tests pass.

### Task 3: Frontend contract and rebalance presentation

**Files:**
- Modify: `frontend/tests/hardening.test.ts`
- Modify: `frontend/src/services/analytics.ts`
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/pages/AnalyticsPage.tsx`
- Modify: `frontend/src/components/analytics/RiskAnalyticsSection.tsx`

- [ ] **Step 1: Add failing frontend source-contract tests**

Assert:

```typescript
assert.match(analyticsServiceSource, /export type RebalanceData = \{/);
assert.match(analyticsServiceSource, /current_amount: number/);
assert.match(overviewSource, /建议增持|建议减持/);
assert.match(overviewSource, /participating_amount/);
assert.match(riskSource, /当前金额/);
assert.match(riskSource, /目标金额/);
assert.match(riskSource, /调整建议/);
assert.match(overviewSource, /去资产负债录入修正/);
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run from `frontend/`: `node --test tests/*.test.ts`

Expected: the new rebalance presentation assertions fail.

- [ ] **Step 3: Update types and consumers**

Define `RebalanceAllocation`, `RebalanceItem`, and `RebalanceData`; make `fetchRebalance` return `RebalanceData`. Pass the complete result into `RiskAnalyticsSection`.

- [ ] **Step 4: Implement Overview action-first cards**

Show the household participating/excluded summary. For `valid=false`, render an amber correction panel and a button navigating to `/entry`. For valid warnings, show adjustment amount as the primary value and current/target amounts plus ratios as supporting values. Preserve the existing six-card limit and error behavior.

- [ ] **Step 5: Expand the Analytics table**

Add member, adjustment suggestion, current amount, and target amount columns. Use the settings base currency supplied by `AnalyticsPage`; keep horizontal table scrolling and existing empty/error states.

- [ ] **Step 6: Run frontend tests, typecheck, and build**

Run from repository root:

```text
cd frontend && node --test tests/*.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Expected: all commands pass.

### Task 4: Entry-page exclusion semantics

**Files:**
- Modify: `frontend/tests/entryPage.test.ts`
- Modify: `frontend/tests/hardening.test.ts`
- Modify: `frontend/src/components/entry/entryPageLogic.ts`
- Modify: `frontend/src/components/entry/EntryHoldingFormDialog.tsx`
- Modify: `frontend/src/components/entry/EntryNormalizeDialog.tsx`

- [ ] **Step 1: Add failing tests for explicit exclusion**

Replace the all-zero equal-split expectation with:

```typescript
const plan = buildNormalizationPlan(zeroHoldings);
assert.equal(plan.reason, 'no_participating_assets');
assert.deepEqual(plan.items, []);
```

Add a mixed case asserting explicit normalization updates positive targets only and leaves zero/None items out. Add a source assertion for “填写 0% 或留空表示该资产不参与再平衡计算”。

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run from `frontend/`: `node --test tests/entryPage.test.ts tests/hardening.test.ts`

Expected: all-zero and helper-text assertions fail.

- [ ] **Step 3: Narrow normalization and update copy**

Filter normalization candidates to asset rows with `target_ratio > 0`. Return `no_participating_assets` when none remain. Update dialog and field helper text so zero/empty values are described as excluded and are never equal-split into the participating pool.

- [ ] **Step 4: Run frontend tests and verification**

Run:

```text
cd frontend && node --test tests/*.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Expected: 0 failures.

### Task 5: Documentation, full verification, and branch commit

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-30-rebalance-amounts-design.md`
- Add: `docs/superpowers/plans/2026-06-30-rebalance-amounts-implementation.md`

- [ ] **Step 1: Update documentation**

Replace the design-only changelog entry with the shipped behavior. Update README rebalance/normalization bullets to explain amount suggestions, zero-target exclusion, per-member `100%` validation, and explicit-only normalization.

- [ ] **Step 2: Run final worktree verification**

Run:

```text
/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/pytest backend/tests -q
cd frontend && node --test tests/*.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

- [ ] **Step 3: Review scope and commit**

Stage only intended backend, frontend, README, changelog, design, plan, and tests. Commit with the repository-required bilingual subject/body and include exact verification results.

- [ ] **Step 4: Finish branch**

Return to the main checkout, merge `codex/rebalance-amounts`, rerun backend/frontend verification on merged `main`, remove `.worktrees/rebalance-amounts`, delete the local feature branch, push `main`, and verify `main...origin/main` is `0 0`.
