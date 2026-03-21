# Web And Electron Runtime Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Web 开发模式 API 指向错误，并补齐关键页面错误态，确保 Web 与 Electron 两种启动方式都能正常工作。

**Architecture:** 保持 Electron 继续通过 preload 注入 sidecar API 地址，Web 开发模式改为明确回退到默认后端地址而不是 Vite 当前 origin。前端关键页面在查询失败时展示明确错误态，避免把请求失败误显示为“0 数据”或“默认配置”。

**Tech Stack:** React 18, Vite 6, TypeScript, TanStack Query, Electron

---

### Task 1: 固化运行时 API 基址规则

**Files:**
- Modify: `frontend/src/config/runtime.ts`
- Modify: `frontend/tests/runtimeConfig.test.ts`
- Optional: `frontend/vite.config.ts`

**Step 1: Write the failing test**

- 为 `resolveApiBaseUrl()` 增加覆盖：
- Web 开发模式访问 `http://127.0.0.1:5173` 时，应回退到 `DEFAULT_API_BASE_URL`
- 同源托管页面不是 Vite dev server 时，仍可回退到 `currentOrigin/api/v1`
- Electron runtime config 继续优先于其他来源

**Step 2: Run test to verify it fails**

Run: `cd frontend && node --test tests/runtimeConfig.test.ts`

**Step 3: Write minimal implementation**

- 调整 `resolveBrowserOrigin()` / `resolveApiBaseUrl()` 的判定逻辑
- 保证 Web dev server 不再把 `5173` 作为 API 根地址
- 不破坏 Electron preload 注入与同源托管场景

**Step 4: Run targeted verification**

Run: `cd frontend && node --test tests/runtimeConfig.test.ts`

### Task 2: 修复页面错误态，避免伪成功展示

**Files:**
- Modify: `frontend/src/pages/OverviewPage.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/pages/MembersPage.tsx`
- Modify: `frontend/tests/hardening.test.ts`

**Step 1: Write the failing test**

- 增加源码级测试，要求：
- 设置页在 `settingsQuery.isError` 时必须有明确错误提示，并避免继续展示伪成功默认值
- 总览页在关键 query 失败时不再把失败渲染成“0 数据”
- 成员页要对 `membersQuery.isError` 提供明确错误态，而不是落入空列表文案

**Step 2: Run test to verify it fails**

Run: `cd frontend && node --test tests/hardening.test.ts`

**Step 3: Write minimal implementation**

- 设置页补充加载失败提示与保存禁用
- 总览页对失败态使用占位或不可用文案，而不是 0 值
- 成员页补充 query error 展示

**Step 4: Run targeted verification**

Run: `cd frontend && node --test tests/hardening.test.ts`

### Task 3: 统一回归验证 Web 与 Electron

**Files:**
- Verify only

**Step 1: Frontend source tests**

Run: `cd frontend && node --test tests/*.test.ts`

**Step 2: Frontend build**

Run: `npm --prefix frontend run build`

**Step 3: Desktop typecheck and tests**

Run: `npm --prefix desktop run typecheck`
Run: `node --test desktop/tests/*.test.ts`

**Step 4: Browser / desktop smoke checks**

- 启动后端与前端
- 用浏览器验证总览 / 分析 / 成员 / 设置页
- 启动 Electron 开发模式或最接近的桌面验证路径，确认桌面端仍能读取 API
