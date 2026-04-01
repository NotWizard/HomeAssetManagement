# Remaining Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成整改清单中尚未彻底落地的剩余项，优先修正确性与发布安全，再收口边界与工程化遗留。

**Architecture:** 后端以“作用域显式语义 + 更小流程阶段”为主线；桌面端以“单一更新决策来源 + 生命周期状态机 + 安装校验/恢复”为主线；前端以“收窄 bridge 能力 + 行为测试替换源码断言”为主线。每个专题先加失败测试，再做最小实现并做专题验证。

**Tech Stack:** FastAPI、SQLAlchemy、Electron、TypeScript、React、Node `--test`、pytest

---

### Task 1: family scope 语义补全

**Files:**
- Modify: `backend/app/services/common.py`
- Modify: `backend/app/core/exceptions.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_members_api.py`
- Modify: `backend/tests/test_holdings_api.py`
- Create or Modify: `backend/tests/test_family_scope_semantics.py`

**Step 1: 写失败测试**

覆盖：
- 同 id 存在但属于其他 family 时返回不同于“实体不存在”的错误语义
- member / holding / import log 至少各覆盖一类

**Step 2: 跑测试确认失败**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_members_api.py backend/tests/test_holdings_api.py -q`
Expected: FAIL

**Step 3: 写最小实现**

在 scoped helper 中先判断“存在但不属于当前 family”，再返回更明确错误消息或错误码语义；保持现有产品约束下的 HTTP 映射一致。

**Step 4: 重新跑测试**

Run: 同 Step 2
Expected: PASS

### Task 2: 桌面更新链路单一决策源与状态机补强

**Files:**
- Create: `desktop/src/update-workflow.ts`
- Modify: `desktop/src/update-service.ts`
- Modify: `desktop/src/update-controller.ts`
- Modify: `desktop/src/preload-bridge.ts`
- Modify: `desktop/src/preload.cts`
- Modify: `frontend/src/config/runtime.ts`
- Modify: `frontend/src/components/layout/DesktopUpdateNotice.tsx`
- Modify: `desktop/tests/update-service.test.ts`
- Modify: `desktop/tests/update-controller.test.ts`
- Modify: `desktop/tests/update-main-ipc.test.ts`
- Modify: `desktop/tests/preload-bridge.test.ts`
- Modify: `frontend/tests/desktopUpdateNotice.test.ts`
- Modify: `frontend/tests/runtimeConfig.test.ts`

**Step 1: 写失败测试**

覆盖：
- 候选版本合法性、架构匹配、安装包文件名/扩展名校验
- `checking -> available -> downloading -> downloaded -> preparing -> installing -> error` 阶段流转
- 下载失败、解压失败、候选非法时的状态与清理

**Step 2: 跑失败测试**

Run: `node --test desktop/tests/update-service.test.ts desktop/tests/update-controller.test.ts desktop/tests/preload-bridge.test.ts`
Expected: FAIL

**Step 3: 写最小实现**

让候选选择、状态迁移、包校验由单一模块导出；controller 只编排副作用。bridge 仅暴露更新所需的最小入口。

**Step 4: 跑桌面与前端相关测试**

Run: `node --test desktop/tests/update-service.test.ts desktop/tests/update-controller.test.ts desktop/tests/update-main-ipc.test.ts desktop/tests/preload-bridge.test.ts`
Run: `cd frontend && node --test tests/desktopUpdateNotice.test.ts tests/runtimeConfig.test.ts`
Expected: PASS

### Task 3: preload bridge 收口

**Files:**
- Modify: `desktop/src/preload-bridge.ts`
- Modify: `desktop/src/preload.cts`
- Modify: `frontend/src/config/runtime.ts`
- Modify: `frontend/src/services/apiClient.ts`
- Modify: `frontend/src/services/imports.ts`
- Modify: `frontend/src/services/migration.ts`
- Modify: `desktop/tests/preload-bridge.test.ts`
- Modify: `frontend/tests/desktopBridge.test.ts`

**Step 1: 写失败测试**

让测试断言 bridge 仅暴露当前业务所需能力域，而不是继续扩大万能请求面。

**Step 2: 跑测试确认失败**

Run: `node --test desktop/tests/preload-bridge.test.ts`
Run: `cd frontend && node --test tests/desktopBridge.test.ts tests/runtimeConfig.test.ts`
Expected: FAIL

**Step 3: 写最小实现**

按 JSON、binary、form 上传与更新能力分组，必要时保留兼容层，但收窄渲染层可见 API。

**Step 4: 回归测试**

Run: 同 Step 2
Expected: PASS

### Task 4: 前端源码断言测试继续替换为行为测试

**Files:**
- Create: `frontend/tests/appShellState.test.ts`（如需要）
- Create: `frontend/tests/desktopUpdateNoticeState.test.ts`（如需要）
- Modify: `frontend/tests/appShell.test.ts`
- Modify: `frontend/tests/chartOptions.test.ts`
- Modify: `frontend/tests/desktopBridge.test.ts`
- Modify: `frontend/tests/desktopUpdateNotice.test.ts`

**Step 1: 写失败测试**

针对已经能抽成纯函数/配置导出的行为先写测试，不再继续加新的源码正则断言。

**Step 2: 实现最小导出**

必要时把配置或状态推导抽为纯函数模块。

**Step 3: 跑相关前端测试**

Run: `cd frontend && node --test tests/*.test.ts`
Expected: PASS

### Task 5: 后端大事务与同步流程收口

**Files:**
- Modify: `backend/app/services/import_service.py`
- Modify: `backend/app/services/settings_service.py`
- Modify: `backend/app/services/fx_service.py`
- Modify: `backend/tests/test_import_service.py`
- Modify: `backend/tests/test_holdings_api.py`
- Create or Modify: `backend/tests/test_service_pipelines.py`

**Step 1: 写失败测试**

优先锁定：
- 设置更新时“参数更新 / 汇率重算 / 快照刷新”阶段顺序
- 导入时“解析 / 计算 / 持久化 / 日志写入”阶段边界

**Step 2: 跑失败测试**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_import_service.py backend/tests/test_service_pipelines.py -q`
Expected: FAIL

**Step 3: 写最小实现**

抽出 pipeline/stage helper，让事务内只保留必要持久化阶段，计算与 IO 逻辑收口为更清晰的可测函数。

**Step 4: 回归测试**

Run: 同 Step 2
Expected: PASS

### Task 6: 全量验证

**Files:**
- Modify: none

**Step 1: 前端**

Run: `cd frontend && node --test tests/*.test.ts`
Run: `npm --prefix frontend run build`

**Step 2: 桌面**

Run: `node --test desktop/tests/*.test.ts`
Run: `npm --prefix desktop run typecheck`

**Step 3: 后端**

Run: `source .venv/bin/activate && python -m pytest backend/tests -q`

**Expected:** 全部通过；若仍有历史遗留失败，记录确切失败项与原因。
