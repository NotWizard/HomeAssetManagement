# Electron Desktop Packaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前本地 Web 项目改造成可面向非技术用户分发的 macOS Electron 桌面应用基础版本，先不处理代码签名与 notarization。

**Architecture:** 保留现有 `FastAPI + React + SQLite` 业务结构，由 Electron 作为桌面壳层负责启动本地后端、打开窗口、管理用户数据目录与打包产物。后端新增可选的前端静态资源托管能力，前端新增运行时配置注入能力，桌面端通过环境变量和 preload 把运行参数传给现有应用。

**Tech Stack:** FastAPI, React, Vite, TypeScript, Electron, Electron Forge, SQLite

---

### Task 1: 为桌面模式补齐后端静态托管能力

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_desktop_static_hosting.py`

**Step 1: Write the failing test**

验证配置了前端构建目录后，后端可以：
- 返回 `/` 的 `index.html`
- 返回前端资源文件
- 对任意前端路由回退到 `index.html`

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_desktop_static_hosting.py -q`

Expected: FAIL，因为当前后端还不会托管前端静态资源。

**Step 3: Write minimal implementation**

在 `Settings` 中增加可选的 `frontend_dist_dir` 配置，并在 `FastAPI` 应用中按配置注册 SPA 静态托管与回退逻辑。

**Step 4: Run test to verify it passes**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_desktop_static_hosting.py -q`

Expected: PASS

### Task 2: 为前端补齐运行时 API 配置注入

**Files:**
- Create: `frontend/src/config/runtime.ts`
- Create: `frontend/src/types/runtime-config.d.ts`
- Modify: `frontend/src/services/apiClient.ts`
- Modify: `frontend/src/services/migration.ts`
- Create: `frontend/tests/runtimeConfig.test.ts`

**Step 1: Write the failing test**

验证前端可以优先读取桌面壳注入的运行时 API 地址，并在缺失时回退到 `VITE_API_BASE_URL` 或默认值。

**Step 2: Run test to verify it fails**

Run: `cd frontend && node --test tests/runtimeConfig.test.ts`

Expected: FAIL，因为当前前端没有统一的运行时配置入口。

**Step 3: Write minimal implementation**

新增运行时配置模块，让服务层统一经由 helper 解析 API Base URL。

**Step 4: Run test to verify it passes**

Run: `cd frontend && node --test tests/runtimeConfig.test.ts`

Expected: PASS

### Task 3: 新增桌面端后端启动与环境拼装模块

**Files:**
- Create: `desktop/src/config.ts`
- Create: `desktop/tests/config.test.ts`

**Step 1: Write the failing test**

验证桌面端可以：
- 生成用户数据目录下的 SQLite 路径
- 生成后端需要的环境变量
- 解析开发模式与打包模式下的前端/后端路径

**Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/config.test.ts`

Expected: FAIL，因为 `desktop/` 目录尚不存在。

**Step 3: Write minimal implementation**

新增纯函数配置模块，避免 Electron 主进程里堆积过多路径和环境变量逻辑。

**Step 4: Run test to verify it passes**

Run: `cd desktop && node --test tests/config.test.ts`

Expected: PASS

### Task 4: 接入 Electron 主进程、preload 与打包配置

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/forge.config.ts`
- Create: `desktop/src/main.ts`
- Create: `desktop/src/preload.ts`

**Step 1: Write the failing test**

验证桌面主进程配置模块后，可以从纯函数层得到主进程启动需要的参数；主进程本身先以最小骨架接入，不在这一任务里引入复杂 UI 自动化测试。

**Step 2: Run test to verify it fails**

Run: `cd desktop && node --test tests/config.test.ts`

Expected: FAIL（来自 Task 3）

**Step 3: Write minimal implementation**

实现：
- 单实例锁
- 本地后端子进程拉起
- 健康检查轮询
- BrowserWindow 打开本地应用
- preload 注入运行时配置
- Forge 产出 `zip + dmg`

**Step 4: Run verification**

Run:
- `cd desktop && node --test tests/config.test.ts`
- `npm --prefix frontend run build`

Expected:
- 配置测试通过
- 前端构建成功

### Task 5: 补充桌面交付脚本与文档占位

**Files:**
- Create: `backend/desktop_server.py`
- Modify: `.gitignore`
- Modify: `README.md`

**Step 1: Write the failing test**

为桌面后端入口补最小可验证行为，确保它基于环境变量启动而不是写死仓库路径。

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest backend/tests/test_desktop_static_hosting.py -q`

Expected: FAIL（如果入口与静态托管行为未完成）

**Step 3: Write minimal implementation**

补充桌面启动入口、忽略桌面构建产物、为后续手册预留 README 说明段落。

**Step 4: Run end-to-end verification**

Run:
- `source .venv/bin/activate && python -m pytest backend/tests -q`
- `cd frontend && node --test tests/runtimeConfig.test.ts tests/appShell.test.ts`
- `npm --prefix frontend run build`
- `cd desktop && node --test tests/config.test.ts`

Expected:
- 后端测试通过
- 前端运行时配置相关测试通过
- 前端构建通过
- 桌面配置测试通过
