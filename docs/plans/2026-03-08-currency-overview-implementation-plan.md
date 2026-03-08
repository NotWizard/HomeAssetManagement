# Currency Overview in Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构分析看板为三类二级视角，并新增“币种总览”视角，支持按币种查看资产、负债、净资产、占比和明细。

**Architecture:** 保持现有 `/analytics` 路由不变，在前端页面内部增加视角切换。后端新增一个面向最新快照的币种汇总接口，返回币种级汇总、选中币种下的资产/负债构成与明细。前端基于现有 React Query + ECharts 体系增加新的图表和表格，并将现有图表重新归类到“整体概览”和“风险与配置”中。

**Tech Stack:** FastAPI, SQLAlchemy, React, Vite, TypeScript, Zustand, TanStack Query, ECharts

---

### Task 1: 为币种汇总分析补充后端单元测试

**Files:**
- Modify: `backend/tests/test_analytics.py`
- Inspect: `backend/app/services/snapshot_service.py`
- Inspect: `backend/app/analytics/rebalance.py`

**Step 1: Write the failing tests**

在 `backend/tests/test_analytics.py` 中新增测试，覆盖：

- 输入混合币种资产与负债时，能正确按币种聚合 `total_asset`、`total_liability`、`net_asset`
- 选中币种后，能正确输出该币种的资产构成列表与负债构成列表
- 占比计算基于同币种资产总额或负债总额，分母为 0 时返回 0
- 明细项保留 `name`、`type`、`currency`、`category_path`、`amount_original`、`share_pct`

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py -q`

Expected: FAIL，因为币种汇总分析函数尚未存在。

**Step 3: Write minimal implementation**

新增一个纯函数分析模块，例如：

- `backend/app/analytics/currency_overview.py`

建议暴露函数：

- `build_currency_overview(holdings: list[dict]) -> dict`

返回结构建议：

```python
{
    "currencies": [
        {
            "currency": "USD",
            "total_asset": 1000.0,
            "total_liability": 200.0,
            "net_asset": 800.0,
            "asset_count": 2,
            "liability_count": 1,
        }
    ],
    "details": {
        "USD": {
            "summary": {...},
            "asset_breakdown": [...],
            "liability_breakdown": [...],
            "items": [...],
        }
    },
}
```

**Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py -q`

Expected: PASS

**Step 5: Commit**

不要执行，除非用户明确要求提交。

---

### Task 2: 暴露币种总览分析接口

**Files:**
- Modify: `backend/app/api/v1/analytics.py`
- Modify: `backend/tests/test_holdings_api.py`
- Inspect: `backend/app/core/response.py`
- Inspect: `backend/app/models/snapshot_daily.py`

**Step 1: Write the failing API test**

在合适的 API 测试文件中新增接口测试，覆盖：

- `GET /api/v1/analytics/currency-overview` 在无快照时返回空结构
- 在有快照时返回 `currencies` 和 `details`
- 返回的 `category_path` 使用三级分类路径，如 `股票基金 / A股 / 宽基指数基金`

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_holdings_api.py -q`

Expected: FAIL，接口尚未定义。

**Step 3: Write minimal implementation**

在 `backend/app/api/v1/analytics.py` 增加：

- `GET /analytics/currency-overview`

实现方式：

- 读取最新 `SnapshotDaily`
- 若无快照，返回空结构
- 若有快照，读取 `payload_json` 中的 `holdings`
- 调用 `build_currency_overview(...)`
- 使用现有 `ok(...)` 响应封装

**Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_holdings_api.py -q`

Expected: PASS

**Step 5: Commit**

不要执行，除非用户明确要求提交。

---

### Task 3: 扩展前端 analytics service 与页面状态

**Files:**
- Modify: `frontend/src/services/analytics.ts`
- Modify: `frontend/src/store/uiStore.ts`
- Test via build: `npm --prefix frontend run build`

**Step 1: Write the minimal TypeScript contracts**

在 `frontend/src/services/analytics.ts` 中新增：

- `CurrencySummary`
- `CurrencyBreakdownItem`
- `CurrencyOverviewData`
- `fetchCurrencyOverview()`

在 `frontend/src/store/uiStore.ts` 中新增分析页视角状态，例如：

- `analyticsView: 'overview' | 'risk' | 'currency'`
- `selectedAnalyticsCurrency: string`

**Step 2: Run type/build check to verify it fails if contracts are incomplete**

Run: `npm --prefix frontend run build`

Expected: FAIL 或类型缺失，直到页面使用方补齐。

**Step 3: Write minimal implementation**

补齐前端请求函数与状态 setter，保证页面层可以消费新接口和新视角状态。

**Step 4: Run type/build check to verify it passes**

Run: `npm --prefix frontend run build`

Expected: PASS

**Step 5: Commit**

不要执行，除非用户明确要求提交。

---

### Task 4: 重构分析看板为三类二级视角

**Files:**
- Modify: `frontend/src/pages/AnalyticsPage.tsx`
- Optionally create: `frontend/src/components/ui/segmented-control.tsx`
- Inspect: `frontend/src/components/ui/button.tsx`
- Inspect: `frontend/src/components/ui/card.tsx`

**Step 1: Write the failing UI integration via build**

先在页面中引入新的视角状态和组件占位，让旧布局不再满足类型检查。

Run: `npm --prefix frontend run build`

Expected: FAIL 或编译提示未完成重构。

**Step 2: Write minimal implementation**

将页面内容拆成三块：

- `整体概览`
  - 总资产趋势
  - 家庭资产负债桑基图
- `风险与配置`
  - 资产波动率
  - 相关性矩阵
  - 再平衡提醒
- `币种总览`
  - 先保留占位容器，等待下一任务接入完整 UI

交互要求：

- 标题、副标题改为更宽泛的分析描述
- 视角切换与筛选器布局清晰
- `整体概览` 与 `风险与配置` 才显示时间窗口选择器

**Step 3: Run build to verify it passes**

Run: `npm --prefix frontend run build`

Expected: PASS

**Step 4: Commit**

不要执行，除非用户明确要求提交。

---

### Task 5: 实现币种总览可视化与表格

**Files:**
- Modify: `frontend/src/pages/AnalyticsPage.tsx`
- Create: `frontend/src/components/charts/CurrencyExposureChart.tsx`
- Create: `frontend/src/components/charts/CurrencyBreakdownChart.tsx`
- Reuse: `frontend/src/components/ui/table.tsx`
- Reuse: `frontend/src/utils/format.ts`

**Step 1: Write the failing UI integration via build**

先在 `AnalyticsPage.tsx` 中按目标结构引用新图表组件与数据字段。

Run: `npm --prefix frontend run build`

Expected: FAIL，因为新组件与字段尚未实现。

**Step 2: Write minimal implementation**

在 `币种总览` 视角实现：

- 币种筛选器（默认选择返回列表中的第一个币种；若无数据则为空）
- 汇总卡片：总资产、总负债、净资产、条目数
- `各币种资产负债对比图`
- `选中币种资产构成图`
- `选中币种负债构成图`
- 明细表列：名称、类型、三级分类路径、原币金额、占比

视觉要求：

- 与现有 Card 风格统一
- 资产与负债的颜色语义保持稳定
- 无数据时显示清晰占位文案

**Step 3: Run build to verify it passes**

Run: `npm --prefix frontend run build`

Expected: PASS

**Step 4: Manual smoke check**

Run backend and frontend locally, then verify:

- 能切换三个视角
- 币种总览能看到多币种汇总
- 切换到某一币种后构成图与明细表同步变化
- 空状态文案自然，没有布局断裂

**Step 5: Commit**

不要执行，除非用户明确要求提交。

---

### Task 6: 验证与文档回填

**Files:**
- Modify: `docs/plans/home-asset-management-prd.md`（如需同步分析看板描述）
- Modify: `docs/plans/home-asset-management-technical-solution.md`（如需同步新增接口）
- Verify: `backend/tests/test_analytics.py`
- Verify: `backend/tests/test_holdings_api.py`

**Step 1: Run targeted backend tests**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py backend/tests/test_holdings_api.py -q`

Expected: PASS

**Step 2: Run frontend build**

Run: `npm --prefix frontend run build`

Expected: PASS

**Step 3: Update docs**

如本次实现新增了稳定接口与稳定交互，请回填：

- PRD 中的分析看板说明
- 技术方案中的 analytics API 列表

**Step 4: Final verification**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_analytics.py backend/tests/test_holdings_api.py backend/tests/test_bootstrap_categories.py backend/tests/test_categories_api.py backend/tests/test_import_service.py backend/tests/test_holdings_api.py -q && npm --prefix frontend run build`

Expected: 全部通过

**Step 5: Commit**

不要执行，除非用户明确要求提交。
