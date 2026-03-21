# Electron Python Boundary Refinement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不迁移 Python 业务内核的前提下，收敛 Electron 与 FastAPI sidecar 的边界：桌面端由 Electron 直接加载前端资源，renderer 不再直接感知 localhost API，Python sidecar 收缩为内部业务服务。

**Architecture:** 保留 `Electron + React + FastAPI + SQLite + APScheduler` 的总体架构，不改动领域服务与 API 合约。Electron 在桌面模式下改为直接加载本地 `frontend/dist/index.html`，预加载脚本暴露桌面 API bridge，由前端服务层优先走 bridge 发请求；Python sidecar 不再依赖前端静态资源路径运行，但继续保留可选静态托管能力以兼容非桌面场景和已有测试。

**Tech Stack:** Electron, preload bridge, React Router, FastAPI, Node test runner, pytest

---

### Task 1: 为桌面模式补齐本地前端入口解析

**Files:**
- Modify: `desktop/src/config.ts`
- Modify: `desktop/tests/config.test.ts`

**Step 1: Write the failing test**

补充桌面配置测试，验证：
- 桌面配置能解析开发态与打包态的前端 `index.html` 路径
- 打包态前端入口位于 `Resources/frontend-dist/index.html`

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/config.test.ts`

Expected: FAIL，当前配置只返回前端目录，不返回前端入口文件。

**Step 3: Write minimal implementation**

在配置模块中新增本地前端入口解析字段，保留现有后端入口与数据库路径逻辑。

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/config.test.ts`

Expected: PASS

### Task 2: 让 Electron 直接加载前端资源，而不是依赖 sidecar 静态托管

**Files:**
- Modify: `desktop/src/main.ts`
- Modify: `desktop/src/bootstrap-controller.ts`
- Modify: `desktop/tests/bootstrap-controller.test.ts`

**Step 1: Write the failing test**

补充测试，验证：
- 启动流程在后端就绪后加载的是 Electron 计算出的前端入口 URL，而不是 FastAPI `appUrl`
- 启动后端时不再依赖前端静态目录注入给 Python sidecar

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/bootstrap-controller.test.ts`

Expected: FAIL，当前启动流程会把窗口直接指向本地 HTTP 服务。

**Step 3: Write minimal implementation**

实现：
- 启动后端仍保留健康检查与异常恢复
- 窗口改为加载 `file://.../frontend-dist/index.html`
- 仅保留后端业务环境变量，不再把前端静态目录作为桌面运行时必需输入

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/bootstrap-controller.test.ts`

Expected: PASS

### Task 3: 为 preload 暴露桌面 API bridge

**Files:**
- Modify: `desktop/src/preload.ts`
- Create: `desktop/tests/preload-bridge.test.ts`
- Modify: `frontend/src/types/runtime-config.d.ts`

**Step 1: Write the failing test**

补充测试，验证：
- preload 会暴露桌面模式标识
- preload 会暴露 JSON 请求桥与表单请求桥
- 现有重试启动能力仍然保留

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/preload-bridge.test.ts`

Expected: FAIL，当前 preload 只有运行时 config 和 retry 能力。

**Step 3: Write minimal implementation**

通过 preload 暴露：
- `isDesktop`
- `requestJson(path, init)`
- `postForm(path, formData)`
- `retryBootstrap()`

桥内部自己解析 API 基地址并发起请求，不把 localhost 细节泄露到 renderer。

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/preload-bridge.test.ts`

Expected: PASS

### Task 4: 让前端服务层优先走桌面 bridge，并切换桌面路由模式

**Files:**
- Modify: `frontend/src/services/apiClient.ts`
- Modify: `frontend/src/config/runtime.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/tests/runtimeConfig.test.ts`
- Modify: `frontend/tests/appShell.test.ts`
- Create: `frontend/tests/desktopBridge.test.ts`

**Step 1: Write the failing test**

补充前端测试，验证：
- 服务层在桌面模式下优先使用 bridge，而不是 `getApiBaseUrl()`
- 桌面模式使用 `HashRouter`
- Web 模式仍保留 `BrowserRouter`

**Step 2: Run test to verify it fails**

Run: `cd frontend && node --test tests/runtimeConfig.test.ts tests/appShell.test.ts tests/desktopBridge.test.ts`

Expected: FAIL，当前服务层与路由仍基于直连 HTTP 假设。

**Step 3: Write minimal implementation**

实现：
- API client 优先调用 `window.__HBS_DESKTOP__`
- 保持 Web 模式 fallback 到现有 HTTP 地址解析
- 桌面模式改用 `HashRouter`，避免 `file://` 下的刷新与路径问题

**Step 4: Run test to verify it passes**

Run: `cd frontend && node --test tests/runtimeConfig.test.ts tests/appShell.test.ts tests/desktopBridge.test.ts`

Expected: PASS

### Task 5: 完整验证桌面边界收敛

**Files:**
- Verify only

**Step 1: Run focused verification**

Run:
- `node --test desktop/tests/*.test.ts`
- `cd frontend && node --test tests/*.test.ts`
- `npm --prefix desktop run typecheck`
- `npm --prefix frontend run build`
- `/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/python -m pytest backend/tests/test_desktop_build.py -q`

Expected:
- 桌面测试全部通过
- 前端源码测试全部通过
- TypeScript 与前端构建通过
- 后端桌面构建测试通过

**Step 2: Smoke test packaging path**

Run: `npm --prefix desktop run make:dmg:arm64`

Expected:
- 仍能成功生成桌面安装包
- 打包后窗口入口仍基于本地前端资源，不再依赖 sidecar 静态托管
