# Reliability And Brand Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复当前已确认的后端、前端、桌面端关键可靠性问题，补齐回归测试，并收敛一组更有品牌感的中英双语命名候选。

**Architecture:** 后端以“先补失败测试，再修根因”为原则，集中修复设置语义、汇率折算、成员唯一性与导入/快照行为；前端同步修复错误态、只读字段和导入/分析交互一致性；桌面端补足 sidecar 生命周期恢复能力与测试。命名部分不改代码，只在最终交付中给出品牌化的中英成对方案。

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, TanStack Query, Electron, node:test

---

### Task 1: 后端设置语义与折算口径

**Files:**
- Modify: `backend/app/schemas/settings.py`
- Modify: `backend/app/api/v1/settings.py`
- Modify: `backend/app/services/settings_service.py`
- Modify: `backend/app/services/holding_service.py`
- Modify: `backend/app/services/snapshot_service.py`
- Test: `backend/tests/test_settings_api.py`
- Test: `backend/tests/test_holdings_api.py`

**Step 1: 写失败测试**

- 增加测试覆盖：
  - `timezone` 作为只读字段，提交更新时应被拒绝。
  - `base_currency` 变更后，既有 holding 的 `amount_base` 会重算。
  - `base_currency` 变更后，最新趋势/快照会反映新口径。
  - 非基准币持仓折算应使用正确方向的汇率。

**Step 2: 运行测试并确认失败**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_settings_api.py backend/tests/test_holdings_api.py -q`

**Step 3: 写最小实现**

- 从更新 schema 中移除 `timezone`。
- 设置更新时只允许 `base_currency` 和 `rebalance_threshold_pct`。
- 当 `base_currency` 变化时：
  - 按当前持仓的 `amount_original/currency` 重算所有未删除 holding 的 `amount_base`。
  - 重建最新事件/日快照口径。
- 修正持仓折算逻辑，确保汇率方向正确。

**Step 4: 重新运行测试确认通过**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_settings_api.py backend/tests/test_holdings_api.py -q`

### Task 2: 后端成员、导入与分析序列一致性

**Files:**
- Modify: `backend/app/models/member.py`
- Modify: `backend/app/schemas/member.py`
- Modify: `backend/app/services/member_service.py`
- Modify: `backend/app/services/import_service.py`
- Modify: `backend/app/analytics/series_builder.py`
- Modify: `backend/app/api/v1/imports.py`
- Test: `backend/tests/test_holdings_api.py`
- Test: `backend/tests/test_import_service.py`
- Test: `backend/tests/test_migration_api.py`
- Test: `backend/tests/test_analytics.py`

**Step 1: 写失败测试**

- 增加测试覆盖：
  - 成员名全空格应被拒绝。
  - 成员名重复应被拒绝。
  - 同名资产不应污染 `asset_series` 结构。
  - CSV 导入不应按首条重复成员名产生歧义行为。
  - 单次 CSV 导入不应逐行膨胀事件快照。
  - 错误明细下载不存在时应走统一错误包语义。

**Step 2: 运行测试并确认失败**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_import_service.py backend/tests/test_analytics.py backend/tests/test_holdings_api.py -q`

**Step 3: 写最小实现**

- 成员名做 `strip()` 后非空校验。
- 在同一家族范围内禁止重复成员名。
- `asset_series` 改为使用稳定唯一键，展示名与内部键分离。
- CSV 导入前先拒绝歧义成员数据。
- 为批量导入增加“静默持仓写入 + 批次级单次快照”。
- 导入错误下载使用 `AppError`，遵循统一响应协议。

**Step 4: 重新运行测试确认通过**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_import_service.py backend/tests/test_analytics.py backend/tests/test_holdings_api.py -q`

### Task 3: 前端设置、错误态与导入/分析交互

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/EntryPage.tsx`
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/pages/AnalyticsPage.tsx`
- Modify: `frontend/src/pages/ImportPage.tsx`
- Modify: `frontend/src/services/analytics.ts`
- Modify: `frontend/src/services/imports.ts`
- Modify: `frontend/src/utils/format.ts`
- Test: `frontend/tests/*.test.ts`

**Step 1: 写失败测试**

- 增加源码测试覆盖：
  - 设置更新 payload 不再包含 `timezone`。
  - 页面展示折算金额时不再硬编码默认 `CNY`。
  - 录入页单条 CRUD 有错误态处理。
  - 总览/分析页对 query error 有明确展示，而不是伪装成空状态。
  - 导入页提交按钮依赖预检结果。
  - 导入日志区域支持错误明细下载入口。

**Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/*.test.ts`

**Step 3: 写最小实现**

- 设置页表单移除可提交 `timezone`，展示真实服务端时区。
- 统一在需要处传入真实 `base_currency` 来格式化折算金额。
- 为录入页单条 mutation 增加 `onError`。
- 为总览/分析页增加 query error 展示分支。
- 让分析页的时间筛选影响桑基图与再平衡请求。
- 强制“先预检后提交”，并补上错误明细下载入口。

**Step 4: 重新运行测试确认通过**

Run: `npm --prefix frontend run build && cd frontend && node --test tests/*.test.ts`

### Task 4: 桌面端启动恢复与运行期监控

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `desktop/tests/*.test.ts`

**Step 1: 写失败测试**

- 增加测试覆盖：
  - 启动失败后再次 bootstrap 会重新选端口。
  - sidecar 在启动成功后退出时能触发可感知的恢复/降级处理。
  - 开发态 Python 解释器回退接受 `python`。

**Step 2: 运行测试并确认失败**

Run: `node --test desktop/tests/*.test.ts`

**Step 3: 写最小实现**

- `stopBackend()` 失败场景下释放端口状态。
- 为 sidecar 增加 `exit/close` 生命周期监听。
- 首启注入逻辑与运行时配置保持一致。
- 开发态 Python 解释器回退与构建脚本对齐。

**Step 4: 重新运行测试确认通过**

Run: `npm --prefix desktop run typecheck && node --test desktop/tests/*.test.ts`

### Task 5: 全量验证与交付

**Files:**
- Modify: `README.md`（仅在行为语义需要同步时）

**Step 1: 运行全量验证**

Run: `source .venv/bin/activate && python -m pytest backend/tests -q`

Run: `npm --prefix frontend run build`

Run: `cd frontend && node --test tests/*.test.ts`

Run: `npm --prefix desktop run typecheck`

Run: `node --test desktop/tests/*.test.ts`

**Step 2: 检查工作区**

Run: `git status --short`

**Step 3: 准备交付说明**

- 总结修复项、验证结果、残余风险。
- 给出更有品牌感的中英双语命名候选，并说明推荐理由。
