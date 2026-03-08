# Overview / Analytics / Settings UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 去掉总览页时间筛选，修复资产负债删除后的即时刷新，并将分析看板改为日期区间筛选与更合理的图表布局，同时让设置页两张主卡片铺满可用宽度。

**Architecture:** 采用最小侵入改造：前端继续基于 React Query + Zustand 管理状态与拉取；后端在持仓创建/更新/删除时同步刷新当日 `SnapshotDaily`，保证分析接口立即读到最新数据；分析页将现有“按窗口天数”筛选升级为“按开始/结束日期”筛选，并让趋势/波动/相关性接口接受日期区间参数。

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, Zustand, TanStack React Query, Vite, Tailwind CSS, ECharts.

---

### Task 1: 修复删除后分析数据未即时更新

**Files:**
- Modify: `backend/app/services/holding_service.py`
- Test: `backend/tests/test_holdings_api.py`

**Step 1: Write the failing test**

在 `backend/tests/test_holdings_api.py` 增加一个 API 级回归测试：
- 创建成员
- 创建 1 条资产记录
- 读取 `/api/v1/analytics/trend`，确认最后一个点的 `total_asset > 0`
- 删除该资产
- 再次读取 `/api/v1/analytics/trend`，确认最后一个点的 `total_asset == 0`
- 同时校验 `/api/v1/analytics/sankey` 返回空 links/nodes 或不再包含该资产

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_holdings_api.py -q`
Expected: 新增测试失败，暴露删除只写事件快照、未刷新日快照的问题。

**Step 3: Write minimal implementation**

在 `HoldingService.create_holding`、`update_holding`、`soft_delete_holding` 中，在事件快照后同步调用 `SnapshotService.create_daily_snapshot(session)`，确保分析接口读取的 `SnapshotDaily` 立刻更新。

**Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_holdings_api.py -q`
Expected: 新增回归测试通过，原有 holdings API 测试保持通过。

### Task 2: 为分析接口增加日期区间筛选能力

**Files:**
- Modify: `backend/app/analytics/series_builder.py`
- Modify: `backend/app/api/v1/analytics.py`
- Modify: `frontend/src/services/analytics.ts`
- Modify: `frontend/src/store/uiStore.ts`

**Step 1: Write the failing test**

在 `backend/tests/test_analytics.py` 增加区间筛选测试：准备多天的 `SnapshotDaily`，请求 `/api/v1/analytics/trend?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`，只返回区间内日期；风险接口对相同区间也能正常工作。

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py -q`
Expected: 因接口尚不支持 `start_date/end_date` 而失败。

**Step 3: Write minimal implementation**

- 在 `build_daily_series` 中支持 `start_date`、`end_date` 过滤
- `trend`、`volatility`、`correlation` API 新增可选查询参数，并复用同一段日期过滤逻辑
- 前端 `analytics` service 改为传递日期区间对象
- Zustand 将 `analyticsWindow` 改为 `analyticsDateRange`

**Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py -q`
Expected: 日期区间相关测试通过。

### Task 3: 调整总览页与分析页的交互和布局

**Files:**
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/pages/AnalyticsPage.tsx`

**Step 1: Write the failing test**

当前仓库没有前端测试基础设施，因此本任务以“类型检查/构建 + 人工可核对 DOM 结构改动”为最小验证单元：
- 总览页 header 不再渲染时间筛选按钮
- 分析页右上角将窗口下拉替换为开始日期/结束日期输入
- 分析页整体概览中的趋势图和桑基图改为上下排列

**Step 2: Run verification to capture current failing expectation**

Run: `npm --prefix frontend run build`
Expected: 当前构建通过，但 UI 尚未满足需求，需要通过代码改动完成目标结构。

**Step 3: Write minimal implementation**

- 总览页移除右上角“最近 90 天”按钮与对应图标引用
- 分析页新增日期区间状态、默认区间、区间文案和原生日历输入
- 分析页整体概览布局改为单列 `space-y` / `grid gap` 纵向堆叠

**Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run build`
Expected: 构建通过，且页面结构满足需求。

### Task 4: 设置页卡片铺满页面宽度

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Step 1: Write the failing test**

同样使用构建验证配合代码结构检查：当前两张主卡片存在 `max-w-3xl`，无法铺满页面。

**Step 2: Run verification to capture current expectation**

Run: `npm --prefix frontend run build`
Expected: 构建通过，但视觉布局尚不符合需求。

**Step 3: Write minimal implementation**

移除两张主卡片的固定最大宽度约束，保留内部响应式网格，让卡片根据页面宽度自适应铺满。

**Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run build`
Expected: 构建通过，卡片宽度随页面自适应铺满。

### Task 5: 全量验证

**Files:**
- Verify only

**Step 1: Run backend targeted tests**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_holdings_api.py backend/tests/test_analytics.py -q`
Expected: 相关后端回归全部通过。

**Step 2: Run frontend build**

Run: `npm --prefix frontend run build`
Expected: TypeScript + Vite 构建通过。

**Step 3: Review changed files**

Run: `git status --short && git diff -- backend/app/services/holding_service.py backend/app/api/v1/analytics.py backend/app/analytics/series_builder.py backend/tests/test_holdings_api.py backend/tests/test_analytics.py frontend/src/pages/OverviewPage.tsx frontend/src/pages/AnalyticsPage.tsx frontend/src/pages/SettingsPage.tsx frontend/src/services/analytics.ts frontend/src/store/uiStore.ts`
Expected: 仅包含与本次需求直接相关的改动。
